import { contextBridge, ipcRenderer } from 'electron';
import type {
  CopyOutcome,
  CopyProgress,
  PreflightResult,
  TileCopyJobRequest
} from '#main/types';

export interface TileCopyAPI {
  ping: () => Promise<string>;
  checkPaths: (request: TileCopyJobRequest) => Promise<{
    mainExists: boolean;
    sourceExists: boolean;
    targetExists: boolean;
  }>;
  preflight: (request: TileCopyJobRequest) => Promise<PreflightResult>;
  executeCopy: (request: TileCopyJobRequest) => Promise<CopyOutcome[]>;
  cancelCopy: () => Promise<void>;
  onCopyProgress: (callback: (progress: CopyProgress) => void) => () => void;
  selectMainConfig: () => Promise<string | null>;
  selectMainConfigDirectory: () => Promise<string | null>;
  selectSourceRoot: () => Promise<string | null>;
  selectTargetRoot: () => Promise<string | null>;
  getSavedConfig: () => Promise<Record<string, unknown>>;
  saveConfig: (config: Record<string, unknown>) => Promise<void>;

  // ========== 目录与 TXT 操作 API ==========
  selectAnyDirectory: (title?: string) => Promise<string | null>;
  selectAnyTxt: (title?: string) => Promise<string | null>;
  saveAnyTxt: (defaultName?: string) => Promise<string | null>;
  dirToTxtGenerate: (dirPath: string, targetTxtPath: string) => Promise<{ success: boolean; message: string }>;
  dirToTxtAppend: (dirPath: string, targetTxtPath: string) => Promise<{ success: boolean; message: string }>;
  dirToTxtRemove: (dirPath: string, targetTxtPath: string) => Promise<{ success: boolean; message: string }>;
}

const api: TileCopyAPI = {
  ping: () => ipcRenderer.invoke('tilecopy:ping'),
  checkPaths: (request) => ipcRenderer.invoke('tilecopy:check-paths', request),
  preflight: (request) => ipcRenderer.invoke('tilecopy:preflight', request),
  executeCopy: (request) => ipcRenderer.invoke('tilecopy:execute-copy', request),
  cancelCopy: () => ipcRenderer.invoke('tilecopy:cancel-copy'),
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
  saveConfig: (config) => ipcRenderer.invoke('tilecopy:save-config', config),

  // ========== 目录与 TXT 操作 API ==========
  selectAnyDirectory: (title) => ipcRenderer.invoke('tilecopy:select-any-directory', title),
  selectAnyTxt: (title) => ipcRenderer.invoke('tilecopy:select-any-txt', title),
  saveAnyTxt: (defaultName) => ipcRenderer.invoke('tilecopy:save-any-txt', defaultName),
  dirToTxtGenerate: (dirPath, targetTxtPath) => ipcRenderer.invoke('tilecopy:dir-to-txt-generate', dirPath, targetTxtPath),
  dirToTxtAppend: (dirPath, targetTxtPath) => ipcRenderer.invoke('tilecopy:dir-to-txt-append', dirPath, targetTxtPath),
  dirToTxtRemove: (dirPath, targetTxtPath) => ipcRenderer.invoke('tilecopy:dir-to-txt-remove', dirPath, targetTxtPath)
};

contextBridge.exposeInMainWorld('tilecopy', api);

