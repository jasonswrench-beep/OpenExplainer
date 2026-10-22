@echo off
title OpenExplainer: get the AI program
cd /d "%~dp0"
echo This gets the small program (llama.cpp, MIT licence) that runs the built-in AI model,
echo checks it against the exact build that was read through, and puts it where OpenExplainer
echo and its installer will find it. It is about 25 MB to download. Nothing is installed on this PC.
echo.
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & pause & exit /b 1)
rem With nothing after the name it fetches the build for this PC's kind of processor. Add arm64 or x64 to choose (for an installer for the other kind of PC).
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" (set KIND=arm64) else (set KIND=x64)
if not "%~1"=="" set KIND=%~1
node tools\get-ai-runtime.mjs %KIND%
echo.
pause
