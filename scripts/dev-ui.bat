
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
                call npm install || goto :install_failed
        ) else if "%PM%"=="pnpm" (
                call pnpm install || goto :install_failed
        ) else if "%PM%"=="yarn" (
                call yarn install || goto :install_failed
        )
)

rem Linting is optional in dev mode, but we run it to catch common issues early
echo Linting code: npm run lint
call npm run lint || goto :lint_failed
echo Starting dev server: npm run dev
rem Open browser shortly after starting dev server in background
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"

call npm run dev
:install_failed
echo Dependency installation failed. Fix errors and re-run this script.
goto :lint_failed
:lint_failed
echo Linting failed. Fix errors and re-run this script.
goto :eof
:eof

