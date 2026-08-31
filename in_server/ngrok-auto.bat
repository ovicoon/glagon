:: This file should be placed in the server's shell:startup folder.
@echo off

cd /d "%~dp0"

set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_ORIGINS=*
start /min "OllamaServer" ollama serve

start /min "UvicornServer" uvicorn gateway:app --host 0.0.0.0 --port 8000

:check_port
netstat -ano | findstr LISTENING | findstr ":8000" > nul
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak > nul
    goto check_port
)

start /min "ngrok" ngrok http 8000