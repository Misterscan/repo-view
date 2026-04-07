import { GoogleGenAI } from '@google/genai';

// Initialize Gemini API (User should have this in .env or we use a fallback if provided in metadata)
export const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '' });

export function chunkText(text: string, size: number, name: string) {
  const chunks: string[] = [];
  let current = `// File: ${name}\n`;
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

export async function uploadFileToGemini(file: File, apiKey: string, mimeType: string) {
  const size = file.size;
  const baseUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
  const startResp = await fetch(`${baseUrl}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": size.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file: { display_name: file.name } })
  });
  if (!startResp.ok) throw new Error("Upload start failed");
  const uploadUrl = startResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("No upload URL returned");
  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Type": mimeType },
    body: file
  });
  if (!uploadResp.ok) throw new Error("Upload failed");
  const fileInfo = await uploadResp.json();
  return fileInfo.file.uri;
}
