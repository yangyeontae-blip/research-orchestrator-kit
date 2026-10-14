import { spawn } from 'node:child_process';
export function execute(file, args, { cwd, input = '', signal, timeout = 300000, maxBytes = 8000000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      detached: process.platform !== 'win32'
    });
    const chunks = [];
    let size = 0,
      err = '',
      settled = false;
    const terminate = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
          shell: false
        });
        killer.on('error', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill();
        }
      }
    };
    const aborted = () => {
      terminate();
      end(new Error('Worker stopped; completed artifacts retained'));
    };
    const end = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      terminate();
      end(new Error('Worker timeout; completed artifacts retained'));
    }, timeout);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
    child.on('error', (e) => end(e));
    child.stdout.on('data', (b) => {
      chunks.push(b);
      size += b.length;
      if (size > maxBytes) {
        terminate();
        end(new Error('Worker output limit'));
      }
    });
    child.stderr.on('data', (b) => {
      err = (err + b).slice(-2000);
    });
    // Some CLIs (Claude with --output-format json) report errors such as usage limits on stdout, not stderr.
    child.on('close', (code) => {
      const out = Buffer.concat(chunks).toString('utf8');
      end(code === 0 ? null : new Error(`Worker exited ${code}: ${err}${err.trim() ? '' : out.slice(-2000)}`), out);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
