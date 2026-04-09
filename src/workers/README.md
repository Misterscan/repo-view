# Web Workers

This directory contains logic intended to be executed on a separate thread from the main UI, preventing heavy calculations from causing frame drops or locking the browser.

## `rag.worker.ts`
The Retrieval-Augmented Generation (RAG) worker is the search engine of **repoview**.

- Listens for messages from the main thread containing a query embedding.
- Operates primarily via background database transactions inside IndexedDB (`idb`).
- Retrieves all saved vectorized code chunks for the active workspace.
- Calculates **Cosine Similarity** between the user's string query and the thousands of dense vector properties extracted from the codebase.
- Sorts and returns the most relevant code contexts back to the React UI, bounding results natively within the worker.