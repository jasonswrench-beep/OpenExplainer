@echo off
title OpenExplainer MCP test
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the app, starts it the way an AI assistant would (with --mcp, so no window shows), and talks to it
echo as an assistant does: it makes a project, writes pages, builds the index and a guide, runs the book check and
echo makes every kind of export, all inside a temporary folder that is deleted afterwards.
echo.
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
if not exist node_modules (call npm.cmd install || goto :end)
echo Step 1 of 2: building the app. The first build takes a few minutes.
cargo build --manifest-path src-tauri\Cargo.toml
if errorlevel 1 (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
echo Step 2 of 2: talking to it as an assistant would. This takes about a minute.
node tools\mcp-e2e.mjs
if errorlevel 1 (echo. & echo SOME CHECKS FAILED. Copy the text above and send it to Claude. & goto :end)
echo.
echo All good: the MCP server works.
:end
echo.
pause
