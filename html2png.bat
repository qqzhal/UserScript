@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw html2png_gui.py
    goto :eof
)
where pyw >nul 2>nul
if %errorlevel%==0 (
    start "" pyw "%~dp0html2png_gui.py"
    goto :eof
)
start "" py -3 "%~dp0html2png_gui.py"
