import path from 'node:path';
import { pathExists } from 'fs-extra';
import log from '../logger';
import type {
  CopyOutcome,
  CopyProgress,
  ParsedMainConfig,
  PreflightReport,
  PreflightResult,
  TileCopyJobRequest
} from '../types';
import { parseMainConfig } from './configLoader';
import { processRange } from './copyService';
import { scanDetailRange } from './scanner';
import type { EventEmitter } from 'node:events';

export class TileCopyEngine {
  private lastConfig: ParsedMainConfig | null = null;
  private lastConfigSignature: string | null = null;
  private lastPreflight: PreflightReport[] = [];
  private lastPreflightSignature: string | null = null;
  private progressEmitter: EventEmitter | null = null;
  private isRunning: boolean = false;
  private currentAbortController: AbortController | null = null;

  setProgressEmitter(emitter: EventEmitter) {
    this.progressEmitter = emitter;
  }

  cancelCurrentJob() {
    if (this.isRunning && this.currentAbortController) {
      log.info('[engine] 接收到取消请求，正在终止当前任务...');
      this.currentAbortController.abort();
    } else {
      log.warn('[engine] 当前没有正在运行的任务，无法取消。');
    }
  }

  private async loadConfig(request: TileCopyJobRequest): Promise<ParsedMainConfig> {
    this.validatePaths(request);

    const configSignature = this.createConfigSignature(request);
    log.info('[engine] 解析主配置:', request.mainConfigPath);
    this.lastConfig = await parseMainConfig(request.mainConfigPath, {
      sourceRoot: request.sourceRoot,
      targetRoot: request.operation === 'delete' ? undefined : request.targetRoot,
      ignoreCase: request.ignoreCase
    });
    this.lastConfigSignature = configSignature;

    if (this.lastConfig?.errors.length > 0) {
      log.warn('[engine] 配置存在警告:', this.lastConfig.errors);
    }

    return this.lastConfig;
  }

  private async ensureConfig(request: TileCopyJobRequest): Promise<ParsedMainConfig> {
    const configSignature = this.createConfigSignature(request);
    if (this.lastConfig && this.lastConfigSignature === configSignature) {
      return this.lastConfig;
    }

    return this.loadConfig(request);
  }

  async preflight(request: TileCopyJobRequest): Promise<PreflightResult> {
    if (this.isRunning) {
      throw new Error('当前已有复制任务正在运行，不能执行分析（Preflight）。请等待其完成后再试。');
    }

    const config = await this.ensureConfig(request);
    const preflightSignature = this.createPreflightSignature(request);
    const reports: PreflightReport[] = [];

    for (const detail of config.detailConfigs) {
      const scan = await scanDetailRange(detail, {
        ignoreCase: request.ignoreCase,
        measureSize: request.measureSize,
        discoverRangeSubRoot: request.discoverRangeSubRoot,
        discoveryMaxDepth: request.discoveryMaxDepth
      });

      reports.push({
        detail,
        scan
      });
    }

    this.lastPreflight = reports;
    this.lastPreflightSignature = preflightSignature;
    return {
      config,
      reports
    };
  }

  async executeCopy(request: TileCopyJobRequest): Promise<CopyOutcome[]> {
    if (this.isRunning) {
      throw new Error('当前已有复制/删除任务正在进行中，请等待其完成后再试。');
    }
    
    this.isRunning = true;
    this.currentAbortController = new AbortController();

    try {
      const configSignature = this.createConfigSignature(request);
      const preflightSignature = this.createPreflightSignature(request);
      const hasMatchingPreflight =
        this.lastPreflight.length > 0 &&
        this.lastPreflightSignature === preflightSignature &&
        this.lastConfig !== null &&
        this.lastConfigSignature === configSignature;
      const preflight = hasMatchingPreflight
        ? this.lastPreflight
        : (await this.preflight(request)).reports;
      const config = await this.ensureConfig(request);
      if (config.errors.length > 0) {
        throw new Error(`配置存在错误，请先修复后再执行。首条错误：${config.errors[0]}`);
      }
      const results: CopyOutcome[] = [];

      // 计算全局总文件数与总字节数（仅统计可复制的 exists 项）
    const rangeTotals = preflight.map((report) => {
      const existsFindings = report.scan.findings.filter((f) => f.status === 'exists');
      const files = existsFindings.length;
      const bytes = existsFindings.reduce((sum, f) => sum + (f.matches[0]?.sizeInBytes || 0), 0);
      return { files, bytes };
    });

    const globalTotalFiles = rangeTotals.reduce((acc, t) => acc + t.files, 0);
    const globalTotalBytes = rangeTotals.reduce((acc, t) => acc + t.bytes, 0);
    const remainingBytesAfterRange = new Array<number>(rangeTotals.length).fill(0);
    let suffixBytes = 0;
    for (let i = rangeTotals.length - 1; i >= 0; i -= 1) {
      remainingBytesAfterRange[i] = suffixBytes;
      suffixBytes += rangeTotals[i].bytes;
    }

    const startTime = Date.now();
    let baseFilesCompleted = 0;
    let baseBytesCopied = 0;
    let baseBytesBudget = 0;
    let latestAggregatedProgress: CopyProgress | null = null;

    // 发出一次初始化的全局准备进度
    if (this.progressEmitter) {
      const initial: CopyProgress = {
        stage: 'preparing',
        bytesCopied: 0,
        totalBytes: globalTotalBytes,
        elapsedSeconds: 0,
        percentage: 0,
      };
      this.progressEmitter.emit('progress', initial);
    }

    for (let i = 0; i < preflight.length; i++) {
      const report = preflight[i];
      let latestRangeProgress: CopyProgress | null = null;

      // 为当前区间创建包装后的聚合进度回调
      const isLastRange = i === preflight.length - 1;
      const progressCallback = this.progressEmitter
        ? (progress: CopyProgress) => {
            latestRangeProgress = progress;
            const elapsed = (Date.now() - startTime) / 1000;
            const bytesCopiedGlobal = baseBytesCopied + progress.bytesCopied;
            const totalBytesGlobal =
              baseBytesBudget + progress.totalBytes + remainingBytesAfterRange[i];
            const speed = bytesCopiedGlobal > 0 && elapsed > 0 ? bytesCopiedGlobal / elapsed : undefined;
            const currentIndex = baseFilesCompleted + (progress.currentFileIndex ?? 0);
            const percentage =
              globalTotalFiles > 0 ? (currentIndex / globalTotalFiles) * 100 : progress.stage === 'completed' ? 100 : 0;

            const aggregated: CopyProgress = {
              stage: progress.stage === 'completed' && isLastRange ? 'completed' : progress.stage === 'preparing' ? 'preparing' : 'copying',
              currentFile: progress.currentFile,
              currentFileIndex: currentIndex,
              totalFiles: globalTotalFiles,
              bytesCopied: bytesCopiedGlobal,
              totalBytes: totalBytesGlobal,
              speedBytesPerSecond: speed,
              elapsedSeconds: elapsed,
              estimatedRemainingSeconds:
                totalBytesGlobal > bytesCopiedGlobal && speed && speed > 0
                  ? (totalBytesGlobal - bytesCopiedGlobal) / speed
                  : undefined,
              percentage,
              errorMessage: progress.errorMessage,
            };

            latestAggregatedProgress = aggregated;
            this.progressEmitter?.emit('progress', aggregated);
          }
        : undefined;

      const outcome = await processRange(report.detail, report.scan, {
        overwrite: request.overwrite,
        purgeTargetFirst: request.purgeTargetFirst,
        operation: request.operation,
        progressCallback,
        signal: this.currentAbortController.signal
      });

      // 累加已完成的基数（以便后续区间的全局进度计算）
      baseFilesCompleted += rangeTotals[i].files;
      const finalizedRangeProgress: CopyProgress =
        latestRangeProgress ?? {
          stage: 'completed',
          currentFileIndex: rangeTotals[i].files,
          totalFiles: rangeTotals[i].files,
          bytesCopied: 0,
          totalBytes: rangeTotals[i].bytes,
          elapsedSeconds: 0,
          percentage: 100
        };
      baseBytesCopied += finalizedRangeProgress.bytesCopied;
      baseBytesBudget += finalizedRangeProgress.totalBytes;

      results.push(outcome);
    }

    // 所有区间完成后，补发一次全局完成进度，确保 100%
    if (this.progressEmitter) {
      const elapsed = (Date.now() - startTime) / 1000;
      const finalAggregatedProgress: CopyProgress =
        latestAggregatedProgress ?? {
          stage: 'completed',
          currentFileIndex: globalTotalFiles,
          totalFiles: globalTotalFiles,
          bytesCopied: baseBytesCopied,
          totalBytes: baseBytesBudget,
          elapsedSeconds: elapsed,
          percentage: 100
        };
      const finalBytesCopied = finalAggregatedProgress.bytesCopied;
      const finalTotalBytes = finalAggregatedProgress.totalBytes;
      const finalProgress: CopyProgress = {
        stage: 'completed',
        currentFileIndex: globalTotalFiles,
        totalFiles: globalTotalFiles,
        bytesCopied: finalBytesCopied,
        totalBytes: finalTotalBytes,
        speedBytesPerSecond:
          finalBytesCopied > 0 && elapsed > 0
            ? finalBytesCopied / elapsed
            : 0,
        elapsedSeconds: elapsed,
        percentage: 100,
      };
      this.progressEmitter.emit('progress', finalProgress);
      }

      return results;
    } finally {
      this.isRunning = false;
      this.currentAbortController = null;
    }
  }

  private validatePaths(request: TileCopyJobRequest) {
    if (!path.isAbsolute(request.mainConfigPath)) {
      throw new Error('主配置文件路径必须为绝对路径。');
    }

    if (!path.isAbsolute(request.sourceRoot)) {
      throw new Error('源目录路径必须为绝对路径。');
    }

    if (request.operation !== 'delete' && !path.isAbsolute(request.targetRoot)) {
      throw new Error('目标目录路径必须为绝对路径。');
    }
  }

  async pathsAccessible(request: TileCopyJobRequest) {
    const [mainExists, sourceExists] = await Promise.all([
      pathExists(request.mainConfigPath),
      pathExists(request.sourceRoot)
    ]);
    const targetExists =
      request.operation === 'delete' ? true : await pathExists(request.targetRoot);

    return {
      mainExists,
      sourceExists,
      targetExists
    };
  }

  private createConfigSignature(request: TileCopyJobRequest) {
    return JSON.stringify({
      mainConfigPath: request.mainConfigPath,
      sourceRoot: request.sourceRoot,
      targetRoot: request.operation === 'delete' ? '' : request.targetRoot,
      ignoreCase: request.ignoreCase,
      operation: request.operation
    });
  }

  private createPreflightSignature(request: TileCopyJobRequest) {
    return JSON.stringify({
      configSignature: this.createConfigSignature(request),
      measureSize: request.measureSize,
      discoverRangeSubRoot: request.discoverRangeSubRoot ?? false,
      discoveryMaxDepth: request.discoveryMaxDepth ?? null,
      operation: request.operation
    });
  }
}

export const tileCopyEngine = new TileCopyEngine();

