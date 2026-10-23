@echo off
title OpenExplainer: build the installer
chcp 65001 >nul
cd /d "%~dp0"
echo This builds the release program and an installer you can run on a PC (it installs for the person who runs it, with no
echo administrator rights). It takes several minutes the first time. The installer is a normal setup file with the AI program,
echo the capture helper and the licences inside; the AI model itself is not inside (it downloads when the author turns it on).
echo.
where node >nul 2>nul || (echo Node.js is not installed. Get it from nodejs.org, then run this again. & goto :end)
where cargo >nul 2>nul || (echo Rust is not installed. Get it from rustup.rs, then run this again. & goto :end)
if not exist node_modules (call npm.cmd install || goto :end)
if not exist "src-tauri\runtime\llama\llama-server.exe" (
  echo The AI program is not here yet. Fetching it first.
  call "Get AI Runtime.bat"
  if not exist "src-tauri\runtime\llama\llama-server.exe" (echo The AI program is still missing, so the installer cannot be built. & goto :end)
)
echo.
echo Step 1 of 2: building the capture helper.
cargo build --release --manifest-path capture-helper\Cargo.toml || (echo. & echo THE CAPTURE HELPER DID NOT BUILD. Copy the red text above and send it to Claude. & goto :end)
echo.
echo Step 2 of 2: building the program and the installer.
call npm.cmd run tauri -- build || (echo. & echo THE BUILD FAILED. Copy the red text above and send it to Claude. & goto :end)
echo.
echo Done. The installer is in src-tauri\target\release\bundle\nsis (OpenExplainer_..._x64-setup.exe).
start "" "src-tauri\target\release\bundle\nsis"
:end
echo.
pause
