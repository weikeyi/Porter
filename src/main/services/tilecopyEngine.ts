import path from 'node:path';
import { pathExists } from 'fs-extra';
import log from '../logger';
import type {
  CopyOutcome,
  CopyProgress,
  ParsedMainConfig,
  PreflightReport,
  TileCopyJobRequest
} from '../types';
import { parseMainConfig } from './configLoader';
import { processRange } from './copyService';
import { scanDetailRange } from './scanner';
import type { EventEmitter } from 'node:events';

export class TileCopyEngine {
  private lastConfig: ParsedMainConfig | null = null;
  private lastPreflight: PreflightReport[] = [];
  private progressEmitter: EventEmitter | null = null;

  setProgressEmitter(emitter: EventEmitter) {
    this.progressEmitter = emitter;
  }

  async loadConfig(request: TileCopyJobRequest): Promise<ParsedMainConfig> {
    this.validatePaths(request);

    log.info('[engine] 解析主配置:', request.mainConfigPath);
    this.lastConfig = await parseMainConfig(request.mainConfigPath, {
      sourceRoot: request.sourceRoot,
      targetRoot: request.operation === 'delete' ? undefined : request.targetRoot,
      ignoreCase: request.ignoreCase
    });

    if (this.lastConfig.errors.length > 0) {
      log.warn('[engine] 配置存在警告:', this.lastConfig.errors);
    }

    return this.lastConfig;
  }

  async preflight(request: TileCopyJobRequest): Promise<PreflightReport[]> {
    const config = this.lastConfig ?? (await this.loadConfig(request));
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
    return reports;
  }

  async executeCopy(request: TileCopyJobRequest): Promise<CopyOutcome[]> {
    const preflight = this.lastPreflight.length > 0 ? this.lastPreflight : await this.preflight(request);
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

    const startTime = Date.now();
    let baseFilesCompleted = 0;
    let baseBytesCopied = 0;

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

      // 为当前区间创建包装后的聚合进度回调
      const isLastRange = i === preflight.length - 1;
      const progressCallback = this.progressEmitter
        ? (progress: CopyProgress) => {
            const elapsed = (Date.now() - startTime) / 1000;
            const bytesCopiedGlobal = baseBytesCopied + progress.bytesCopied;
            const hasBytes = globalTotalBytes > 0;
            const speed = hasBytes && bytesCopiedGlobal > 0 ? bytesCopiedGlobal / elapsed : undefined;
            const currentIndex = baseFilesCompleted + (progress.currentFileIndex ?? 0);
            const percentage = hasBytes
              ? (bytesCopiedGlobal / globalTotalBytes) * 100
              : (globalTotalFiles > 0 ? (currentIndex / globalTotalFiles) * 100 : 0);

            const aggregated: CopyProgress = {
              stage: progress.stage === 'completed' && isLastRange ? 'completed' : progress.stage === 'preparing' ? 'preparing' : 'copying',
              currentFile: progress.currentFile,
              currentFileIndex: currentIndex,
              totalFiles: globalTotalFiles,
              bytesCopied: bytesCopiedGlobal,
              totalBytes: globalTotalBytes,
              speedBytesPerSecond: speed,
              elapsedSeconds: elapsed,
              estimatedRemainingSeconds: hasBytes && speed && speed > 0 ? (globalTotalBytes - bytesCopiedGlobal) / speed : undefined,
              percentage,
              errorMessage: progress.errorMessage,
            };

            this.progressEmitter?.emit('progress', aggregated);
          }
        : undefined;

      const outcome = await processRange(report.detail, report.scan, {
        overwrite: request.overwrite,
        purgeTargetFirst: request.purgeTargetFirst,
        operation: request.operation,
        progressCallback,
      });

      // 累加已完成的基数（以便后续区间的全局进度计算）
      baseFilesCompleted += rangeTotals[i].files;
      baseBytesCopied += rangeTotals[i].bytes;

      results.push(outcome);
    }

    // 所有区间完成后，补发一次全局完成进度，确保 100%
    if (this.progressEmitter) {
      const elapsed = (Date.now() - startTime) / 1000;
      const finalProgress: CopyProgress = {
        stage: 'completed',
        currentFileIndex: globalTotalFiles,
        totalFiles: globalTotalFiles,
        bytesCopied: globalTotalBytes,
        totalBytes: globalTotalBytes,
        speedBytesPerSecond: globalTotalBytes > 0 ? globalTotalBytes / elapsed : 0,
        elapsedSeconds: elapsed,
        percentage: 100,
      };
      this.progressEmitter.emit('progress', finalProgress);
    }

    return results;
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
}

export const tileCopyEngine = new TileCopyEngine();
