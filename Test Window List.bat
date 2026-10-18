@echo off
title OpenExplainer capture test - window list
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the capture helper and asks it for a list of your open windows.
echo Nothing is captured or saved. It only reads the window titles, sizes and positions.
echo.
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
echo Building the helper. The first build takes a minute or two.
cargo build --release --manifest-path capture-helper\Cargo.toml
if errorlevel 1 (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
node tools\capture-helper-test.mjs list
if errorlevel 1 (echo. & echo THE LIST DID NOT WORK. Copy the text above and send it to Claude. & goto :end)
echo Check the list against what is on your screen. Is anything missing, or listed that should not be?
:end
echo.
pause
