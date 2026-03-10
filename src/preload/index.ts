import { contextBridge, ipcRenderer } from 'electron';
import type {
  CopyOutcome,
  CopyProgress,
  ParsedMainConfig,
  PreflightReport,
  TileCopyJobRequest
} from '#main/types';

export interface TileCopyAPI {
  ping: () => Promise<string>;
  checkPaths: (request: TileCopyJobRequest) => Promise<{
    mainExists: boolean;
    sourceExists: boolean;
    targetExists: boolean;
  }>;
  loadConfig: (request: TileCopyJobRequest) => Promise<ParsedMainConfig>;
  preflight: (request: TileCopyJobRequest) => Promise<PreflightReport[]>;
  executeCopy: (request: TileCopyJobRequest) => Promise<CopyOutcome[]>;
  onCopyProgress: (callback: (progress: CopyProgress) => void) => () => void;
  selectMainConfig: () => Promise<string | null>;
  selectMainConfigDirectory: () => Promise<string | null>;
  selectSourceRoot: () => Promise<string | null>;
  selectTargetRoot: () => Promise<string | null>;
  getSavedConfig: () => Promise<Record<string, unknown>>;
  saveConfig: (config: Record<string, unknown>) => Promise<void>;
}

const api: TileCopyAPI = {
  ping: () => ipcRenderer.invoke('tilecopy:ping'),
  checkPaths: (request) => ipcRenderer.invoke('tilecopy:check-paths', request),
  loadConfig: (request) => ipcRenderer.invoke('tilecopy:load-config', request),
  preflight: (request) => ipcRenderer.invoke('tilecopy:preflight', request),
  executeCopy: (request) => ipcRenderer.invoke('tilecopy:execute-copy', request),
  onCopyProgress: (callback) => {
    const listener = (_: any, progress: CopyProgress) => {
      callback(progress);
    };
    ipcRenderer.on('tilecopy:copy-progress', listener);
    return () => {
      ipcRenderer.removeListener('tilecopy:copy-progress', listener);
    };
  },
  selectMainConfig: () => ipcRenderer.invoke('tilecopy:select-main-config'),
  selectMainConfigDirectory: () => ipcRenderer.invoke('tilecopy:select-main-config-directory'),
  selectSourceRoot: () => ipcRenderer.invoke('tilecopy:select-source-root'),
  selectTargetRoot: () => ipcRenderer.invoke('tilecopy:select-target-root'),
  getSavedConfig: () => ipcRenderer.invoke('tilecopy:get-saved-config'),
  saveConfig: (config) => ipcRenderer.invoke('tilecopy:save-config', config)
};

contextBridge.exposeInMainWorld('tilecopy', api);
