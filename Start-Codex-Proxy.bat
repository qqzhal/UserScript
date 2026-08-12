@echo off
setlocal EnableExtensions

rem ---- Find the newest installed Codex package (auto-adapts after Store updates) ----
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation"`) do set "CODEX_DIR=%%I"

if not defined CODEX_DIR (
    echo [ERROR] OpenAI.Codex package not found. Make sure it is installed from the Microsoft Store.
    pause
    exit /b 1
)

set "CODEX_EXE=%CODEX_DIR%\app\ChatGPT.exe"
if not exist "%CODEX_EXE%" (
    echo [ERROR] Launcher not found: %CODEX_EXE%
    pause
    exit /b 1
)

rem ---- Refuse to run while Codex is already running ----
tasklist /FI "IMAGENAME eq ChatGPT.exe" 2>NUL | find /I "ChatGPT.exe" >NUL
if not errorlevel 1 (
    echo [WARN] Codex is already running. Please fully quit it first, then run this again.
    pause
    exit /b 1
)

rem ---- Launch Codex with proxy (Codex only; system proxy untouched) ----
start "" "%CODEX_EXE%" --proxy-server=http://127.0.0.1:10808
echo Codex started with proxy: http://127.0.0.1:10808
ping -n 2 127.0.0.1 >NUL
endlocal
