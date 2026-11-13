@echo off
title OpenExplainer: test the installed program
chcp 65001 >nul
cd /d "%~dp0"
echo This starts the INSTALLED OpenExplainer (the one the installer put in %LOCALAPPDATA%\OpenExplainer, not the development one),
echo uses it the way a person would (a small book, the previews, every dialog, the Capture window list and, if the AI model is
echo downloaded, Test the AI), and then closes it. Run the installer first. Do not use the mouse or keyboard for a minute or two.
echo.
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
if not exist "%LOCALAPPDATA%\OpenExplainer\openexplainer.exe" (echo OpenExplainer is not installed. Run the installer in src-tauri\target\release\bundle\nsis first. & goto :end)
node tools\release-smoke.mjs
if errorlevel 1 (echo. & echo SOME CHECKS FAILED. Copy the text above and send it to the AI assistant. & goto :end)
echo.
echo All good: the installed program works.
:end
echo.
pause
