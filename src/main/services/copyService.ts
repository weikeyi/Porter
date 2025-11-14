import { createReadStream, createWriteStream, ensureDir, pathExists } from 'fs-extra';
import { dirname, join, basename } from 'node:path';
import log from '../logger';
import type { CopyOutcome, CopyProgress, DetailConfig, RangeScanReport } from '../types';
import type { EventEmitter } from 'node:events';

/**
 * copyService.ts
 *
 * 负责将扫描结果中标记为可复制的目录，从源路径复制到指定的范围目标目录。
 * 支持实时进度报告，包括复制速度、剩余时间等。
 * 使用 Node.js 流式复制以跟踪复制进度。
 */

export interface CopyOptions {
  readonly overwrite?: boolean;
  readonly progressCallback?: (progress: CopyProgress) => void;
}

export async function copyRange(
  detail: DetailConfig,
  scanReport: RangeScanReport,
  options: CopyOptions = {}
): Promise<CopyOutcome> {
  const progressCallback = options.progressCallback;
  const overwrite = options.overwrite ?? false;
  const startTime = Date.now();

  // 结果汇总数组，按项目结构填充
  const copied: CopyOutcome['copied'] = [];
  const skippedExists: CopyOutcome['skippedExists'] = [];
  const missing: CopyOutcome['missing'] = [];
  const failed: CopyOutcome['failed'] = [];

  // 目标路径必须存在于 detail 中，否则直接失败
  if (!detail.rangeTargetPath) {
    throw new Error('未设置目标目录，无法执行复制。');
  }

  // 计算需要复制的总文件数和总大小
  const filesToCopy = scanReport.findings.filter(f => f.status === 'exists');
  const totalFiles = filesToCopy.length;
  const totalBytes = filesToCopy.reduce((sum, finding) => {
    const [match] = finding.matches;
    return sum + (match?.sizeInBytes || 0);
  }, 0);

  let bytesCopied = 0;

  // 发送初始进度
  if (progressCallback) {
    progressCallback({
      stage: 'preparing',
      bytesCopied: 0,
      totalBytes,
      elapsedSeconds: 0,
      percentage: 0
    });
  }

  // 遍历扫描结果中的每个发现项（finding），按状态处理
  for (let index = 0; index < scanReport.findings.length; index++) {
    const finding = scanReport.findings[index];
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

        const currentFileName = match.name;
        const currentFilePath = match.sourcePath;
        const currentFileSize = match.sizeInBytes;

        // 发送开始复制当前文件的消息
        if (progressCallback) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = bytesCopied > 0 ? bytesCopied / elapsed : 0;
          progressCallback({
            stage: 'copying',
            currentFile: currentFileName,
            currentFileIndex: index,
            totalFiles,
            bytesCopied,
            totalBytes,
            speedBytesPerSecond: speed,
            elapsedSeconds: elapsed,
            estimatedRemainingSeconds: speed > 0 ? (totalBytes - bytesCopied) / speed : undefined,
            percentage: totalBytes > 0 ? (bytesCopied / totalBytes) * 100 : 0
          });
        }

        // 计算目标路径：在目标根目录下创建 Data 子目录，再放置 match.name
        const destination = join(dirname(detail.rangeTargetPath), 'Data', match.name);
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

            // 更新进度（跳过也算完成这个文件）
            bytesCopied += currentFileSize;
            if (progressCallback) {
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = bytesCopied > 0 ? bytesCopied / elapsed : 0;
              progressCallback({
                stage: 'copying',
                currentFile: currentFileName,
                currentFileIndex: index + 1,
                totalFiles,
                bytesCopied,
                totalBytes,
                speedBytesPerSecond: speed,
                elapsedSeconds: elapsed,
                estimatedRemainingSeconds: speed > 0 ? (totalBytes - bytesCopied) / speed : undefined,
                percentage: totalBytes > 0 ? (bytesCopied / totalBytes) * 100 : 0
              });
            }
            break;
          }

          // 确保父目录存在，然后执行复制（流式复制以支持进度）
          await ensureDir(parentDir);
          await copyDirectoryWithProgress(
            currentFilePath,
            destination,
            overwrite,
            currentFileSize,
            (chunkBytes) => {
              bytesCopied += chunkBytes;
              if (progressCallback) {
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = bytesCopied > 0 ? bytesCopied / elapsed : 0;
                progressCallback({
                  stage: 'copying',
                  currentFile: currentFileName,
                  currentFileIndex: index,
                  totalFiles,
                  bytesCopied,
                  totalBytes,
                  speedBytesPerSecond: speed,
                  elapsedSeconds: elapsed,
                  estimatedRemainingSeconds: speed > 0 ? (totalBytes - bytesCopied) / speed : undefined,
                  percentage: totalBytes > 0 ? (bytesCopied / totalBytes) * 100 : 0
                });
              }
            }
          );

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

  // 发送完成进度
  if (progressCallback) {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = bytesCopied > 0 ? bytesCopied / elapsed : 0;
    progressCallback({
      stage: 'completed',
      currentFileIndex: totalFiles,
      totalFiles,
      bytesCopied,
      totalBytes,
      speedBytesPerSecond: speed,
      elapsedSeconds: elapsed,
      percentage: 100
    });
  }

  return {
    detail,
    copied,
    skippedExists,
    missing,
    failed
  };
}

// 流式复制函数，支持进度回调
async function copyDirectoryWithProgress(
  source: string,
  destination: string,
  overwrite: boolean,
  directorySize: number,
  onProgress: (bytes: number) => void
): Promise<void> {
  // 对于目录，我们仍然使用 fs-extra.copy，但通过统计目录大小来更新进度
  // 这里简化处理，假设目录复制是原子的，我们只更新一次进度
  // 实际项目中可以使用更复杂的实现，如递归文件复制

  return new Promise((resolve, reject) => {
    // 发送开始复制信号
    onProgress(0);

    // 使用简单的 copy，然后模拟进度更新
    import('fs-extra').then(({ copy, pathExists }) => {
      // 检查是否已存在
      pathExists(destination).then(alreadyExists => {
        if (alreadyExists && !overwrite) {
          // 如果不覆盖，复制会失败，我们捕获这个错误
          copy(source, destination, {
            overwrite,
            errorOnExist: true,
            filter: (src) => !src.endsWith('.git') && !src.includes('node_modules')
          }).then(() => {
            onProgress(directorySize);
            resolve();
          }).catch(err => {
            reject(err);
          });
        } else {
          // 正常复制
          copy(source, destination, {
            overwrite,
            filter: (src) => !src.endsWith('.git') && !src.includes('node_modules')
          }).then(() => {
            onProgress(directorySize);
            resolve();
          }).catch(err => {
            reject(err);
          });
        }
      });
    });
  });
}
