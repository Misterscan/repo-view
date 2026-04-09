# Scripts

This directory contains standalone execution wrappers and utility scripts.

## `web-ui.bat`
A simple Windows batch executable meant to standardize launching the project.
- Automatically installs missing dependencies using your preferred package manager (npm, pnpm, yarn).
- Executes `npm run dev` to start the Vite development server and proxies via Express.
- Automatically opens a browser to `http://localhost:3000` once the server starts.
- Eliminates the need to use an IDE or standard terminal to initialize the **repoview** interface for end-users.