@echo off
title Check an e-book with EPUBCheck
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & pause & exit /b 1)
echo This checks an e-book (.epub) made by OpenExplainer with EPUBCheck, the W3C checker.
echo Nothing in any project is changed. It asks before it downloads anything.
echo.
node tools\outside-checks\run.ts epub %*
echo.
pause
