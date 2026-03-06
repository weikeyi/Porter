import { readFile, stat, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { DetailConfig, ParsedMainConfig } from '../types';

export interface ParseOptions {
  readonly sourceRoot: string;
  readonly targetRoot?: string;
  readonly ignoreCase?: boolean;
}

const COMMENT_RE = /^\s*(#|\/\/)/;
const SIMPLE_HEADER_TOKENS = new Set([
  'tile_name',
  'name',
  'folder',
  'path',
  'directory',
  'dir',
  'source',
  'target',
  'file',
  '名称',
  '目录',
  '路径',
  '文件名',
  '文件夹'
]);
const ENGLISH_HEADER_RE = /\b(tile_name|name|folder|path|directory|dir|source|target|file)\b/i;
const CHINESE_HEADER_RE = /(名称|目录|路径|文件名|文件夹)/;

export function normalizePathCasing(value: string, ignoreCase: boolean | undefined): string {
  return ignoreCase ? value.toLowerCase() : value;
}

export function createNameNormalizer(ignoreCase: boolean | undefined) {
  return (value: string) => normalizePathCasing(value, ignoreCase);
}

function sanitizeLine(line: string): string {
  return line.replace(/\r?\n$/, '').trim();
}

function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (SIMPLE_HEADER_TOKENS.has(lower) || SIMPLE_HEADER_TOKENS.has(trimmed)) {
    return true;
  }

  const hasDelimiter = /[,\t;]/.test(trimmed);
  if (!hasDelimiter) {
    return false;
  }

  return ENGLISH_HEADER_RE.test(lower) || CHINESE_HEADER_RE.test(trimmed);
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

  if (lines.length > 0 && isHeaderLine(lines[0])) {
    lines = lines.slice(1);
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
    supportsRangeDiscovery: true,
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

  let isDirectory = false;
  try {
    const stats = await stat(mainConfigPath);
    isDirectory = stats.isDirectory();
  } catch {
    return {
      mainConfigPath,
      detailConfigs: [],
      errors: [`主配置文件/目录不存在: ${mainConfigPath}`]
    };
  }

  if (isDirectory) {
    // 目录直接模式：读取子目录作为列表
    const entries = await readdir(mainConfigPath, { withFileTypes: true });
    // 过滤出目录名
    const directoryNames = entries
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (directoryNames.length === 0) {
      errors.push(`选定的配置目录为空或不包含子目录: ${mainConfigPath}`);
    } else {
      const dirName = basename(mainConfigPath);
      // 直接使用目录名作为 RangeLabel
      const rangeLabel = extractRangeLabelFromName(dirName) || dirName;

      const directConfig: DetailConfig = {
        configPath: mainConfigPath,
        rangeLabel: rangeLabel,
        rangeSourcePath: sourceRoot, // 直接基于源根目录
        rangeTargetPath: targetRoot, // 直接基于目标根目录
        supportsRangeDiscovery: false,
        directoryNames: directoryNames,
        matchKeys: directoryNames.map(createNameNormalizer(ignoreCase))
      };

      detailConfigs.push(directConfig);
    }

    return {
      mainConfigPath,
      detailConfigs,
      errors
    };
  }

  // --- 以下为原有文件处理逻辑 ---

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

  // 仅当所有条目都不是现有文件时，才视为直接清单，避免把格式错误的主配置静默当成目录列表。
  const isDirectListMode = entries.length > 0 && missingFileCount === entries.length;

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
      supportsRangeDiscovery: false,
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

