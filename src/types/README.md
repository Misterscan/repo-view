# Types

This directory centralizes TypeScript interfaces and configurations utilized throughout the entire application stack.

## `index.ts`
The primary source of truth for the data schema mapping across IndexedDB, React state, and backend APIs.

### Key Types
- **`RepoFile`**: The standard JSON manifestation of files loaded in the workspace. Defines paths, binary buffers via blob links, text contents, and metadata.
- **`ChatMessage`**: The object schema that represents a conversational turn between the User and the Gemini Agent, tracking parts (text and file inclusions) natively.
- **`ChunkDoc`**: A chunk of a larger file, complete with bounding start/end lines and its raw dense embedding vector, enabling chunk-level RAG.
- **Api Payloads**: Defines requests and responses payload expectations for Express endpoints (like `/api/repo/compare` changes diffs).