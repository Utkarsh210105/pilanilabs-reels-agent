@echo off
title PilaniLabs Reels Agent
cd /d "%~dp0"

echo Starting PilaniLabs Reels Agent...
echo Keep this window open while you use the dashboard. Close it to stop.
echo.

rem Open the dashboard once the server has had a few seconds to start.
start "" /min cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:4100"

call npm start
echo.
echo The reels agent stopped. If you see an error above, send a screenshot.
pause
