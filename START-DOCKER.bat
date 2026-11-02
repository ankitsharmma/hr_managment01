@echo off
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (echo Install and start Docker Desktop first. & pause & exit /b 1)
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js 22 or newer to generate secure local configuration. & pause & exit /b 1)
call node scripts\setup.mjs
if errorlevel 1 (pause & exit /b 1)
docker compose up --build -d
if errorlevel 1 (pause & exit /b 1)
echo Open the app at the address configured by APP_HOST and APP_PORT in .env.
echo If this is the first run, the generated admin password was printed above.
pause
