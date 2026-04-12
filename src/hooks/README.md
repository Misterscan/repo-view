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

# IMPORTANT!!!

### _Rate Limiting_

- If using the free tier of Gemini API, you will be rate-limited to 15 requests per minute. This is to prevent abuse and ensure fair usage. If you need to increase this limit, please upgrade your API key.
- You can check your API usage and limits at https://aistudio.google.com/api-keys
- Google AI Studio provides free API keys for developers to use with their applications with a $300 credit for the first 3 months.
- To claim this:
  1. Go to https://aistudio.google.com/api-keys
  2. Sign in with your Google account
  3. Click on "Create API key"
  4. Copy the API key
  5. Paste it in the .env file as GEMINI_API_KEY
  6. Go to https://cloud.google.com/console/project
  7. Click on "Billing" and link your billing account to the project to enable higher usage tiers.
