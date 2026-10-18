@echo off
title OpenExplainer capture test - helper
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the capture helper, checks its own tests, and then asks it "are you there?".
echo.
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
echo Step 1 of 3: building the helper. The first build takes a minute or two.
cargo build --release --manifest-path capture-helper\Cargo.toml
if errorlevel 1 (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
echo Step 2 of 3: running the helper's own tests.
cargo test --release --manifest-path capture-helper\Cargo.toml
if errorlevel 1 (echo. & echo SOME TESTS FAILED. Copy the text above and send it to Claude. & goto :end)
echo.
echo Step 3 of 3: asking the helper "are you there?".
node tools\capture-helper-test.mjs ping
if errorlevel 1 (echo. & echo THE HELPER DID NOT ANSWER AS EXPECTED. Copy the text above and send it to Claude. & goto :end)
echo.
echo ALL GOOD. The helper builds, passes its tests and answers.
:end
echo.
pause
