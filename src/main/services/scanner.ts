import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DetailConfig, DirectoryMatch, RangeScanReport, ScanFinding } from '../types';
import { createNameNormalizer } from './configLoader';

export interface ScanOptions {
  readonly ignoreDirectories?: string[];
  readonly ignoreCase?: boolean;
  readonly maxDepth?: number;
  readonly measureSize?: boolean;
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
  const stack: Array<{ path: string; depth: number }> = [
    { path: detail.rangeSourcePath, depth: 0 }
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
          const metadata = await stat(absolute);
          const size = options.measureSize === false
            ? 0
            : (metadata.isDirectory() ? await calculateDirectorySize(absolute) : 0);
          const match: DirectoryMatch = {
            name: entry.name,
            sourcePath: absolute,
            sizeInBytes: size,
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

  return matches;
}

export async function scanDetailRange(
  detail: DetailConfig,
  options: ScanOptions = {}
): Promise<RangeScanReport> {
  const matches = await collectMatches(detail, {
    ignoreCase: options.ignoreCase ?? false,
    ignoreDirectories: options.ignoreDirectories,
    maxDepth: options.maxDepth,
    measureSize: options.measureSize
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
    rangeSourcePath: detail.rangeSourcePath,
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
