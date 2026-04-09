import { readApiError, readApiJson } from './api';

type GenerateContentRequest = {
  model: string;
  contents: unknown;
  config?: unknown;
};

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await readApiError(response, `Request failed with status ${response.status}`);
  }

  return readApiJson<T>(response);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] || '');
    };
    reader.readAsDataURL(file);
  });
}

export async function embedTexts(model: string, contents: string[]): Promise<number[][]> {
  const result = await postJson<{ embeddings?: { values?: number[] }[] }>('/api/gemini/embed', {
    model,
    contents,
  });

  return (result.embeddings || []).map(embedding => embedding.values || []);
}

export async function generateModelContent(request: GenerateContentRequest): Promise<string> {
  const result = await postJson<{ text?: string }>('/api/gemini/generate', request);
  return result.text || '';
}

export function chunkText(text: string, size: number, name: string) {
  const chunks: string[] = [];
  const header = `// File: ${name}\n`;

  const ext = name.split('.').pop()?.toLowerCase() || '';
  const codeExts = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp']);

  // Heuristic semantic splitter for code-like files: split on top-level declarations
  if (codeExts.has(ext)) {
    const blocks: string[] = [];
    const boundaryRE = /(^\s*(?:export\s+)?(?:async\s+)?function\b)|(^\s*(?:export\s+)?class\b)|(^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(?\w*\)?\s*=>)|(^\s*#region\b)|(^\s*def\s+\w+\()/m;

    // Walk the file and slice at boundaries
    const lines = text.split('\n');
    let currentBlockLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (boundaryRE.test(line) && currentBlockLines.length > 0) {
        blocks.push(currentBlockLines.join('\n') + '\n');
        currentBlockLines = [];
      }
      currentBlockLines.push(line);
    }
    if (currentBlockLines.length > 0) blocks.push(currentBlockLines.join('\n') + '\n');

    // Assemble blocks into size-bounded chunks
    let current = header;
    for (const b of blocks) {
      if (current.length + b.length > size) {
        if (current.trim() !== header.trim()) {
          chunks.push(current);
          current = header + b;
        } else {
          // Single block larger than size — fall back to line splitting for this block
          const subLines = b.split('\n');
          for (const sl of subLines) {
            if (current.length + sl.length + 1 > size) {
              chunks.push(current);
              current = header + sl + '\n';
            } else {
              current += sl + '\n';
            }
          }
        }
      } else {
        current += b;
      }
    }
    if (current.length > header.length) chunks.push(current);
    if (chunks.length === 0) chunks.push(header + text);
    return chunks;
  }

  // Fallback: line-based splitter for non-code files
  let current = header;
  text.split("\n").forEach(line => {
    if (current.length + line.length > size) {
      chunks.push(current);
      current = `// File: ${name} (cont)\n`;
    }
    current += line + "\n";
  });
  chunks.push(current);
  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; mA += a[i] * a[i]; mB += b[i] * b[i]; }
  return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

// Lightweight token estimator (Gemini: ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length || 0) / 4);
}


export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 1000
): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (error && error.status === 429 && retries < maxRetries) {
        const delay = baseDelay * Math.pow(2, retries);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }
}

// Helper to get MIME types
export function getMimeType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    'js': 'text/javascript', 'ts': 'text/plain', 'py': 'text/x-python', 'html': 'text/html', 'css': 'text/css',
    'md': 'text/markdown', 'csv': 'text/csv', 'xml': 'text/xml', 'json': 'application/json', 'c': 'text/plain',
    'cpp': 'text/plain', 'cs': 'text/plain', 'java': 'text/plain', 'go': 'text/plain', 'rs': 'text/plain',
    'php': 'text/plain', 'rb': 'text/plain', 'sh': 'text/plain', 'txt': 'text/plain', 'png': 'image/png',
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'svg': 'image/svg+xml', 'pdf': 'application/pdf'
  };
  return ext ? (map[ext] || 'text/plain') : 'text/plain';
}

export async function uploadFileToGemini(file: File, mimeType: string) {
  const result = await postJson<{ uri: string }>('/api/gemini/upload', {
    name: file.name,
    mimeType,
    data: await fileToBase64(file),
  });

  return result.uri;
}
