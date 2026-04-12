# logs/

This directory handles application auditing, diagnostics, and automated maintenance.

## Key Files

*   **`server.log`**: Raw HTTP traffic logs. This file is automatically summarized and purged every 10 minutes by the server background task.
*   **`summary.log`**: Historical, condensed summaries of server activity. Each entry includes hit counts and average response times for specific routes.
*   **`external-write-approvals.jsonl`**: A persistent audit log of every filesystem path that has been explicitly approved for absolute writes via the `/api/write-approve` endpoint.
*   **`file-writes.log`**: A granular audit of every file modification made by the AI agent, including timestamps and byte changes.
*   **`backups/`**: (Directory) Best-effort backups of files before they are overwritten by a write request.

## Automation
Log rotation is handled by `scripts/summarize-logs.ts` which moves data from the raw log to the summary log periodically.
