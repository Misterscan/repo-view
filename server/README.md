# Server

This directory contains the Express.js backend that serves the AI interface and handles local system operations.

## Key Architectures

### `index.ts`

The main entry point for the backend server.

- Sets up the Express application with JSON parsing, local API auth, and rate limiting.
- Initializes API routes for file reading/writing (`/api/read-file`, `/api/write-file`), terminal WebSockets (`/api/terminal-ws`), and repository management.
- Runs in both development (attached to Vite) and production modes.
- Applies a general rate limiter to all `/api/*` routes before route registration.

### `repo.ts`

Handles server-side repository zip extraction, persistence, and diffing.

- **`/api/repo/compare`**: A dry-run endpoint that accepts a zip upload, extracts it in memory via `adm-zip`, computes SHA-256 hashes of the files, and compares them against the current server-side session to detect added, modified, or deleted files.
- **`/api/repo/upload`**: The persistence endpoint. Extracts the zip into `server_uploads/<sessionId>` on the disk and updates the tracking `manifest.json`.
- Mutation-oriented repo endpoints keep stricter per-route limits in addition to the general `/api/*` limiter.

### `github.ts`

Handles local git inspection and GitHub API integration.

- **`/api/github/search-repos`**: Lists the authenticated user's accessible GitHub repositories and supports in-app search.
- **`/api/github/clone/start`** and **`/api/github/clone/status/:jobId`**: Start a repository clone/update job and poll live progress output until completion. Private repository clone/import requires a token with `Contents: Read`.
- **`/api/github/inspect`**: Accepts a local repository path, inspects branch and working tree status through the git CLI, resolves the GitHub `origin` remote, and fetches branches, pull requests, issues, and recent GitHub Actions workflow runs. These GitHub API calls can still return `403` even after clone succeeds if the token lacks the corresponding GitHub permissions.
- **`/api/github/action`**: Executes local git actions such as commit, pull, push, checkout, and create-branch, then returns refreshed repository state.
- **`/api/github/diff`**: Returns a textual diff for a changed file so the UI can preview changes before further actions.
- Uses `GITHUB_TOKEN` or `REPOVIEW_GITHUB_TOKEN` when present to improve GitHub API limits and access private repository workflow data.

### `frontend.ts`

Handles serving the built React frontend in production mode.

- Serves static assets from the `dist/` directory.
- Falls back to `index.html` for client-side routing.

### `terminal.ts`

Manages the persistent WebSocket terminal sessions.

- Spawns a background `powershell.exe` (with a fallback to `cmd.exe`) process using Node's native `child_process`.
- Streams stdin/stdout/stderr between the browser's `xterm.js` via the raw `ws` library and the local shell.

## Data Storage

The server maintains a local `server_uploads/` directory where it persists extracted repository files. This allows the backend to perform precise diffs and direct filesystem modifications without relying solely on the browser's IndexedDB.

## Environment Notes

- All `/api/*` routes are rate-limited. File operations and repository mutation endpoints are intentionally capped more aggressively than general API reads.
- **External writes** (absolute paths outside the repo) are blocked by default for safety. To allow them, set `ALLOW_EXTERNAL_WRITES=1` in the `.env` file (or toggle in the UI). Approved external writes are automatically backed up to `logs/backups/` and logged to `logs/file-writes.log`.
- **Encrypted API Keys**: The server uses `dotenvx` to encrypt sensitive API keys in the `.env` file. The encrypted values are stored in the `.env.enc` file and are automatically decrypted at runtime.
- Set `GITHUB_TOKEN` in the root `.env` file if you want the GitHub integration to search private repositories, clone/import private repositories, or fetch GitHub API data for the sidebar.
- The same token is used for repository search, clone/import, GitHub Actions, pull requests, and issues.
- Recommended fine-grained token permissions:
  - `Contents: Read` for private repository clone/import.
  - `Actions: Read` for workflow runs.
  - `Pull requests: Read` for PR listings.
  - `Issues: Read` for issue listings.
- If repository search works but clone or inspect fails, the token is valid but missing one or more repo permissions.
- If clone succeeds but the UI shows `GitHub API returned 403`, the token does not have permission for one of the follow-up API calls.
- Restart the dev server after adding or changing the token.
