# Architecture Notes

## High-level Flow
frontend
  -> express api
  -> repo upload / github / gemini
  -> indexeddb + server_uploads

## Components
- Frontend: displays file tree, viewer, and chat panel.
- API: handles writes, repository utilities, terminal websocket, and model calls.
- Indexed session store: keeps embeddings and messages per session.

## Operational Notes
- Session indexing runs after upload.
- Terminal state is persistent for the active connection.
- Diff previews are generated before writes are applied.
