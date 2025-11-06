/// <reference types="vite/client" />

interface TileCopyAPI {
  ping: () => Promise<string>;
  checkPaths: (request: import('#main/types').TileCopyJobRequest) => Promise<{
    mainExists: boolean;
    sourceExists: boolean;
    targetExists: boolean;
  }>;
  loadConfig: (request: import('#main/types').TileCopyJobRequest) => Promise<import('#main/types').ParsedMainConfig>;
  preflight: (request: import('#main/types').TileCopyJobRequest) => Promise<
    import('#main/types').PreflightReport[]
  >;
  executeCopy: (request: import('#main/types').TileCopyJobRequest) => Promise<
    import('#main/types').CopyOutcome[]
  >;
  onCopyProgress: (callback: (progress: import('#main/types').CopyProgress) => void) => void;
  selectMainConfig: () => Promise<string | null>;
  selectSourceRoot: () => Promise<string | null>;
  selectTargetRoot: () => Promise<string | null>;
}

declare global {
  interface Window {
    tilecopy?: TileCopyAPI;
  }
}

export {};
