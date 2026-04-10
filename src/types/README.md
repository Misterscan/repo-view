# Types

This directory centralizes TypeScript interfaces and configurations utilized throughout the entire application stack.

## `index.ts`
The primary source of truth for the data schema mapping across IndexedDB, React state, and backend APIs.

### Key Types
- **`FileNode`**: The standard TypeScript manifestation of files loaded in the workspace. Defines relative paths, text contents, binary buffers via Blobs, and file typing.
- **`Message`**: The object schema that represents conversational turns (user, model, ai) tracking raw dialogue values across components.
- **`ChunkDoc`**: A chunk of a larger file, complete with its raw text and dense embedding vector (`vec`), enabling chunk-level RAG. Can optionally contain media attributes (`isMedia`, `mimeType`).
- **`TreeNode`**: Forms the nested hierarchical structure consumed by `FileTree.tsx`.
- **Git / GitHub Payloads**: Interfaces documenting the structure of `GitStatusSummary`, `GitHubInspection`, and `GitHubRepoSearchResult` mapped directly to GitHub's REST API responses.

