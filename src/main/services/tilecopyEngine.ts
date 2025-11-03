import path from 'node:path';
import { pathExists } from 'fs-extra';
import log from '../logger';
import type {
  CopyOutcome,
  ParsedMainConfig,
  PreflightReport,
  TileCopyJobRequest
} from '../types';
import { parseMainConfig } from './configLoader';
import { copyRange } from './copyService';
import { scanDetailRange } from './scanner';

export class TileCopyEngine {
  private lastConfig: ParsedMainConfig | null = null;
  private lastPreflight: PreflightReport[] = [];

  async loadConfig(request: TileCopyJobRequest): Promise<ParsedMainConfig> {
    this.validatePaths(request);

    log.info('[engine] 解析主配置:', request.mainConfigPath);
    this.lastConfig = await parseMainConfig(request.mainConfigPath, {
      sourceRoot: request.sourceRoot,
      targetRoot: request.targetRoot,
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
        ignoreCase: request.ignoreCase
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

    for (const report of preflight) {
      const outcome = await copyRange(report.detail, report.scan, {
        overwrite: request.overwrite
      });
      results.push(outcome);
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

    if (!path.isAbsolute(request.targetRoot)) {
      throw new Error('目标目录路径必须为绝对路径。');
    }
  }

  async pathsAccessible(request: TileCopyJobRequest) {
    const [mainExists, sourceExists, targetExists] = await Promise.all([
      pathExists(request.mainConfigPath),
      pathExists(request.sourceRoot),
      pathExists(request.targetRoot)
    ]);

    return {
      mainExists,
      sourceExists,
      targetExists
    };
  }
}

export const tileCopyEngine = new TileCopyEngine();
