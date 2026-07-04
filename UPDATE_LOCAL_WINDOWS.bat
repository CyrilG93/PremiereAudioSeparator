@echo off
setlocal

:: // Launch the local CEP updater without rebuilding the Windows installer.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\audioseparator-update-local-windows.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Local update failed with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo Local update complete. Restart Premiere Pro to reload the panel.
pause
