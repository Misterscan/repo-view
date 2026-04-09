import React, { useEffect, useRef, useState } from 'react';
// xterm and its addon are dynamically imported when the terminal is opened
import { X, Maximize2, Minimize2, Play } from 'lucide-react';
import { cn } from '../lib/utils';

interface TerminalProps {
  onClose: () => void;
}

export function Terminal({ onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any | null>(null);
  const fitAddonRef = useRef<any | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [command, setCommand] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Prepare scoped variables for cleanup
    let term: any = null;
    let ws: WebSocket | null = null;
    let XTermCtor: any;
    let FitAddonCtor: any;
    let handleResize: (() => void) | null = null;
    let isDisposed = false;
    let initialFitTimer: number | null = null;

    // Dynamically load xterm and fit addon and the CSS in an async function
    (async () => {
      try {
        await Promise.all([
          import('xterm/css/xterm.css'),
          import('xterm').then(mod => { XTermCtor = mod.Terminal || mod.default || mod; }),
          import('xterm-addon-fit').then(mod => { FitAddonCtor = mod.FitAddon || mod.default || mod; }),
        ]);
      } catch (e) {
        console.error('Failed to load xterm or addons:', e);
        return;
      }

      if (isDisposed || !terminalRef.current) return;

      term = new XTermCtor({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
        theme: {
          background: '#020a08',
          foreground: '#00ff9d',
          cursor: '#00ff9d',
          selectionBackground: 'rgba(0, 255, 157, 0.3)',
        },
      });

      const fitAddon = new FitAddonCtor();
      fitAddonRef.current = fitAddon;
      if (typeof term.loadAddon === 'function') term.loadAddon(fitAddon);
      term.open(terminalRef.current!);

      // Ensure terminal is rendered before fitting
      initialFitTimer = window.setTimeout(() => {
        if (isDisposed) return;
        try {
          fitAddon.fit();
        } catch (e) {
          console.warn('Initial terminal fit failed', e);
        }
      }, 100);

      xtermRef.current = term;

      // WebSocket Setup
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal-ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        term.writeln('\x1b[1;32mConnected to Persistent PowerShell Session\x1b[0m');
      };

      ws.onmessage = (event) => {
        term.write(event.data.toString().replace(/\n/g, '\r\n'));
      };

      ws.onclose = () => {
        setIsConnected(false);
        term.writeln('\r\n\x1b[1;31mConnection Closed\x1b[0m');
      };

      ws.onerror = (err) => {
        term.writeln('\r\n\x1b[1;31mWebSocket Error Check server logs.\x1b[0m');
        console.error('WS Error:', err);
      }

      handleResize = () => {
        try {
          fitAddon.fit();
        } catch {}
      };
      window.addEventListener('resize', handleResize);
    })();

    return () => {
      isDisposed = true;
      if (initialFitTimer !== null) window.clearTimeout(initialFitTimer);
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      if (term) term.dispose();
    };
  }, []);

  // Fit on expansion change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {}
      }
    }, 350); // wait for resize transition
    return () => clearTimeout(timer);
  }, [isExpanded]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(command);
        setCommand('');
      } else {
        xtermRef.current?.writeln('\r\n\x1b[1;31mNot connected\x1b[0m');
      }
    }
  };

  return (
    <div className={cn(
      "fixed bottom-0 right-0 z-50 flex flex-col bg-[#020a08] border-l border-t border-[var(--border)] shadow-2xl transition-all duration-300",
      isExpanded ? "w-full h-1/2" : "w-[500px] h-80"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[rgba(6,26,21,0.9)]">
        <div className="flex items-center gap-2 text-[0.6rem] font-mono text-[var(--accent)] uppercase tracking-tighter">
          <Play className="w-3 h-3" />
            <span>Persistent Terminal (pwsh)</span>
          <span className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-[var(--ok)] animate-pulse" : "bg-[var(--bad)]")} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--bad)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div ref={terminalRef} className="flex-1 overflow-hidden" />

      {/* Input Overlay */}
      <div className="p-2 border-t border-[var(--border)] bg-[#010806] flex gap-2 items-center">
        <span className="text-[var(--accent)] font-mono text-xs pl-2">$</span>
        <input 
          type="text" 
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          className="flex-1 bg-transparent text-[var(--text-main)] font-mono text-xs outline-none"
        />
      </div>
    </div>
  );
}
