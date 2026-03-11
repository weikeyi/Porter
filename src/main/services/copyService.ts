import { ensureDir, pathExists, remove } from 'fs-extra';
import { dirname, join } from 'node:path';
import log from '../logger';
import type { CopyOutcome, CopyProgress, DetailConfig, RangeScanReport } from '../types';

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
  readonly signal?: AbortSignal;
}

export interface ProcessOptions extends CopyOptions {
  readonly operation?: 'copy' | 'move' | 'delete';
}

function createProgressEmitter(
  progressCallback: ((progress: CopyProgress) => void) | undefined,
  startTime: number,
  totalFiles: number,
  getTotalBytes: () => number,
  getProcessedBytes: () => number,
  getProcessedFiles: () => number
) {
  return function emitProgress(
    stage: CopyProgress['stage'],
    options: {
      currentFile?: string;
      currentFileIndex?: number;
      partialFileProgress?: number;
      errorMessage?: string;
    } = {}
  ) {
    if (!progressCallback) {
      return;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const processedBytes = getProcessedBytes();
    const processedFiles = getProcessedFiles();
    const totalBytes = getTotalBytes();

    const speed = processedBytes > 0 && elapsed > 0 ? processedBytes / elapsed : 0;
    const percentageBase =
      stage === 'completed'
        ? totalFiles
        : Math.min(totalFiles, processedFiles + (options.partialFileProgress ?? 0));

    progressCallback({
      stage,
      currentFile: options.currentFile,
      currentFileIndex:
        options.currentFileIndex ?? (stage === 'completed' ? totalFiles : processedFiles),
      totalFiles,
      bytesCopied: processedBytes,
      totalBytes,
      speedBytesPerSecond: speed,
      elapsedSeconds: elapsed,
      estimatedRemainingSeconds:
        totalBytes > processedBytes && speed > 0 ? (totalBytes - processedBytes) / speed : undefined,
      percentage: totalFiles > 0 ? (percentageBase / totalFiles) * 100 : stage === 'completed' ? 100 : 0,
      errorMessage: options.errorMessage
    });
  };
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
  const logLabel = move ? 'move' : 'copy';

  const copied: CopyOutcome['copied'] = [];
  const skippedExists: CopyOutcome['skippedExists'] = [];
  const missing: CopyOutcome['missing'] = [];
  const failed: CopyOutcome['failed'] = [];

  if (!detail.rangeTargetPath) {
    throw new Error('未设置目标目录，无法执行复制。');
  }

  const filesToProcess = scanReport.findings.filter((finding) => finding.status === 'exists');
  const totalFiles = filesToProcess.length;
  let totalBytes = filesToProcess.reduce((sum, finding) => {
    const [match] = finding.matches;
    return sum + (match?.sizeInBytes || 0);
  }, 0);
  let bytesCopied = 0;
  let processedFiles = 0;

  const emitProgress = createProgressEmitter(
    progressCallback,
    startTime,
    totalFiles,
    () => totalBytes,
    () => bytesCopied,
    () => processedFiles
  );

  emitProgress('preparing');

  for (let index = 0; index < scanReport.findings.length; index++) {
    if (options.signal?.aborted) {
      throw new DOMException('Operation aborted by user', 'AbortError');
    }

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
        const currentFileName = match?.name ?? finding.directory;
        const currentFilePath = match?.sourcePath;
        const currentFileSize = match?.sizeInBytes ?? 0;
        let copiedForCurrentFile = 0;
        let destination = detail.rangeTargetPath ? join(detail.rangeTargetPath, currentFileName) : '';

        emitProgress('copying', {
          currentFile: currentFileName,
          currentFileIndex: Math.min(processedFiles + 1, totalFiles)
        });

        if (!match) {
          failed.push({
            name: finding.directory,
            reason: '扫描结果异常，未找到目录。'
          });
        } else {
          try {
            const alreadyExists = await pathExists(destination);
            if (alreadyExists && purgeTargetFirst) {
              await remove(destination);
              log.warn('[copy] 已清理目标目录:', destination);
            }

            if (alreadyExists && !overwrite && !purgeTargetFirst) {
              skippedExists.push({
                ...match,
                targetPath: destination
              });
              totalBytes = Math.max(bytesCopied, totalBytes - currentFileSize);
              log.warn('[copy] 跳过已存在目录:', destination);
            } else {
              const parentDir = dirname(destination);
              const shouldMoveViaRobocopy = move && (!alreadyExists || purgeTargetFirst || !overwrite);

              await ensureDir(parentDir);
              await copyDirectoryWithProgress(
                currentFilePath,
                destination,
                currentFileSize,
                (chunkBytes) => {
                  copiedForCurrentFile += chunkBytes;
                  bytesCopied += chunkBytes;
                  const partialFileProgress =
                    currentFileSize > 0 ? Math.min(copiedForCurrentFile / currentFileSize, 1) : 0;

                  emitProgress('copying', {
                    currentFile: currentFileName,
                    currentFileIndex: Math.min(processedFiles + 1, totalFiles),
                    partialFileProgress
                  });
                },
                {
                  move: shouldMoveViaRobocopy
                }
              );

              if (move && !shouldMoveViaRobocopy) {
                try {
                  await remove(currentFilePath);
                  log.info('[move] 已删除源目录:', currentFilePath);
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : '未知错误';
                  throw new Error(`已复制到目标，但删除源目录失败: ${message}`);
                }
              }

              copied.push({
                ...match,
                targetPath: destination
              });
              log.info(`[${logLabel}] 完成:`, match.sourcePath, '->', destination);
            }
          } catch (error) {
            totalBytes = Math.max(
              bytesCopied,
              totalBytes - Math.max(0, currentFileSize - copiedForCurrentFile)
            );
            log.error(`[${logLabel}] 失败:`, currentFilePath, '->', destination, error);
            failed.push({
              name: finding.directory,
              reason: error instanceof Error ? error.message : '未知错误'
            });
          }
        }

        processedFiles += 1;
        emitProgress('copying', {
          currentFile: currentFileName,
          currentFileIndex: processedFiles
        });
        break;
      }
    }
  }

  emitProgress('completed', {
    currentFileIndex: totalFiles
  });

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
  let totalBytes = deletable.reduce((sum, finding) => {
    const [match] = finding.matches;
    return sum + (match?.sizeInBytes || 0);
  }, 0);
  let bytesDeleted = 0;
  let processedFiles = 0;

  const emitProgress = createProgressEmitter(
    progressCallback,
    startTime,
    totalFiles,
    () => totalBytes,
    () => bytesDeleted,
    () => processedFiles
  );

  emitProgress('preparing');

  for (let index = 0; index < scanReport.findings.length; index++) {
    if (options.signal?.aborted) {
      throw new DOMException('Operation aborted by user', 'AbortError');
    }

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
        const currentFileName = match?.name ?? finding.directory;
        const currentFileSize = match?.sizeInBytes ?? 0;

        emitProgress('copying', {
          currentFile: currentFileName,
          currentFileIndex: Math.min(processedFiles + 1, totalFiles)
        });

        if (!match) {
          failed.push({
            name: finding.directory,
            reason: '扫描结果异常，未找到目录。'
          });
        } else {
          try {
            await remove(match.sourcePath);
            bytesDeleted += currentFileSize;
            copied.push({
              ...match,
              targetPath: match.sourcePath
            });
            log.info('[delete] 完成:', match.sourcePath);
          } catch (error) {
            totalBytes = Math.max(bytesDeleted, totalBytes - currentFileSize);
            log.error('[delete] 失败:', match.sourcePath, error);
            failed.push({
              name: finding.directory,
              reason: error instanceof Error ? error.message : '未知错误'
            });
          }
        }

        processedFiles += 1;
        emitProgress('copying', {
          currentFile: currentFileName,
          currentFileIndex: processedFiles
        });
        break;
      }
    }
  }

  emitProgress('completed', {
    currentFileIndex: totalFiles
  });

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
  directorySize: number,
  onProgress: (bytes: number) => void,
  options: {
    readonly move?: boolean;
    readonly signal?: AbortSignal;
  } = {}
): Promise<void> {
  const move = options.move ?? false;

  try {
    onProgress(0);

    await execRobocopy(source, destination, {
      threads: 32,
      move,
      signal: options.signal
    });

    onProgress(directorySize);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      log.warn(`[copy] Robocopy aborted for ${source}`);
      throw err;
    }
    log.error(`[copy] Robocopy failed for ${source}`, err);
    throw err;
  }
}
