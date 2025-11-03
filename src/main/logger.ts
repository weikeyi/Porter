import { app } from 'electron';
import log from 'electron-log/main';
import { ensureDirSync } from 'fs-extra';
import { join } from 'node:path';

export function initializeLogger() {
  try {
    const logDir = join(app.getPath('userData'), 'logs');
    ensureDirSync(logDir);

    log.transports.file.resolvePath = () => join(logDir, `${getTimestamp()}.log`);
    log.transports.file.maxSize = 1024 * 1024 * 10; // 10 MB
    log.transports.console.level = 'info';
    log.info('[logger] 初始化完成，输出目录:', logDir);
  } catch (error) {
    console.error('[logger] 初始化失败', error);
  }
}

function getTimestamp() {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  const second = pad(now.getSeconds());

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

export default log;
