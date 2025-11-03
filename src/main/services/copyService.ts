import { copy, ensureDir, pathExists } from 'fs-extra';
import { dirname, join } from 'node:path';
import log from '../logger';
import type { CopyOutcome, DetailConfig, RangeScanReport } from '../types';

export interface CopyOptions {
  readonly overwrite?: boolean;
}

export async function copyRange(
  detail: DetailConfig,
  scanReport: RangeScanReport,
  options: CopyOptions = {}
): Promise<CopyOutcome> {
  const overwrite = options.overwrite ?? false;
  const copied: CopyOutcome['copied'] = [];
  const skippedExists: CopyOutcome['skippedExists'] = [];
  const missing: CopyOutcome['missing'] = [];
  const failed: CopyOutcome['failed'] = [];

  if (!detail.rangeTargetPath) {
    throw new Error('未设置目标目录，无法执行复制。');
  }

  for (const finding of scanReport.findings) {
    switch (finding.status) {
      case 'missing': {
        missing.push(finding.directory);
        break;
      }
      case 'duplicate': {
        failed.push({
          name: finding.directory,
          reason: '检测到重复匹配目录，请手动确认后再试。'
        });
        break;
      }
      case 'exists': {
        const [match] = finding.matches;
        if (!match) {
          failed.push({
            name: finding.directory,
            reason: '扫描结果异常，未找到目录。'
          });
          break;
        }

        const destination = join(detail.rangeTargetPath, match.name);
        const parentDir = dirname(destination);

        try {
          const alreadyExists = await pathExists(destination);
          if (alreadyExists && !overwrite) {
            skippedExists.push({
              ...match,
              targetPath: destination
            });
            log.warn('[copy] 跳过已存在目录:', destination);
            break;
          }

          await ensureDir(parentDir);
          await copy(match.sourcePath, destination, {
            overwrite,
            errorOnExist: !overwrite,
            filter: (src) => !src.endsWith('.git') && !src.includes('node_modules')
          });

          copied.push({
            ...match,
            targetPath: destination
          });
          log.info('[copy] 完成:', match.sourcePath, '->', destination);
        } catch (error) {
          log.error('[copy] 失败:', match.sourcePath, '->', destination, error);
          failed.push({
            name: finding.directory,
            reason: error instanceof Error ? error.message : '未知错误'
          });
        }
        break;
      }
    }
  }

  return {
    detail,
    copied,
    skippedExists,
    missing,
    failed
  };
}
