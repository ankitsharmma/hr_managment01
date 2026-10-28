@echo off
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (echo Install and start Docker Desktop first. & pause & exit /b 1)
docker compose up --build -d
if errorlevel 1 (pause & exit /b 1)
echo Open http://localhost:4000
echo Email: admin@udata.local
echo Initial password: ChangeMe123!
echo Change it in Account and settings after first login.
pause
