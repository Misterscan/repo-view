
@echo off
rem Safe helper to start the React+Vite dev server on Windows
rem - Installs npm deps if node_modules is missing
rem - Starts `npm run dev`
rem - Attempts to open the default browser at http://localhost:3000 after a short delay

setlocal
pushd %~dp0\..\

rem detect package manager (default to npm)
set PM=npm

if exist package-lock.json (
	set PM=npm
) else if exist pnpm-lock.yaml (
	set PM=pnpm
) else if exist yarn.lock (
	set PM=yarn
)

echo Using package manager: %PM%

if not exist node_modules (
	echo node_modules not found — running install with %PM%...
	if "%PM%"=="npm" (
		npm install || goto :install_failed
	) else if "%PM%"=="pnpm" (
		pnpm install || goto :install_failed
	) else if "%PM%"=="yarn" (
		yarn install || goto :install_failed
	)
)

echo Starting dev server: npm run dev
rem Open browser shortly after starting dev server in background
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"

npm run dev

goto :eof

:install_failed
echo Dependency installation failed. Fix errors and re-run this script.
exit /b 1
