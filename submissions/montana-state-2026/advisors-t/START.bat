@echo off
setlocal
cd /d "%~dp0"
title Campus Advisor

where python >nul 2>nul
if errorlevel 1 goto :nopython

if not exist ".venv\Scripts\python.exe" call :makevenv
if errorlevel 1 goto :fail
call ".venv\Scripts\activate.bat"

echo Checking packages...
python -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto :fail

if not exist ".env" goto :newenv
findstr /r /c:"^ANTHROPIC_API_KEY=sk-" ".env" >nul
if errorlevel 1 goto :nokey

echo.
echo Campus Advisor is starting at http://127.0.0.1:8000
echo Keep this window open while you use it. Close it to stop the app.
echo.
start "" cmd /c "timeout /t 4 >nul & start http://127.0.0.1:8000"
python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
exit /b 0

:makevenv
echo Creating the Python environment. This happens only the first time...
python -m venv .venv
exit /b %errorlevel%

:newenv
copy ".env.example" ".env" >nul
echo.
echo First run: paste your Anthropic API key in the .env file that opens now.
echo Save the file, close Notepad, then double-click START.bat again.
notepad ".env"
exit /b 0

:nokey
echo.
echo The .env file has no ANTHROPIC_API_KEY. Paste your key after ANTHROPIC_API_KEY= then save.
notepad ".env"
pause
exit /b 1

:nopython
echo Python is not installed. Install Python 3.11 or newer from https://www.python.org/downloads/
echo During setup, check the box "Add python.exe to PATH". Then run START.bat again.
pause
exit /b 1

:fail
echo.
echo Something went wrong. Read the message above, then try again.
pause
exit /b 1
