import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import log from '../logger';

/**
 * 助手：获取指定目录下的所有子目录名称
 */
async function getSubdirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch (error) {
    log.error(`[dirTxtService] 读取目录失败: ${dirPath}`, error);
    throw new Error(`无法读取目录: ${dirPath}`);
  }
}

/**
 * 助手：读取 TXT 文件，按行拆分，去空去重
 */
async function readTxtLines(txtPath: string): Promise<string[]> {
  try {
    const content = await readFile(txtPath, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines;
  } catch (error) {
    log.error(`[dirTxtService] 读取 TXT 文件失败: ${txtPath}`, error);
    throw new Error(`无法读取文件: ${txtPath}`);
  }
}

/**
 * 助手：写入 TXT 文件（统一使用 \n）
 */
async function writeTxtLines(txtPath: string, lines: string[]): Promise<void> {
  try {
    const content = lines.join('\n') + '\n';
    await writeFile(txtPath, content, 'utf8');
  } catch (error) {
    log.error(`[dirTxtService] 写入 TXT 文件失败: ${txtPath}`, error);
    throw new Error(`无法写入文件: ${txtPath}`);
  }
}

export interface DirTxtResult {
  success: boolean;
  message: string;
}

export const dirTxtService = {
  /**
   * 1. 生成：读取目录子文件夹，保存到指定的 txt 文件
   */
  async generateTxt(dirPath: string, targetTxtPath: string): Promise<DirTxtResult> {
    log.info(`[dirTxtService] 生成 TXT: dir=${dirPath}, target=${targetTxtPath}`);
    try {
      const dirs = await getSubdirectories(dirPath);
      if (dirs.length === 0) {
        return { success: false, message: '选择的目录为空或没有子文件夹。' };
      }
      
      await writeTxtLines(targetTxtPath, dirs);
      return { success: true, message: `成功导出 ${dirs.length} 个文件夹名称至 TXT 文件。` };
    } catch (err: any) {
      return { success: false, message: err.message || '生成失败' };
    }
  },

  /**
   * 2. 增加：读取目录子文件夹，追加到已有的 txt 文件中（去重）
   */
  async appendToTxt(dirPath: string, targetTxtPath: string): Promise<DirTxtResult> {
    log.info(`[dirTxtService] 追加至 TXT: dir=${dirPath}, target=${targetTxtPath}`);
    try {
      const dirs = await getSubdirectories(dirPath);
      if (dirs.length === 0) {
        return { success: false, message: '选择的目录为空，无内容可追加。' };
      }

      const existingLines = await readTxtLines(targetTxtPath);
      const existingSet = new Set(existingLines);
      
      let addCount = 0;
      let skipCount = 0;
      
      for (const d of dirs) {
        if (!existingSet.has(d)) {
          existingLines.push(d);
          existingSet.add(d);
          addCount++;
        } else {
          skipCount++;
        }
      }

      if (addCount === 0) {
        return { success: true, message: `无新增内容，所有 ${skipCount} 个文件夹在 TXT 中已存在。` };
      }

      await writeTxtLines(targetTxtPath, existingLines);
      return { success: true, message: `成功追加 ${addCount} 个文件夹名称（跳过 ${skipCount} 个重复）。` };
    } catch (err: any) {
      return { success: false, message: err.message || '追加失败' };
    }
  },

  /**
   * 3. 删除：读取目录子文件夹，如果在 txt 中存在，则从 txt 中删除该行
   */
  async removeFromTxt(dirPath: string, targetTxtPath: string): Promise<DirTxtResult> {
    log.info(`[dirTxtService] 从 TXT 中删除: dir=${dirPath}, target=${targetTxtPath}`);
    try {
      const dirs = await getSubdirectories(dirPath);
      if (dirs.length === 0) {
        return { success: false, message: '选择的目录为空，无依据可删除。' };
      }

      const existingLines = await readTxtLines(targetTxtPath);
      const dirsSet = new Set(dirs);
      
      const newLines: string[] = [];
      let removeCount = 0;

      for (const line of existingLines) {
        if (dirsSet.has(line)) {
          removeCount++;
        } else {
          newLines.push(line);
        }
      }

      if (removeCount === 0) {
        return { success: true, message: `TXT 中未找到匹配的文件夹名称，无内容被删除。` };
      }

      await writeTxtLines(targetTxtPath, newLines);
      return { success: true, message: `成功从 TXT 中移除 ${removeCount} 个匹配的文件夹名称（剩余 ${newLines.length} 个）。` };
    } catch (err: any) {
      return { success: false, message: err.message || '删除失败' };
    }
  }
};
