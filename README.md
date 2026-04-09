# repoview: Repodoc Viewer & Coding Agent Interface 🚀

Welcome to **repoview**—a high-performance, persistent, and bi-directional AI coding interface designed to radically accelerate how you understand, debug, and modify complex codebases.

Built as a sleek React & Vite application, **repoview** transforms a local repository into an interactive multimodal knowledge base. It leverages IndexedDB for privacy-first local storage, Web Workers for smooth performance, and the Gemini API for robust intelligence.

---

## ✨ Key Features

### 🧠 Agentic RAG & Multimodal Intelligence
*   **Intelligent Code Search:** Instantly chat with your codebase using Retrieval-Augmented Generation (RAG).
*   **Web Worker Acceleration:** Embeddings and cosine similarity calculations are processed in the background off the main thread, keeping the UI at 60fps.
*   **Privacy-First Multimodal Support:** Images and videos are tracked locally. When you ask questions about an image, the application fetches the raw binary from local IndexedDB, converts it to Base64, and dynamically injects it into Gemini's context window. Your media assets are **never** synced to persistent cloud storage.
*   **Context Budgeting System:** Automatically prioritizes critical architectural files (like entry points and `package.json`) to prevent context overflow without failing silently.
*   **Live Token Estimation UI:** See your draft prompt size and the full assembled AI context token size directly in the chat interface.

### 💻 Bi-Directional Filesystem Execution
*   **1-Click Apply:** Found a fix in the chat? Hover over the AI-generated code block, preview a diff against the current file, and then apply the overwrite directly to your local disk.
*   **Server-Side Repo Syncing:** Upload project directories as zip payloads. The Node.js backend (`adm-zip`) extracts, hashes files, and provides persistent server-side sessions perfectly syncing your frontend RAG with backend code generation.
*   **Granular Memory Control:** Total command over conversational context. Hover over any chat message to individually delete specific turns from the AI's context window.
*   **GitHub Integration:** Search your GitHub repositories, clone one directly into a local destination folder with live progress output, then inspect branch state, create or switch branches, commit, pull, push, review changed-file diffs, browse open pull requests and issues, and inspect recent GitHub Actions runs from the sidebar.

### 🖥️ Persistent Shell Session
*   **Stateful WebSocket Shell:** A built-in terminal (powered by `xterm.js` and `pwsh`) that stays alive. Running `.\\venv\\Scripts\\activate.ps1` or setting environment variables will persist for your entire session.
*   **Seamless Integration:** Minimize or maximize the shell directly above your workflow—perfect for testing the code changes you just applied through the UI.

### 📁 Advanced File Visualization
*   **Code Highlights & Markdown:** Premium dark-themed syntax highlighting for all major languages.
*   **Live Preview Matrix:**
    *   **Images & Video:** Native rendering directly within the viewer.
    *   **Interactive HTML Sandbox:** One-click toggle between HTML source code and a live rendered preview iframe.
    *   **PDF Viewer:** Read technical specifications without leaving the environment.
*   **Multi-Repository Sessions:** IndexedDB isolates embeddings, chat logs, and files. Switch contexts instantly between multiple local projects without needing to re-index.

---

## 🛠️ Architecture

*   **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons.
*   **Agent Intelligence:** `@google/genai` (Gemini API 3.0+).
*   **Storage Layer:** `idb` (IndexedDB Wrapper) schema v2 for massive file blobs, embeddings, and chat histories.
*   **Hygiene & Typing:** Full ESLint 9 (Flat Config) & `tsc` strict typescript toolchain (`npm run lint`).
*   **Tooling/Middleware:** Vite Dev Server with custom HTTP REST (`/api/write-file`, `/api/repo/*`) and WebSocket Upgrades (`/api/terminal-ws`).

---

## 🚀 Quick Start Guide

### The Easiest Way (Windows Only)
If you are on Windows, you can simply run the included batch script. This will automatically detect your package manager, install dependencies if they are missing, start the development server, and open your browser:
```cmd
.\scripts\web-ui.bat
```

### Manual Setup

#### 1. Prerequisites
Ensure you have **Node.js 20+** installed on your machine and a local installation of **PowerShell** for terminal support.

#### 2. Environment Variables
Create a `.env` file in the root directory and add your Google Gemini API key and (optionally) a development protection token:
 ```env
GEMINI_API_KEY="AIzaSy..."
REPOVIEW_DEV_TOKEN="your-local-dev-token-optional"
GITHUB_TOKEN="your-github-token-optional"
 ```

Notes:
- `GEMINI_API_KEY` is required for the local dev middleware that proxies requests to the Gemini API.
- `REPOVIEW_DEV_TOKEN` is optional. If omitted, the dev server will generate a token at startup and print it to the console. The token is used to protect local `/api/*` endpoints from unauthorized cross-origin or programmatic access.
- `GITHUB_TOKEN` is optional. If present, it is used for GitHub repository search, private repository clone/import, and sidebar GitHub API features such as Actions, pull requests, and issues.

#### GitHub Token Setup
If you want to search private repositories, clone/import private repositories, or use the full sidebar GitHub panel, create a GitHub personal access token and place it in `.env` as `GITHUB_TOKEN`.

Recommended setup:
1. Open `GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens`.
2. Generate a new fine-grained token.
3. Choose the owner that contains the repository you want to inspect.
4. Limit access to the specific repository when possible.
5. Grant permissions based on what you want to use:
    - `Contents: Read` for private repository clone/import.
    - `Actions: Read` for GitHub Actions runs.
    - `Pull requests: Read` for open PRs.
    - `Issues: Read` for open issues.
6. Copy the token and add it to `.env`.

Example:
```env
GITHUB_TOKEN="github_pat_..."
```

Notes:
- Fine-grained tokens are preferred over classic tokens.
- If your organization blocks fine-grained tokens, you may need a classic token instead.
- Repository search can succeed with a token that still fails later for clone/import or GitHub panel data if the token does not include the needed repository permissions.
- Clone/import of private repositories requires `Contents: Read`.
- If clone succeeds but the sidebar later shows `GitHub API returned 403`, the token is missing one of the API permissions above, usually `Actions: Read`, `Pull requests: Read`, or `Issues: Read`.
- The same token is also used for the in-app GitHub repository search and clone/import flow.
- Restart the dev server after adding or changing `GITHUB_TOKEN`.

#### 3. Install Dependencies
Install all project dependencies:
```bash
npm install
```

#### 4. Run the Interface
Launch the development server. The UI and local API routes now run through the bundled Express server, with Vite attached in middleware mode during development.

```bash
npm run dev
```

#### 5. Access
Open your browser and navigate to `http://localhost:3000`. 
Upload your project directory to initialize a pristine RAG session and begin your agentic workflow!

### Production-style Local Run
Build the client bundle and start the Express server serving `dist/`:

```bash
npm run build
npm run start
```

---

## 💡 Workflow Concepts

1. **Index & Understand**: Open a large repo. Let **repoview** index the text and media automatically. Use "Full Review" to get a bird's-eye architectural breakdown.
2. **Diagnose & Plan**: Chat with the UI to locate bugs. The model generates code to fix issues based solely on the grounded local context.
3. **Execute & Test**: Click **Apply** on the generated code blocks. Open the internal persistent terminal, kick off your test suite, and iterate fast.

---

*Engineered with ⚡ using React, Vite, and Google Gemini.*
*Warning: Bi-directional filesystem writes are fundamentally powerful. Use carefully within managed version-control environments!*
