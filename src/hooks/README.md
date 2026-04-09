# Hooks

This directory houses the complex business logic, separating state management and side effects from the pure React UI components.

## `useAgent.ts`
Manages the orchestration between the Chat UI, IndexedDB RAG database, and the Gemini API.
- **RAG Generation:** Responsible for communicating with `rag.worker.ts` to perform non-blocking cosine-similarity search.
- **Multimodal Prompting:** Extracts inline media buffers from the UI selection and sends them natively to the Gemini API vision model.
- **Architecture Auditing:** Implements the `startFullReview` behavior, which runs a context-safe budgeting pass to analyze an entire raw codebase.
- **Token Estimation:** Calculates `char / 4` heuristics on draft input and the final requested payload context to update the UI on how large a request will be.

## `useIndexer.ts`
Manages file parsing, chunking, embedding generation, and session states.
- **File Parsing & Storage:** Intercepts File inputs without immediately parsing them (preventing memory overflows), saving raw Blobs to `db.ts`.
- **Background Embedding:** Converts files into vectorized chunks (`ChunkDoc`) and intelligently skips vectorizing large binary media (instead falling back to metadata search).
- **Session Control:** Maintains active session history variables tied to the specific IndexedDB instance loaded.
