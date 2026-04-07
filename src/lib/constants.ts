export const CONFIG = {
  embedModel: "models/gemini-embedding-001",
  chunkSize: 4000,
  maxEmbeddingBytes: 1_000_000,
  topK: 15,
};

export const IGNORED_DIRS = ['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '__pycache__', 'venv', '.netlify', '.github', '.vercel'];
export const IGNORED_EXTS = [
  '.exe', '.dll', '.zip', '.tar.gz', '.pyc', '.log', 'env', '.env', 'logs', 'tmp', 'temp', 'package-lock.json', '.DS_Store', '.next'
];
