# Libraries & Utilities

This layer provides essential services supporting UI actions, acting as the middleware bridging external logic patterns with the internal React hooks.

## `db.ts`
The persistent storage engine wrapping IndexedDB (via `idb`).
- Handles complex `by-session` indexing to support multi-repository workspaces.
- Uses `Blob` storage directly enabling lazy-loading for vast amounts of code and binary assets.

## `gemini.ts`
The wrapper and initialization layer for `@google/genai`.
- Hosts our core math utilities including `cosineSimilarity` and lightweight `estimateTokens`.
- Provides an `exponentialBackoff` safety wrapper logic for resilient API usage in rate-limited environments.
- Manages MIME type inference via embedded mapping functions needed for accurate API chunk-sorting and Google Files API operations perfectly aligning with `App.tsx` repository diff injections.

## `api.ts`
Standardized API interaction utility.
- Provides robust response parsing (`readApiResult`, `readApiJson`) to ensure safe frontend-to-backend communication.
- Handles edge cases where missing JSON or misconfigured endpoints return HTML, providing context-aware error messages.

## `constants.ts` & `utils.ts`
Standardized configurations, shared global constants (LLM limits), extension filtering arrays (`IGNORED_EXTS`), component helper functions (e.g., Tailwind class merging functionality `cn()`), and other immutable logic blocks.
