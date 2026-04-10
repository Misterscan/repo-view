# Scripts

This directory contains standalone execution wrappers and utility scripts.

## `dev-ui.bat`
A simple Windows batch executable meant to standardize launching the project.
- Automatically installs missing dependencies using your preferred package manager (npm, pnpm, yarn).
- Runs `npm run dev` to start the Vite development server and proxies via Express.
- Automatically opens a browser to `http://localhost:3000` once the server starts.
- Eliminates the need to use an IDE or standard terminal to initialize the **repoview** interface for end-users.

## `build-start-ui.bat`
A Windows batch executable that builds and runs the production version of the UI.
- Installs dependencies if needed.
- Runs `npm run build` to create an optimized production build.
- Serves the built application locally using `npm run start`.
- Automatically opens browser to `http://localhost:3000` once the server starts.

## `start-ui.bat`
A Windows batch for testing before deployment.
 - Automatically opens browser to `http://localhost:3000` once the server starts.

*(Note: When developing custom helper scripts that write files via the API, absolute external writes will be blocked by default. You can enable them for dev loops by passing `ALLOW_EXTERNAL_WRITES=1`.)*


