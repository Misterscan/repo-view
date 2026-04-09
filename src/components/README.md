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

### `FileViewer.tsx`
A highly dynamic and reactive display window.
- Renders standard code using stylized `<pre><code>` blocks.
- Uses `<iframe>` tags to safely render valid `HTML` files and `PDFs`.
- Embeds native HTML5 media elements (`<img>`, `<video>`) dynamically resolving blob URLs.

### `Sidebar.tsx`
The navigational spine of the application.
- Handles user inputs for new folder/repository uploads.
- Displays `indexState` progress natively inside the panel.
- Controls session switching capabilities allowing the user to seamlessly navigate between past loaded repositories.
- Hosts the GitHub integration panel for GitHub repository search, clone/import into a local folder with live progress logs, local git status, changed-file diff viewing, commit/pull/push/checkout actions, branch creation and switching, open pull requests, open issues, and recent GitHub Actions runs.
- The GitHub panel uses a single token for multiple operations, but different features require different GitHub permissions. Clone/import of private repositories needs `Contents: Read`, while Actions, PRs, and Issues require their own read permissions and can independently fail with `GitHub API returned 403`.

### `Terminal.tsx`
A crucial feature for agentic workflows.
- Implements `xterm.js` and `xterm-addon-fit`.
- Establishes a raw WebSocket connection (`ws://`) to the Express dev server to stream real-time standard output (stdout) and error (stderr) from a persistent local `powershell.exe` instance.
