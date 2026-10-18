@echo off
title OpenExplainer capture test - region capture
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the capture helper, shows your screens, and lets you capture a RECTANGLE of one screen.
echo You type four numbers (left, top, width, height), or "all" for the whole screen.
echo The picture is saved in a folder called "Test captures" inside the OpenExplainer folder,
echo and it opens so you can check it by eye. It is a copy of what is on the screen, so anything
echo in front of that area is in the picture. Nothing else is touched.
echo.
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
echo Building the helper. The first build takes a minute or two.
cargo build --release --manifest-path capture-helper\Cargo.toml
if errorlevel 1 (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
node tools\capture-helper-test.mjs region
if errorlevel 3 (echo. & echo Nothing was captured. & goto :end)
if errorlevel 1 (echo. & echo THE CAPTURE DID NOT WORK. Copy the text above and send it to Claude. & goto :end)
echo.
echo Is the picture the rectangle you asked for, with the right size and nothing missing?
:end
echo.
pause
