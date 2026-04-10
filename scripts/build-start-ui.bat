
@echo off
rem Safe helper to build the React+Vite app for production on Windows
rem - Installs npm deps if node_modules is missing
rem - Runs `npm run lint` && `npm run build` && `npm start`

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

echo Linting code: npm run lint
call npm run lint || goto :lint_failed
echo Building production assets: npm run build
call npm run build || goto :build_failed
echo Starting production server: npm run start
rem Open browser shortly after starting prod server
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
setx REPOVIEW_VERBOSE 1
call npm run start
goto :eof
:install_failed
echo Dependency installation failed. Fix errors and re-run this script.
exit /b 1
:lint_failed
echo Linting failed. Fix errors and re-run this script.
exit /b 1
:build_failed
echo Build failed. Fix errors and re-run this script.
exit /b 1

