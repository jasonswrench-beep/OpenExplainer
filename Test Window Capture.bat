@echo off
title OpenExplainer capture test - window capture
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the capture helper, shows your open windows, and lets you pick ONE to capture.
echo The picture is saved in a folder called "Test captures" inside the OpenExplainer folder,
echo and it opens so you can check it by eye. Nothing else is touched.
echo.
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
echo Building the helper. The first build takes a minute or two.
cargo build --release --manifest-path capture-helper\Cargo.toml
if errorlevel 1 (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
node tools\capture-helper-test.mjs capture
if errorlevel 3 (echo. & echo Nothing was captured. & goto :end)
if errorlevel 1 (echo. & echo THE CAPTURE DID NOT WORK. Copy the text above and send it to Claude. & goto :end)
echo.
echo Does the picture show the right window, with nothing missing or covered, and are the colours right?
:end
echo.
pause
