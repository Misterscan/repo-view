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
  
  // 1. Extension/Suffix Check
  const matchedExt = IGNORED_EXTS.find(ext => {
    // If it starts with '.', treat as extension
    if (ext.startsWith('.')) return lower.endsWith(ext.toLowerCase());
    // Otherwise check for exact segment match or suffix
    return lower.split('/').some(part => part === ext.toLowerCase());
  });

  if (matchedExt) {
    console.log(`[IGNORE_CHECK] (constants) Ignoring path: ${filePath} (matched: "${matchedExt}")`);
    return true;
  }

  // 2. Directory Check
  const parts = normalized.split('/').filter(Boolean);
  const matchedDir = parts.find(part => IGNORED_DIRS.includes(part.toLowerCase()));
  if (matchedDir) {
    console.log(`[IGNORE_CHECK] (constants) Ignoring path: ${filePath} (matched dir: "${matchedDir}")`);
    return true;
  }

  return false;
}

export function isIgnoredFile(file: File): boolean {
  return isIgnoredPath(file.webkitRelativePath || file.name);
}
