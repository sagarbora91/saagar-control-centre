@echo off
REM ============================================================
REM  Saagar Traders - Business Control Centre V4
REM  One-click offline APK builder
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Saagar Control Centre - building offline Android APK
echo ==========================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npm not found. Install Node.js LTS from https://nodejs.org
  pause
  exit /b 1
)

echo [1/4] Installing dependencies...
call npm install || goto :fail

if not exist "android" (
  echo [2/4] Adding Android platform...
  call npm run add:android || goto :fail
) else (
  echo [2/4] Android platform already present - skipping.
)

echo [3/4] Syncing web assets into Android project...
call npm run sync || goto :fail

echo [4/4] Building debug APK with Gradle...
pushd android
call gradlew.bat assembleDebug || (popd & goto :fail)
popd

echo.
echo ==========================================================
echo   BUILD COMPLETE
echo ==========================================================
echo   APK location:
echo   android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo   Copy that file to the phone and tap it to install.
echo ==========================================================
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Build step failed. See messages above.
echo See README.md section 9 (Troubleshooting).
pause
exit /b 1
