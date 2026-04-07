# Components

This directory contains the core React components that construct the **repoview** user interface. 
The application relies heavily on Tailwind CSS for styling and `lucide-react` for iconography.

## Key Architectures

### `ChatInterface.tsx`
The primary interaction window with the Agent.
- Renders the conversational UI with `react-markdown`.
- Controls the AI thought/loading states and LLM selection.
- Features **Bi-Directional Action** via inline code modifications: custom `<CodeBlock>` components expose a `Save`/`Apply` hook that hits the Vite `write-file` middleware.

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

### `Terminal.tsx`
A crucial feature for agentic workflows.
- Implements `xterm.js` and `xterm-addon-fit`.
- Establishes a raw WebSocket connection (`ws://`) to the Vite dev server to stream real-time standard output (stdout) and error (stderr) from a persistent local `pwsh` (PowerShell) instance.
