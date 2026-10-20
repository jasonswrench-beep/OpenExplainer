@echo off
title OpenExplainer capture test - click by click
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the capture helper, then watches your mouse clicks for 20 seconds.
echo Each click, on any program, is saved as a picture of the WHOLE screen the click was on, taken
echo just before the program reacts, with a note of what was clicked (its name, kind and shortcut keys).
echo A click on a password box is reported only as "a password box". The keyboard is never watched.
echo The pictures show everything on your screen, so delete them if they show anything private.
echo They are saved in a folder called "Test captures" inside the OpenExplainer folder.
echo.
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
echo Building the helper. The first build takes a minute or two.
cargo build --release --manifest-path capture-helper\Cargo.toml
if errorlevel 1 (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
node tools\capture-helper-test.mjs clicks
if errorlevel 3 (echo. & echo Nothing was captured. & goto :end)
if errorlevel 1 (echo. & echo THE CLICK CAPTURE DID NOT WORK. Copy the text above and send it to Claude. & goto :end)
echo.
echo Does each picture show the screen just before the click, and does each note say what you clicked?
:end
echo.
pause
