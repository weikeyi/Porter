import { spawn } from 'node:child_process';
import log from '../logger';

export interface RobocopyOptions {
  /**
   * Number of threads to use (default: 32)
   * Corresponds to /MT:N
   */
  readonly threads?: number;
  /**
   * If true, mirrors the directory tree (purges extra files in destination).
   * Corresponds to /MIR. Use with caution.
   * Default: false (uses /E for copy only)
   */
  readonly mirror?: boolean;
  /**
   * If true, moves files and dirs (delete from source after copying).
   * Corresponds to /MOVE.
   */
  readonly move?: boolean;
  /**
   * Abort signal to cancel the ongoing robocopy process.
   */
  readonly signal?: AbortSignal;
}

/**
 * Executes Windows Robocopy command to copy files from source to destination.
 * 
 * Optimized for performance:
 * - Uses /MT (Multi-threaded)
 * - Disables stdout noise for file names (/NFL /NDL) to reduce IO overhead
 * - Returns a promise that resolves when copy is complete
 */
export function execRobocopy(
  source: string,
  destination: string,
  options: RobocopyOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      return reject(new DOMException('Operation aborted by user', 'AbortError'));
    }

    // Default to 32 threads for high performance on modern CPUs/SSDs
    const threads = options.threads ?? 32;
    
    // Base args: 
    // /E   :: copy subdirectories, including Empty ones.
    // /MT  :: Multi-threading
    // /NFL :: No File List - don't log file names.
    // /NDL :: No Directory List - don't log directory names.
    // /NJH :: No Job Header.
    // /NJS :: No Job Summary.
    // /NC  :: No Class info (file type).
    // /NS  :: No File Size.
    // /NP  :: No Progress - don't show % progress per file (messy in logs).
    const args = [
      source,
      destination,
      options.move ? '/MOVE' : (options.mirror ? '/MIR' : '/E'), // MOVE implies E usually, but let's trust robocopy default or add /E if needed. Robocopy /MOVE moves files AND dirs.
      // Robocopy /MOVE usually needs /E explicitly if we want empty subdirs? 
      // Actually /MOVE = /M + delete. /MOVE acts like /CUT. 
      // Let's add /E explicitly even for move just in case, unless it conflicts.
      // Robocopy doc: /MOVE :: MOVES files AND directories (delete from source after copying).
      // It effectively replaces /E /PURGE kind of logic but for source.
      // Safer to just use '/MOVE' and '/E' together?
      // Robocopy allows '/MOVE /E'.
      ...(options.move ? ['/E'] : []),
      
      `/MT:${threads}`,
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NC',
      '/NS',
      '/NP',
      // Retry options: Retry 3 times, wait 1 second
      '/R:3',
      '/W:1'
    ];

    log.info(`[robocopy] Executing: robocopy ${args.join(' ')}`);

    const child = spawn('robocopy', args, {
      windowsVerbatimArguments: true, // Important for path handling on Windows
      stdio: 'ignore' // We don't need the output, it slows things down
    });

    const cleanup = () => {
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      log.warn('[robocopy] Process aborted. Killing child process:', child.pid);
      child.kill(); // On Windows, child.kill() sends SIGTERM/SIGKILL equivalent to terminate the task
      reject(new DOMException('Operation aborted by user', 'AbortError'));
    };

    if (options.signal) {
      options.signal.addEventListener('abort', onAbort);
    }

    child.on('error', (err) => {
      cleanup();
      log.error('[robocopy] Failed to start process:', err);
      reject(err);
    });

    child.on('exit', (code) => {
      cleanup();
      
      // If the promise was already rejected by onAbort, this will be safely ignored.
      
      // Robocopy Exit Codes:
      // 0: No files were copied (that's fine, maybe everything was up to date)
      // 1: Files were copied successfully
      // 2: Extra files/dirs were detected (only relevant for /MIR)
      // 4: Mismatched files/dirs
      // 8: Some files failed to copy
      // 16: Fatal error
      
      // Standard success codes are 0 and 1. (Sometimes 2 or 3 depending on flags)
      // We consider anything < 8 as "success enough" for a simple copy.
      if (code !== null && code < 8) {
        resolve();
      } else {
        const msg = `[robocopy] Process exited with error code: ${code}`;
        log.error(msg);
        reject(new Error(msg));
      }
    });
  });
}
