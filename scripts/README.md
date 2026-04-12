# Scripts

This directory contains standalone execution wrappers and utility scripts for Windows and macOS/Linux.

## 🪟 Windows (.bat)

- **`dev-ui.bat`**: Installs missing dependencies and starts the Vite development server.
- **`build-start-ui.bat`**: Builds the production assets and starts the production server.
- **`start-ui.bat`**: Starts the production server (assumes assets are already built).

## 🍎 macOS / 🐧 Linux (.sh & .command)

- **`dev-ui.sh` / `dev-ui.command`**: Installs missing dependencies and starts the development server.
- **`build-start-ui.sh` / `build-start-ui.command`**: Builds assets and starts the production server.
- **`start-ui.sh` / `start-ui.command`**: Starts the production server.

### Why two formats?

- **`.sh`**: Use these if you are working from the terminal (e.g., `./scripts/dev-ui.sh`).
- **`.command`**: Use these if you want to double-click them from Finder. They are designed to automatically open in a new Terminal window and will stay open if an error occurs so you can read the log.

---

_(Note: When developing custom helper scripts that write files via the API, absolute external writes will be blocked by default. You can enable them for dev loops by passing `ALLOW_EXTERNAL_WRITES=true` to your .env.)_
