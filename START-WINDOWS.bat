@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js 22 or newer first. & pause & exit /b 1)
call node scripts\setup.mjs
call npm ci
if errorlevel 1 (pause & exit /b 1)
call npm run build
if errorlevel 1 (pause & exit /b 1)
echo Open http://localhost:4000 in your browser.
echo MongoDB must be running locally. Read README.md if startup fails.
call npm start
pause
