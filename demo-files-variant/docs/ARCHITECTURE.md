# Architecture Notes (Variant)

## High-level Flow
frontend
  -> express api
  -> repo upload / github / gemini
  -> cache layer + indexeddb + server_uploads

## Components
- Frontend: file tree, viewer, chat, and compare panels.
- API: write routes, repository utilities, terminal websocket, model calls.
- Cache layer: temporary response cache for repeated analysis prompts.
- Indexed session store: embeddings and message history per session.

## Operational Notes
- Session indexing runs after upload and after branch change.
- Terminal state is persistent for the active connection.
- Diff previews include metadata checksum validation before apply.
