# Components

This directory contains the core React components that construct the **repoview** user interface. 
The application relies heavily on Tailwind CSS for styling and `lucide-react` for iconography.

## Key Architectures

### `ChatInterface.tsx`
The primary interaction window with the Agent.
- Renders the conversational UI with `react-markdown`.
- Controls the AI thought/loading states and LLM selection.
- Features **Bi-Directional Action** via inline code modifications: custom `<CodeBlock>` components expose a `Save`/`Apply` hook that can preview a diff against the current file before hitting the `write-file` middleware.
- Features a **Token Tracker UI** to estimate real-time usage (draft input and RAG context size).

### `App.tsx`
The main application entry point orchestrating top-level state and routing.
- Handles the two-step zip upload flow: first comparing changes visually via a Reindex diff modal, then executing the server-side extraction and update.
- Passes token estimation metrics from the hooks directly into the UI components.

### `Sidebar.tsx`
The primary navigation and control panel.
- Handles workspace initialization (folder/zip uploads) and session switching (`RepoSession`).
- Displays indexing progress naturally.
- Hosts the GitHub integration panel (repository search, cloning with progress logs, git branch/diff status, actions like commit/pull/push, and GitHub Actions/Issues/PRs). Note: Clone/import needs `Contents: Read`, while other GitHub APIs require `Actions: Read` or `Issues: Read`.
- Contains global toggles like External Writes configuration and Terminal view.

### `Terminal.tsx`
A persistent, WebSocket-backed terminal for agentic workflows.
- Implements `xterm.js` and `xterm-addon-fit`.
- Establishes a raw WebSocket connection (`ws://`) to the Express dev server to stream real-time output (stdout/stderr) from a persistent local `powershell.exe` instance.
- Enables running test suites or project specific commands seamlessly in the UI.

### `FileViewer.tsx`
A multi-format document preview pane.
- Renders code using stylized `<pre><code>` blocks.
- Uses `<iframe>` tags to safely render structural output, layout tests, and `PDFs`.
- Embeds native HTML5 media elements (`<img>`, `<video>`) natively resolving Blob URLs.

### `FileTree.tsx`
Recursively renders the folder and file hierarchy of the active repository session.
- Provides click-to-preview functionality directly integrating with the active selected `FileNode` state.
