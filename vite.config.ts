import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'command-api',
        configureServer(server) {
          // 1. Persistent Shell Setup
          // Use powershell.exe by default as it's built into all Windows installs
          let shell = spawn('powershell.exe', ['-NoLogo'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
          
          shell.on('error', (err) => {
            console.error('Shell spawn error:', err);
            // Fallback to cmd.exe if powershell fails
            shell = spawn('cmd.exe', [], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
          });

          if (server.httpServer) {
            const wss = new WebSocketServer({ noServer: true });
            
            server.httpServer.on('upgrade', (req, socket, head) => {
               const { pathname } = new URL(req.url || '', `http://${req.headers.host}`);
               if (pathname === '/api/terminal-ws') {
                 wss.handleUpgrade(req, socket, head, (ws) => {
                   wss.emit('connection', ws, req);
                 });
               }
            });

            wss.on('connection', (ws) => {
              console.log('Terminal WebSocket Connected');
              
              const onStdout = (data: Buffer) => {
                if (ws.readyState === 1) ws.send(data.toString());
              };
              const onStderr = (data: Buffer) => {
                if (ws.readyState === 1) ws.send(data.toString());
              };
              
              shell.stdout?.on('data', onStdout);
              shell.stderr?.on('data', onStderr);
              
              ws.on('message', (msg) => {
                const cmd = msg.toString();
                shell.stdin?.write(cmd + '\n');
              });

              ws.on('close', () => {
                console.log('Terminal WebSocket Disconnected');
                shell.stdout?.off('data', onStdout);
                shell.stderr?.off('data', onStderr);
              });

              ws.on('error', (err) => {
                console.error('WebSocket Error:', err);
              });
            });
          }

          // 2. Write File API
          server.middlewares.use('/api/write-file', (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => body += chunk);
              req.on('end', async () => {
                try {
                  const { filePath, content } = JSON.parse(body);
                  const fs = await import('fs');
                  const fullPath = path.resolve(process.cwd(), filePath || 'temp_saved_file.txt');
                  
                  // Ensure parent directory exists
                  const dir = path.dirname(fullPath);
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                  }
                  
                  fs.writeFileSync(fullPath, content);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, path: fullPath }));
                } catch (e: any) {
                  console.error('File write error:', e);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Failed to write file: ' + e.message }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end();
            }
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
