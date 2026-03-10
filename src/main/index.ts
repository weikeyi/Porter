import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import log, { initializeLogger } from './logger';
import type { TileCopyJobRequest } from './types';
import { tileCopyEngine } from './services/tilecopyEngine';
import { getSavedConfig, saveConfig } from './services/configStore';

const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';
const preloadPath = join(__dirname, '../preload/index.cjs');
const startupStartedAt = Date.now();
const SHOW_WINDOW_FALLBACK_MS = 1500;

let mainWindow: BrowserWindow | null = null;

function formatElapsedMs(since = startupStartedAt) {
  return `${Date.now() - since}ms`;
}

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
  const windowStartTime = Date.now();
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#111418',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false
    },
    icon: resolveIconPath()
  });

  log.info('[main] BrowserWindow created');

  let hasShownWindow = false;
  const showWindow = (reason: string) => {
    if (hasShownWindow || window.isDestroyed()) {
      return;
    }
    hasShownWindow = true;
    if (!window.isVisible()) {
      window.show();
    }
    window.focus();
    log.info('[main] 窗口已显示', {
      reason,
      windowElapsed: formatElapsedMs(windowStartTime),
      totalElapsed: formatElapsedMs()
    });
  };

  const showWindowTimer = setTimeout(() => {
    showWindow(`fallback-${SHOW_WINDOW_FALLBACK_MS}ms`);
  }, SHOW_WINDOW_FALLBACK_MS);

  window.once('show', () => {
    clearTimeout(showWindowTimer);
  });

  window.webContents.once('did-finish-load', () => {
    log.info('[main] renderer did-finish-load', {
      windowElapsed: formatElapsedMs(windowStartTime),
      totalElapsed: formatElapsedMs()
    });
    showWindow('did-finish-load');
  });

  window.once('ready-to-show', () => {
    log.info('[main] ready-to-show', {
      windowElapsed: formatElapsedMs(windowStartTime),
      totalElapsed: formatElapsedMs()
    });
    showWindow('ready-to-show');
  });

  // In electron-vite, use environment variable or check for dev mode
  if (isDev) {
    const devServerUrl = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';
    log.info('[main] loading dev server', devServerUrl);
    await window.loadURL(devServerUrl);
    if (process.env.OPEN_DEVTOOLS === 'true') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    log.info('[main] loading production build');
    await window.loadFile(join(__dirname, '../../dist/index.html'));
  }

  window.on('closed', () => {
    clearTimeout(showWindowTimer);
    mainWindow = null;
  });

  mainWindow = window;
}

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
  log.info('[main] app.whenReady 完成', {
    totalElapsed: formatElapsedMs()
  });

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

  // 配置持久化
  ipcMain.handle('tilecopy:get-saved-config', () => getSavedConfig());
  ipcMain.handle('tilecopy:save-config', (_event, config) => saveConfig(config));

  ipcMain.handle('tilecopy:check-paths', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.pathsAccessible(request);
  });

  ipcMain.handle('tilecopy:load-config', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.loadConfig(request);
  });

  ipcMain.handle('tilecopy:preflight', async (_event, request: TileCopyJobRequest) => {
    return tileCopyEngine.preflight(request);
  });

  ipcMain.handle('tilecopy:execute-copy', async (event, request: TileCopyJobRequest) => {
    // 创建进度事件发射器
    const progressEmitter = new EventEmitter();
    const webContents = event.sender;

    // 监听进度事件并发送给渲染进程
    const progressListener = (progress: any) => {
      webContents.send('tilecopy:copy-progress', progress);
    };
    progressEmitter.on('progress', progressListener);

    // 设置进度发射器到引擎
    tileCopyEngine.setProgressEmitter(progressEmitter);

    try {
      const results = await tileCopyEngine.executeCopy(request);
      return results;
    } finally {
      // 清理事件监听器
      progressEmitter.removeListener('progress', progressListener);
      progressEmitter.removeAllListeners();
    }
  });

  ipcMain.handle('tilecopy:select-main-config', async () => {
    const result = await showOpenDialog({
      title: '选择主配置文件',
      properties: ['openFile'],
      filters: [
        { name: '配置文件', extensions: ['txt', 'csv'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('tilecopy:select-main-config-directory', async () => {
    const result = await showOpenDialog({
      title: '选择主配置目录 (将子目录视为列表)',
      properties: ['openDirectory']
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
