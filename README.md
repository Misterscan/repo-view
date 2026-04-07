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

### 💻 Bi-Directional Filesystem Execution
*   **1-Click Apply:** Found a fix in the chat? Simply hover over the AI-generated code block and click **APPLY**. The integrated Vite middleware will write the updated code directly to your local disk.
*   **Granular Memory Control:** Total command over conversational context. Hover over any chat message to individually delete specific turns from the AI's context window.

### 🖥️ Persistent Shell Session
*   **Stateful WebSocket Shell:** A built-in terminal (powered by `xterm.js` and `pwsh`) that stays alive. Running `venv\Scripts\activate` or setting environment variables will persist for your entire session.
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
*   **Tooling/Middleware:** Vite Dev Server with custom HTTP REST (`/api/write-file`) and WebSocket Upgrades (`/api/terminal-ws`).

---

## 🚀 Quick Start Guide

### 1. Prerequisites
Ensure you have **Node.js 20+** installed on your machine and a local installation of **PowerShell** for terminal support.

### 2. Environment Variables
Create a `.env` file in the root directory and add your Google Gemini API key:
```env
VITE_GEMINI_API_KEY="AIzaSy..."
```

### 3. Install Dependencies
Install all project dependencies using npm:
```bash
npm install
```

### 4. Run the Interface
Launch the development server. (Note: The `write-file` and `terminal` APIs require running in development mode as they hook into Vite's middleware architecture).

```bash
npm run dev
```

### 5. Access
Open your browser and navigate to `http://localhost:5173`. 
Upload your project directory to initialize a pristine RAG session and begin your agentic workflow!

---

## 💡 Workflow Concepts

1. **Index & Understand**: Open a large repo. Let **repoview** index the text and media automatically. Use "Full Review" to get a bird's-eye architectural breakdown.
2. **Diagnose & Plan**: Chat with the UI to locate bugs. The model generates code to fix issues based solely on the grounded local context.
3. **Execute & Test**: Click **Apply** on the generated code blocks. Open the internal persistent terminal, kick off your test suite, and iterate fast.

---

*Engineered with ⚡ using React, Vite, and Google Gemini.*
*Warning: Bi-directional filesystem writes are fundamentally powerful. Use carefully within managed version-control environments!*
