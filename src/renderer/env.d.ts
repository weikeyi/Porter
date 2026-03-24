/// <reference types="vite/client" />

interface TileCopyAPI {
  ping: () => Promise<string>;
  checkPaths: (request: import('#main/types').TileCopyJobRequest) => Promise<{
    mainExists: boolean;
    sourceExists: boolean;
    targetExists: boolean;
  }>;
  preflight: (request: import('#main/types').TileCopyJobRequest) => Promise<
    import('#main/types').PreflightResult
  >;
  executeCopy: (request: import('#main/types').TileCopyJobRequest) => Promise<
    import('#main/types').CopyOutcome[]
  >;
  onCopyProgress: (callback: (progress: import('#main/types').CopyProgress) => void) => () => void;
  selectMainConfig: () => Promise<string | null>;
  selectMainConfigDirectory: () => Promise<string | null>;
  selectSourceRoot: () => Promise<string | null>;
  selectTargetRoot: () => Promise<string | null>;
  getSavedConfig: () => Promise<Record<string, unknown>>;
  saveConfig: (config: Record<string, unknown>) => Promise<void>;

  selectAnyDirectory: (title?: string) => Promise<string | null>;
  selectAnyTxt: (title?: string) => Promise<string | null>;
  saveAnyTxt: (defaultName?: string) => Promise<string | null>;
  dirToTxtGenerate: (dirPath: string, targetTxtPath: string) => Promise<{ success: boolean; message: string }>;
  dirToTxtAppend: (dirPath: string, targetTxtPath: string) => Promise<{ success: boolean; message: string }>;
  dirToTxtRemove: (dirPath: string, targetTxtPath: string) => Promise<{ success: boolean; message: string }>;
}

declare global {
  interface Window {
    tilecopy?: TileCopyAPI;
  }
}

export { };

