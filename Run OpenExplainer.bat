@echo off
title OpenExplainer
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & pause & exit /b 1)
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & pause & exit /b 1)
echo Checking that everything OpenExplainer needs is installed. This takes a few minutes the first time.
call npm.cmd install || (pause & exit /b 1)
call npm.cmd run tauri -- dev
pause
