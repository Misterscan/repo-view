export const CONFIG = {
  embedModel: "models/gemini-embedding-001",
  chunkSize: 4000,
  maxEmbeddingBytes: 1_000_000,
  topK: 15,
};

export const IGNORED_DIRS = ['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '__pycache__', 'venv', '.netlify', '.github', '.vercel', 'server_uploads'];
export const IGNORED_EXTS = [
  '.exe', '.dmg', '.app', '.dll', '.zip', '.tar.gz', '.pyc', '.log', 'env', '.env', 'logs', 'tmp', 'temp', 'package-lock.json', '.DS_Store', '.next',
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.iso', '.bin', '.img', '.msi', '.deb', '.rpm',
];
