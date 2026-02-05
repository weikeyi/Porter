import { createReadStream, createWriteStream, ensureDir, pathExists, remove } from 'fs-extra';
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
  readonly purgeTargetFirst?: boolean;
  readonly progressCallback?: (progress: CopyProgress) => void;
  readonly move?: boolean;
}

export interface ProcessOptions extends CopyOptions {
  readonly operation?: 'copy' | 'move' | 'delete';
}

export async function processRange(
  detail: DetailConfig,
  scanReport: RangeScanReport,
  options: ProcessOptions = {}
): Promise<CopyOutcome> {
  const operation = options.operation ?? 'copy';

  if (operation === 'delete') {
    return deleteRange(detail, scanReport, options);
  }

  return copyRange(detail, scanReport, {
    ...options,
    move: operation === 'move'
  });
}

export async function copyRange(
  detail: DetailConfig,
  scanReport: RangeScanReport,
  options: CopyOptions = {}
): Promise<CopyOutcome> {
  const progressCallback = options.progressCallback;
  const overwrite = options.overwrite ?? false;
  const purgeTargetFirst = options.purgeTargetFirst ?? false;
  const move = options.move ?? false;
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
          if (alreadyExists && purgeTargetFirst) {
            try {
              await remove(destination);
              log.warn('[copy] 已清理目标目录:', destination);
            } catch (error) {
              log.error('[copy] 清理目标目录失败:', destination, error);
              failed.push({
                name: finding.directory,
                reason: error instanceof Error ? error.message : '清理目标目录失败'
              });
              break;
            }
          } else if (alreadyExists && !overwrite) {
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
            },
            move
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

async function deleteRange(
  detail: DetailConfig,
  scanReport: RangeScanReport,
  options: CopyOptions = {}
): Promise<CopyOutcome> {
  const progressCallback = options.progressCallback;
  const startTime = Date.now();

  const copied: CopyOutcome['copied'] = [];
  const skippedExists: CopyOutcome['skippedExists'] = [];
  const missing: CopyOutcome['missing'] = [];
  const failed: CopyOutcome['failed'] = [];

  const deletable = scanReport.findings.filter((f) => f.status === 'exists');
  const totalFiles = deletable.length;
  const totalBytes = deletable.reduce((sum, finding) => {
    const [match] = finding.matches;
    return sum + (match?.sizeInBytes || 0);
  }, 0);

  let bytesDeleted = 0;

  if (progressCallback) {
    progressCallback({
      stage: 'preparing',
      bytesCopied: 0,
      totalBytes,
      elapsedSeconds: 0,
      percentage: 0
    });
  }

  for (let index = 0; index < scanReport.findings.length; index++) {
    const finding = scanReport.findings[index];
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

        const currentFileName = match.name;

        if (progressCallback) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = bytesDeleted > 0 ? bytesDeleted / elapsed : 0;
          progressCallback({
            stage: 'copying',
            currentFile: currentFileName,
            currentFileIndex: index,
            totalFiles,
            bytesCopied: bytesDeleted,
            totalBytes,
            speedBytesPerSecond: speed,
            elapsedSeconds: elapsed,
            estimatedRemainingSeconds:
              totalBytes > 0 && speed > 0 ? (totalBytes - bytesDeleted) / speed : undefined,
            percentage:
              totalBytes > 0
                ? (bytesDeleted / totalBytes) * 100
                : totalFiles > 0
                ? (index / totalFiles) * 100
                : 0
          });
        }

        try {
          await remove(match.sourcePath);
          bytesDeleted += match.sizeInBytes || 0;
          copied.push({
            ...match,
            targetPath: match.sourcePath
          });
          log.info('[delete] 完成:', match.sourcePath);
        } catch (error) {
          log.error('[delete] 失败:', match.sourcePath, error);
          failed.push({
            name: finding.directory,
            reason: error instanceof Error ? error.message : '未知错误'
          });
        }

        if (progressCallback) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = bytesDeleted > 0 ? bytesDeleted / elapsed : 0;
          const completedIndex = index + 1;
          progressCallback({
            stage: 'copying',
            currentFile: currentFileName,
            currentFileIndex: completedIndex,
            totalFiles,
            bytesCopied: bytesDeleted,
            totalBytes,
            speedBytesPerSecond: speed,
            elapsedSeconds: elapsed,
            estimatedRemainingSeconds:
              totalBytes > 0 && speed > 0 ? (totalBytes - bytesDeleted) / speed : undefined,
            percentage:
              totalBytes > 0
                ? (bytesDeleted / totalBytes) * 100
                : totalFiles > 0
                ? (completedIndex / totalFiles) * 100
                : 0
          });
        }
        break;
      }
    }
  }

  if (progressCallback) {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = bytesDeleted > 0 ? bytesDeleted / elapsed : 0;
    progressCallback({
      stage: 'completed',
      currentFileIndex: totalFiles,
      totalFiles,
      bytesCopied: bytesDeleted,
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

// 替换为 Robocopy 实现
import { execRobocopy } from './robocopyAdapter';

async function copyDirectoryWithProgress(
  source: string,
  destination: string,
  overwrite: boolean,
  directorySize: number,
  onProgress: (bytes: number) => void,
  move = false
): Promise<void> {
  const start = Date.now();

  // 对于 directorySize 很小的目录，Robocopy 的启动开销可能比复制本身还大
  // 但为了简化逻辑和统一性，这里全部交给 Robocopy (除了空目录)

  try {
    // 确保目标父级存在 (Robocopy 会自动创建目标目录本身，但以防万一)
    // await ensureDir(destination); // Robocopy creates the dir

    // 通知开始
    onProgress(0);

    // 执行 Robocopy
    // overwrite 标志在这里对应的主要是 /MIR (镜像) 还是 /E (普通复制)
    // 我们的业务逻辑是 "Merge/Update"，所以始终用 /E 即可。
    // Robocopy 默认行为就是：如果源比目标新，则覆盖；否则跳过。这符合大多数 "overwrite=true" 的直觉。
    // 如果 overwrite=false，我们很难在目录级别精确控制 "完全不覆盖任何文件"，
    // 除非用 /XC (Exclude Changed) /XN (Exclude Newer) /XO (Exclude Older)。
    // 简化起见，这里假设 overwrite=true 意为 "允许更新"，overwrite=false 意为 "通过上层逻辑跳过已存在的目录"。
    // *注意*：上层 copyRange 已经根据 "overwrite" 和 "alreadyExists" 做了目录级的跳过判断。
    // 所以进入这个函数时，意味着我们要么是新建目录，要么是确实需要合并/覆盖。

    await execRobocopy(source, destination, {
      threads: 32,
      move
    });

    // 完成后，一次性增加进度
    onProgress(directorySize);

    // log.info(`[copy] Robocopy finished for ${basename(destination)} in ${Date.now() - start}ms`);

  } catch (err) {
    log.error(`[copy] Robocopy failed for ${source}`, err);
    throw err;
  }
}
