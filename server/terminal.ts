import { spawn } from 'child_process';
import { type Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';

export function setupTerminal(httpServer: HttpServer, rootDir: string, devToken: string) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'powershell.exe' : (process.env.SHELL || 'zsh');
  const args = isWindows ? ['-NoLogo'] : [];

  let shell = spawn(command, args, { cwd: rootDir, stdio: ['pipe', 'pipe', 'pipe'] });

  shell.on('error', (error) => {
    console.error('Shell spawn error:', error);
    if (isWindows) {
      shell = spawn('cmd.exe', [], { cwd: rootDir, stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      shell = spawn('sh', [], { cwd: rootDir, stdio: ['pipe', 'pipe', 'pipe'] });
    }
  });

  const cleanupShell = () => {
    try {
      if (shell && !shell.killed) {
        shell.kill();
      }
    } catch {
      // ignore shutdown errors
    }
  };

  httpServer.on('close', cleanupShell);
  process.on('exit', cleanupShell);
  process.on('SIGINT', cleanupShell);
  process.on('SIGTERM', cleanupShell);

  const terminalWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
    if (requestUrl.pathname !== '/api/terminal-ws') {
      return;
    }

    const sameOrigin = (() => {
      const origin = req.headers.origin || req.headers.referer || '';
      const host = req.headers.host || '';
      if (!origin) return true;
      try {
        const parsed = new URL(origin);
        return parsed.host === host || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      } catch {
        return false;
      }
    })();

    const headerToken = req.headers['x-repoview-token'];
    const queryToken = requestUrl.searchParams.get('repoview_token');
    if (!sameOrigin && headerToken !== devToken && queryToken !== devToken) {
      try {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      } catch {}
      socket.destroy();
      return;
    }

    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      terminalWss.emit('connection', ws, req);
    });
  });

  terminalWss.on('connection', (ws) => {
    const onStdout = (data: Buffer) => {
      if (ws.readyState === ws.OPEN) ws.send(data.toString());
    };
    const onStderr = (data: Buffer) => {
      if (ws.readyState === ws.OPEN) ws.send(data.toString());
    };

    shell.stdout?.on('data', onStdout);
    shell.stderr?.on('data', onStderr);

    ws.on('message', (message) => {
      shell.stdin?.write(message.toString() + '\n');
    });

    ws.on('close', () => {
      shell.stdout?.off('data', onStdout);
      shell.stderr?.off('data', onStderr);
    });

    ws.on('error', (error) => {
      console.error('Terminal WebSocket error:', error);
    });
  });
}
