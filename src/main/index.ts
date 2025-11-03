import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { join } from 'node:path';
import log, { initializeLogger } from './logger';
import type { TileCopyJobRequest } from './types';
import { tileCopyEngine } from './services/tilecopyEngine';

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';
const preloadPath = join(__dirname, '../preload/index.cjs');

let mainWindow: BrowserWindow | null = null;

async function showOpenDialog(options: OpenDialogOptions) {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  if (window) {
    return dialog.showOpenDialog(window, options);
  }
  return dialog.showOpenDialog(options);
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false
    }
  });

  log.info('[main] BrowserWindow created');

  window.webContents.on('did-finish-load', () => {
    log.info('[main] renderer did-finish-load');
  });

  window.on('ready-to-show', () => {
    log.info('[main] ready-to-show → show & focus');
    window.show();
    window.focus();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl && isDev) {
    log.info('[main] loading dev server', devServerUrl);
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    log.info('[main] loading production build');
    await window.loadFile(join(__dirname, '../../dist/index.html'));
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  mainWindow = window;
}

app.commandLine.appendSwitch('enable-features', 'ElectronSerialChooser');

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId(app.getName());
  }

  initializeLogger();
  log.info('[main] 应用启动');

  void createWindow();
});

process.on('uncaughtException', (error) => {
  log.error('[main] uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection', reason);
});

function registerIpcHandlers() {
  ipcMain.handle('tilecopy:ping', () => 'pong');

  ipcMain.handle('tilecopy:check-paths', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.pathsAccessible(request);
  });

  ipcMain.handle('tilecopy:load-config', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.loadConfig(request);
  });

  ipcMain.handle('tilecopy:preflight', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.preflight(request);
  });

  ipcMain.handle('tilecopy:execute-copy', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.executeCopy(request);
  });

  ipcMain.handle('tilecopy:select-main-config', async () => {
    const result = await showOpenDialog({
      title: '选择主配置文件',
      properties: ['openFile'],
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('tilecopy:select-source-root', async () => {
    const result = await showOpenDialog({
      title: '选择源目录 (Tile 根)',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('tilecopy:select-target-root', async () => {
    const result = await showOpenDialog({
      title: '选择目标目录',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}

registerIpcHandlers();
