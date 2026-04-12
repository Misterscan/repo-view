# src/

This is the React + Vite frontend application source.

## Structure

*   **`components/`**: Reusable UI components (Sidebar, Terminal, FileViewer, Chat, etc.).
*   **`hooks/`**: Custom React hooks for business logic (Indexing, Agent logic, Websocket management).
*   **`lib/`**: Core utilities, API clients, and shared constants.
*   **`store/`**: Global state management (using React context/state patterns).
*   **`types/`**: Shared TypeScript definitions.
*   **`workers/`**: Background Web Workers for processing heavy tasks like RAG embeddings and vector search without locking the main UI thread.

## Tech Stack
- **React 19**
- **Tailwind CSS**
- **Lucide Icons** for UI elements.
- **xterm.js** for the embedded persistent shell.
- **idb** for local IndexedDB management.
