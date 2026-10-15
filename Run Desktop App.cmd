@echo off
cd /d "%~dp0"
if exist "dist\win-unpacked\حساب.exe" (
    start "" "dist\win-unpacked\حساب.exe"
) else (
    npm start
)
