import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { DetailConfig, DirectoryMatch, RangeScanReport, ScanFinding } from '../types';
import { createNameNormalizer } from './configLoader';

export interface ScanOptions {
  readonly ignoreDirectories?: string[];
  readonly ignoreCase?: boolean;
  readonly maxDepth?: number;
  readonly measureSize?: boolean;
  readonly discoverRangeSubRoot?: boolean;
  readonly discoveryMaxDepth?: number;
  readonly rootPath?: string;
}

const DEFAULT_IGNORES = new Set(['.git', 'node_modules', '.svn', '.hg']);

async function calculateDirectorySize(directory: string): Promise<number> {
  let total = 0;
  const queue: string[] = [directory];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
      } else if (entry.isFile()) {
        const metadata = await stat(absolute);
        total += metadata.size;
      }
    }
  }

  return total;
}

async function collectMatches(
  detail: DetailConfig,
  options: Required<Pick<ScanOptions, 'ignoreCase'>> & ScanOptions
): Promise<Map<string, DirectoryMatch[]>> {
  const normalizer = createNameNormalizer(options.ignoreCase);
  const matches = new Map<string, DirectoryMatch[]>();
  const ignoreSet = new Set([
    ...DEFAULT_IGNORES,
    ...(options.ignoreDirectories ?? [])
  ].map((item) => normalizer(item)));

  const targetKeys = new Set(detail.matchKeys);
  const startRoot = options.rootPath ?? detail.rangeSourcePath;
  const stack: Array<{ path: string; depth: number }> = [
    { path: startRoot, depth: 0 }
  ];
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }

    const { path, depth } = current;
    const dirEntries = await readdir(path, { withFileTypes: true });

    for (const entry of dirEntries) {
      const normalizedName = normalizer(entry.name);
      if (ignoreSet.has(normalizedName)) {
        continue;
      }

      const absolute = join(path, entry.name);

      if (entry.isDirectory()) {
        if (depth + 1 <= maxDepth) {
          stack.push({ path: absolute, depth: depth + 1 });
        }

        if (targetKeys.has(normalizedName)) {
          if (options.measureSize === false) {
            const match: DirectoryMatch = {
              name: entry.name,
              sourcePath: absolute,
              sizeInBytes: 0,
              lastModified: 0
            };
            const bucket = matches.get(normalizedName);
            if (bucket) {
              bucket.push(match);
            } else {
              matches.set(normalizedName, [match]);
            }
          } else {
            const metadata = await stat(absolute);
            const match: DirectoryMatch = {
              name: entry.name,
              sourcePath: absolute,
              sizeInBytes: metadata.isDirectory() ? await calculateDirectorySize(absolute) : 0,
              lastModified: metadata.mtimeMs
            };
            const bucket = matches.get(normalizedName);
            if (bucket) {
              bucket.push(match);
            } else {
              matches.set(normalizedName, [match]);
            }
          }
        }
      }
    }
  }

  return matches;
}

export async function scanDetailRange(
  detail: DetailConfig,
  options: ScanOptions = {}
): Promise<RangeScanReport> {
  async function directoryExists(path: string): Promise<boolean> {
    try {
      const s = await stat(path);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  // 计算实际扫描根：支持动态发现子根目录
  const sourceRootParent = dirname(detail.rangeSourcePath);
  let effectiveRoot = detail.rangeSourcePath;
  if (options.discoverRangeSubRoot) {
    const discovered = await discoverSubRoot(sourceRootParent, detail.rangeLabel, {
      ignoreCase: options.ignoreCase ?? false,
      ignoreDirectories: options.ignoreDirectories,
      discoveryMaxDepth: options.discoveryMaxDepth ?? 4
    });
    if (discovered) {
      effectiveRoot = discovered;
    } else {
      // 未找到子根，直接返回全部缺失的报告
      const findings: ScanFinding[] = detail.directoryNames.map((name) => ({
        directory: name,
        status: 'missing',
        matches: []
      }));
      return {
        rangeLabel: detail.rangeLabel,
        rangeSourcePath: effectiveRoot,
        requestedNames: detail.directoryNames,
        findings,
        summary: {
          totalRequested: detail.directoryNames.length,
          matched: 0,
          missing: detail.directoryNames.length,
          duplicates: 0
        }
      };
    }
  }

  // 如果有效根不存在，尝试回退到动态发现（即使未开启发现）
  if (!(await directoryExists(effectiveRoot))) {
    const discovered = await discoverSubRoot(sourceRootParent, detail.rangeLabel, {
      ignoreCase: options.ignoreCase ?? false,
      ignoreDirectories: options.ignoreDirectories,
      discoveryMaxDepth: options.discoveryMaxDepth ?? 4
    });
    if (discovered) {
      effectiveRoot = discovered;
    } else {
      const findings: ScanFinding[] = detail.directoryNames.map((name) => ({
        directory: name,
        status: 'missing',
        matches: []
      }));
      return {
        rangeLabel: detail.rangeLabel,
        rangeSourcePath: effectiveRoot,
        requestedNames: detail.directoryNames,
        findings,
        summary: {
          totalRequested: detail.directoryNames.length,
          matched: 0,
          missing: detail.directoryNames.length,
          duplicates: 0
        }
      };
    }
  }

  const matches = await collectMatches(detail, {
    ignoreCase: options.ignoreCase ?? false,
    ignoreDirectories: options.ignoreDirectories,
    maxDepth: options.maxDepth,
    measureSize: options.measureSize,
    rootPath: effectiveRoot
  });

  const findings: ScanFinding[] = [];
  let matched = 0;
  let missing = 0;
  let duplicates = 0;

  for (let index = 0; index < detail.directoryNames.length; index += 1) {
    const name = detail.directoryNames[index];
    const key = detail.matchKeys[index];
    const matchList = matches.get(key) ?? [];

    if (matchList.length === 0) {
      missing += 1;
      findings.push({
        directory: name,
        status: 'missing',
        matches: []
      });
      continue;
    }

    if (matchList.length > 1) {
      duplicates += 1;
      findings.push({
        directory: name,
        status: 'duplicate',
        matches: matchList
      });
    } else {
      matched += 1;
      findings.push({
        directory: name,
        status: 'exists',
        matches: matchList
      });
    }
  }

  return {
    rangeLabel: detail.rangeLabel,
    rangeSourcePath: effectiveRoot,
    requestedNames: detail.directoryNames,
    findings,
    summary: {
      totalRequested: detail.directoryNames.length,
      matched,
      missing,
      duplicates
    }
  };
}

async function discoverSubRoot(
  startRoot: string,
  rangeLabel: string,
  options: Pick<ScanOptions, 'ignoreDirectories' | 'ignoreCase' | 'discoveryMaxDepth'>
): Promise<string | null> {
  const normalizer = createNameNormalizer(options.ignoreCase);
  const target = normalizer(rangeLabel);
  const ignoreSet = new Set([
    ...DEFAULT_IGNORES,
    ...(options.ignoreDirectories ?? [])
  ].map((item) => normalizer(item)));

  const queue: Array<{ path: string; depth: number }> = [{ path: startRoot, depth: 0 }];
  const maxDepth = options.discoveryMaxDepth ?? 4;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { path, depth } = current;
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const normalizedName = normalizer(entry.name);
      if (ignoreSet.has(normalizedName)) continue;
      const absolute = join(path, entry.name);
      // 首次命中直接返回
      if (normalizedName === target) {
        return absolute;
      }
      if (depth + 1 <= maxDepth) {
        queue.push({ path: absolute, depth: depth + 1 });
      }
    }
  }
  return null;
}
