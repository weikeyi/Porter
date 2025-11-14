export interface DetailConfig {
  readonly rangeLabel: string;
  readonly configPath: string;
  readonly rangeSourcePath: string;
  readonly rangeTargetPath?: string;
  readonly directoryNames: string[];
  readonly matchKeys: string[];
}

export interface ParsedMainConfig {
  readonly mainConfigPath: string;
  readonly detailConfigs: DetailConfig[];
  readonly errors: string[];
}

export interface DirectoryMatch {
  readonly name: string;
  readonly sourcePath: string;
  readonly sizeInBytes: number;
  readonly lastModified: number;
}

export interface ScanFinding {
  readonly directory: string;
  readonly status: 'missing' | 'exists' | 'duplicate';
  readonly matches: DirectoryMatch[];
}

export interface RangeScanReport {
  readonly rangeLabel: string;
  readonly rangeSourcePath: string;
  readonly requestedNames: string[];
  readonly findings: ScanFinding[];
  readonly summary: {
    readonly totalRequested: number;
    readonly matched: number;
    readonly missing: number;
    readonly duplicates: number;
  };
}

export interface PreflightReport {
  readonly detail: DetailConfig;
  readonly scan: RangeScanReport;
}

export interface CopyOutcome {
  readonly detail: DetailConfig;
  readonly copied: Array<DirectoryMatch & { targetPath: string }>;
  readonly skippedExists: Array<DirectoryMatch & { targetPath: string }>;
  readonly missing: string[];
  readonly failed: Array<{ name: string; reason: string }>;
}

export interface TileCopyJobRequest {
  readonly mainConfigPath: string;
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly overwrite: boolean;
  readonly ignoreCase: boolean;
  readonly measureSize: boolean;
  readonly discoverRangeSubRoot?: boolean;
  readonly discoveryMaxDepth?: number;
}

export interface CopyProgress {
  readonly stage: 'preparing' | 'copying' | 'completed' | 'error';
  readonly currentFile?: string;
  readonly currentFileIndex?: number;
  readonly totalFiles?: number;
  readonly bytesCopied: number;
  readonly totalBytes: number;
  readonly speedBytesPerSecond?: number;
  readonly elapsedSeconds: number;
  readonly estimatedRemainingSeconds?: number;
  readonly percentage: number;
  readonly errorMessage?: string;
}
