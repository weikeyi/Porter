import { copy, ensureDir, pathExists } from 'fs-extra';
import { dirname, join } from 'node:path';
import log from '../logger';
import type { CopyOutcome, DetailConfig, RangeScanReport } from '../types';

/**
 * copyService.ts
 *
 * 负责将扫描结果中标记为可复制的目录，从源路径复制到指定的范围目标目录。
 * 这里使用 fs-extra 的 copy/ensureDir/pathExists 来处理文件系统操作，并且
 * 在关键步骤记录日志以及在遇到异常时返回可供上层显示的失败信息。
 */

export interface CopyOptions {
  readonly overwrite?: boolean;
}

export async function copyRange(
  detail: DetailConfig,
  scanReport: RangeScanReport,
  options: CopyOptions = {}
): Promise<CopyOutcome> {
  // 是否覆盖已存在目标目录，默认为 false（不覆盖）
  const overwrite = options.overwrite ?? false;

  // 结果汇总数组，按项目结构填充
  const copied: CopyOutcome['copied'] = [];
  const skippedExists: CopyOutcome['skippedExists'] = [];
  const missing: CopyOutcome['missing'] = [];
  const failed: CopyOutcome['failed'] = [];

  // 目标路径必须存在于 detail 中，否则直接失败
  if (!detail.rangeTargetPath) {
    throw new Error('未设置目标目录，无法执行复制。');
  }

  // 遍历扫描结果中的每个发现项（finding），按状态处理
  for (const finding of scanReport.findings) {
    switch (finding.status) {
      // 源目录缺失，记录并继续
      case 'missing': {
        missing.push(finding.directory);
        break;
      }

      // 重复匹配：扫描期望只有一个匹配但找到了多个或冲突，标记为失败
      case 'duplicate': {
        failed.push({
          name: finding.directory,
          reason: '检测到重复匹配目录，请手动确认后再试。'
        });
        break;
      }

      // 存在可复制的匹配项，执行复制逻辑
      case 'exists': {
        // 取第一个匹配项（scan 产生的 matches），若不存在则视为异常
        const [match] = finding.matches;
        if (!match) {
          failed.push({
            name: finding.directory,
            reason: '扫描结果异常，未找到目录。'
          });
          break;
        }

        // 计算目标路径（在 rangeTargetPath 下创建与 match.name 对应的目录）
        const targetRootDir = dirname(detail.rangeTargetPath);
const destination = join(targetRootDir, match.name);
        console.log('detail:', detail);
        console.log('rangeTargetPath:', detail.rangeTargetPath);
        console.log('name:', match.name);
        console.log('Copying to destination:', destination);
        const parentDir = dirname(destination);

        try {
          // 检查目标是否已存在；如果存在且不允许覆盖，则跳过并记录
          const alreadyExists = await pathExists(destination);
          if (alreadyExists && !overwrite) {
            skippedExists.push({
              ...match,
              targetPath: destination
            });
            log.warn('[copy] 跳过已存在目录:', destination);
            break;
          }

          // 确保父目录存在，然后执行复制。copy 使用 filter 排除 .git 和 node_modules
          await ensureDir(parentDir);
          await copy(match.sourcePath, destination, {
            overwrite,
            // 如果不覆盖，copy 在已存在时应当抛错，由我们的逻辑捕获并标记为失败
            errorOnExist: !overwrite,
            filter: (src) => !src.endsWith('.git') && !src.includes('node_modules')
          });

          // 复制成功，记录目标路径以供上层展示
          copied.push({
            ...match,
            targetPath: destination
          });
          log.info('[copy] 完成:', match.sourcePath, '->', destination);
        } catch (error) {
          // 记录错误并将该项标记为失败，保留错误信息用于诊断
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
