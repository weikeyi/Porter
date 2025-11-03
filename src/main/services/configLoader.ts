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
  return raw
    .split(/\r?\n/)
    .map(sanitizeLine)
    .filter((line) => line.length > 0 && !COMMENT_RE.test(line));
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

  return {
    mainConfigPath,
    detailConfigs,
    errors
  };
}
