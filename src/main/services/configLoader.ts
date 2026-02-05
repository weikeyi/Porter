import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { DetailConfig, ParsedMainConfig } from '../types';

export interface ParseOptions {
  readonly sourceRoot: string;
  readonly targetRoot?: string;
  readonly ignoreCase?: boolean;
}

const COMMENT_RE = /^\s*(#|\/\/)/;

export function normalizePathCasing(value: string, ignoreCase: boolean | undefined): string {
  return ignoreCase ? value.toLowerCase() : value;
}

export function createNameNormalizer(ignoreCase: boolean | undefined) {
  return (value: string) => normalizePathCasing(value, ignoreCase);
}

function sanitizeLine(line: string): string {
  return line.replace(/\r?\n$/, '').trim();
}

export function extractRangeLabelFromName(fileName: string): string | null {
  const name = fileName.replace(extname(fileName), '');
  const tileExportMatch = /^Tile_Export_(.+)$/.exec(name);
  if (tileExportMatch && tileExportMatch[1].trim().length > 0) {
    return tileExportMatch[1].trim();
  }

  const explicit = /(\d+\s*-\s*\d+)/.exec(name);
  if (explicit) {
    return explicit[1].replace(/\s+/g, '');
  }

  const trailing = /_([\d-]+)$/.exec(name);
  return trailing ? trailing[1] : null;
}

async function ensureFileExists(filePath: string): Promise<boolean> {
  try {
    const metadata = await stat(filePath);
    return metadata.isFile();
  } catch {
    return false;
  }
}

async function readConfigEntries(filePath: string): Promise<string[]> {
  const raw = await readFile(filePath, 'utf8');
  let lines = raw
    .split(/\r?\n/)
    .map(sanitizeLine)
    .filter((line) => line.length > 0 && !COMMENT_RE.test(line));

  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    // 智能识别标题行：如果包含常见表头关键字，则认为是标题并移除
    // 关键词：tile_name, name, folder
    // 同时也为了避免误伤真实目录名 (虽然很少有目录叫 Name/Folder，但为了保险，我们只匹配特定模式)
    // 这里采用简单字符串包含匹配，因为对于 CSV/TXT 标题行，通常就是单纯的字段名
    if (
      firstLine.includes('tile_name') ||
      firstLine === 'name' ||
      firstLine === 'folder' ||
      firstLine.startsWith('name,') || // CSV 情况
      firstLine.startsWith('folder,')
    ) {
      lines = lines.slice(1);
    }
  }

  return lines;
}

async function parseDetailConfig(
  filePath: string,
  sourceRoot: string,
  targetRoot: string | undefined,
  ignoreCase: boolean | undefined
): Promise<DetailConfig | null> {
  const fileName = basename(filePath);
  const rangeLabel = extractRangeLabelFromName(fileName);

  if (!rangeLabel) {
    return null;
  }

  const rangeSourcePath = join(sourceRoot, rangeLabel);
  const rangeTargetPath = targetRoot ? join(targetRoot, rangeLabel) : undefined;
  const directoryNames = await readConfigEntries(filePath);
  const matchKeys = directoryNames.map((entry) => normalizePathCasing(entry, ignoreCase));

  return {
    configPath: filePath,
    rangeLabel,
    rangeSourcePath,
    rangeTargetPath,
    directoryNames,
    matchKeys
  };
}

export async function parseMainConfig(
  mainConfigPath: string,
  options: ParseOptions
): Promise<ParsedMainConfig> {
  const { sourceRoot, targetRoot, ignoreCase } = options;
  const detailConfigs: DetailConfig[] = [];
  const errors: string[] = [];

  if (!(await ensureFileExists(mainConfigPath))) {
    return {
      mainConfigPath,
      detailConfigs: [],
      errors: [`主配置文件不存在: ${mainConfigPath}`]
    };
  }

  const configDir = dirname(mainConfigPath);
  const entries = await readConfigEntries(mainConfigPath);

  if (entries.length === 0) {
    return {
      mainConfigPath,
      detailConfigs: [],
      errors: ['配置文件为空']
    };
  }

  // 第一步：尝试检测是否为“直接清单模式” (Direct List Mode)
  // 如果大多数条目在 configDir 下找不到对应的文件，我们假设这是直接的目录列表
  let missingFileCount = 0;
  for (const entry of entries) {
    const potentialPath = join(configDir, entry);
    if (!(await ensureFileExists(potentialPath))) {
      missingFileCount++;
    }
  }

  // 启发式判断：如果超过 80% 的条目都不是文件，或者所有条目都不是文件，则认为是直接清单
  const isDirectListMode = entries.length > 0 && (missingFileCount / entries.length) > 0.8;

  if (isDirectListMode) {
    // 直接清单模式：把整个主配置视为一个大的 DetailConfig
    const mainFileName = basename(mainConfigPath);
    // 使用文件名作为 RangeLabel，移除扩展名，如果格式像 Tile_Export_XXX 则提取 XXX
    const rangeLabel = extractRangeLabelFromName(mainFileName) || mainFileName.replace(extname(mainFileName), '');

    const directConfig: DetailConfig = {
      configPath: mainConfigPath,
      rangeLabel: rangeLabel,
      rangeSourcePath: sourceRoot, // 直接基于源根目录
      rangeTargetPath: targetRoot, // 直接基于目标根目录
      directoryNames: entries,
      matchKeys: entries.map(createNameNormalizer(ignoreCase))
    };

    detailConfigs.push(directConfig);
  } else {
    // 原始逻辑：嵌套模式
    for (const entry of entries) {
      const detailPath = join(configDir, entry);
      if (!(await ensureFileExists(detailPath))) {
        errors.push(`分配置文件缺失: ${detailPath}`);
        continue;
      }

      const parsed = await parseDetailConfig(detailPath, sourceRoot, targetRoot, ignoreCase);
      if (!parsed) {
        errors.push(`无法从文件名解析区间标签: ${detailPath}`);
        continue;
      }

      detailConfigs.push(parsed);
    }
  }

  return {
    mainConfigPath,
    detailConfigs,
    errors
  };
}
