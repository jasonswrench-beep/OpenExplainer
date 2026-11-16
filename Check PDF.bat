@echo off
title Check a PDF with veraPDF
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & pause & exit /b 1)
echo This checks a PDF made by OpenExplainer against PDF/UA-1, the accessible PDF standard, with veraPDF.
echo Nothing in any project is changed.
echo.
node tools\outside-checks\run.ts pdf %*
echo.
pause
