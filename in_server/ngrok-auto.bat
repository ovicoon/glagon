:: This file's shortcut should be placed in the server's shell:startup folder.
@echo off
cd /d "%~dp0"

set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_ORIGINS=*

start "OllamaServer" /min ollama serve

start "UvicornServer" /min cmd /k "py -3.15 -m uvicorn gateway:app --host 0.0.0.0 --port 8000"

:check_port
netstat -ano | findstr LISTENING | findstr ":8000" > nul
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak > nul
    goto check_port
)

start "ngrok" /min ngrok http 8000