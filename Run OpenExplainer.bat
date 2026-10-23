@echo off
title OpenExplainer
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & pause & exit /b 1)
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & pause & exit /b 1)
echo Checking that everything OpenExplainer needs is installed. This takes a few minutes the first time.
call npm.cmd install || (pause & exit /b 1)
echo.
echo Building the capture helper, the small program that takes the pictures.
cargo build --release --manifest-path capture-helper\Cargo.toml || (echo. & echo The capture helper did not build. The app is built with it, so OpenExplainer cannot start without it. Send the text above to Claude. & pause)
echo.
call npm.cmd run tauri -- dev
pause
