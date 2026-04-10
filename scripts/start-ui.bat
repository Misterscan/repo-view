@echo off
rem Safe helper to start the React+Vite app for production on Windows
rem - Assumes production assets are already built (run build-start-ui.bat first)
rem - Starts `npm run start`

setlocal
pushd %~dp0\..\

echo Starting production server: npm run start
set REPOVIEW_VERBOSE=1
call npm run start
rem Open browser shortly after starting prod server in background
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
