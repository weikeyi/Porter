import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
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

function resolveAsset(file: string) {
  if (app.isPackaged) {
    // packaged: files copied to process.resourcesPath/assets via electron-builder extraResources
    return join(process.resourcesPath, 'assets', file);
  }
  // dev: read directly from workspace src/icon
  return join(process.cwd(), 'src', 'icon', file);
}

function resolveIconPath(): string | undefined {
  if (process.platform === 'win32') {
    const p = resolveAsset('icon.ico');
    return existsSync(p) ? p : undefined;
  }
  if (process.platform === 'linux') {
    const p = resolveAsset('icon.png');
    return existsSync(p) ? p : undefined;
  }
  // macOS: BrowserWindow.icon 被忽略；请使用 .icns 并在打包配置应用图标
  return undefined;
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
    },
    icon: resolveIconPath()
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

  // In electron-vite, use environment variable or check for dev mode
  if (isDev) {
    const devServerUrl = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';
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
