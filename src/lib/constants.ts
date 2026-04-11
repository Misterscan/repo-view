export const CONFIG = {
  embedModel: "models/gemini-embedding-001",
  chunkSize: 4000,
  maxEmbeddingBytes: 1_000_000,
  topK: 15,
};

export const IGNORED_DIRS = [
  'node_modules', '.git', '.idea', '.vscode', 'dist', 'build', 
  '__pycache__', 'venv', '.venv', 'ENV',
  '.netlify', '.github', '.vercel', 'server_uploads', 'target',
  'vendor', 'bin', 'obj'
];

export const IGNORED_EXTS = [
  '.exe', '.dmg', '.app', '.dll', '.zip', '.tar.gz', '.pyc', '.log', '.env', 'logs', 'tmp', 'temp', 
  'package-lock.json', '.DS_Store', '.next', '.swp', '.swo',
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.iso', '.bin', '.img', '.msi', '.deb', '.rpm'
];

export function isIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  if (IGNORED_EXTS.some(ext => lower.endsWith(ext.toLowerCase()))) return true;
  const parts = normalized.split('/').filter(Boolean);
  return parts.some(part => IGNORED_DIRS.includes(part.toLowerCase()));
}

export function isIgnoredFile(file: File): boolean {
  return isIgnoredPath(file.webkitRelativePath || file.name);
}