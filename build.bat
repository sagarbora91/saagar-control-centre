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

echo [1/6] Installing dependencies...
call npm install || goto :fail

if not exist "android" (
  echo [2/6] Adding Android platform...
  call npm run add:android || goto :fail
) else (
  echo [2/6] Android platform already present - skipping.
)

echo [3/6] Syncing web assets into Android project...
call npm run sync || goto :fail

REM  Capacitor sync regenerates the Android project, so the Saagar native
REM  plugins, allowBackup=false, versionCode/minSdk and fail-closed release
REM  signing must be re-stamped after every sync. Skipping this produces an
REM  APK missing them (owner direction OD-K5).
echo [4/6] Re-applying native plugin and manifest overrides...
call node build-overrides\apply-overrides.js || goto :fail

REM  minSdk is 23, so the shipped assets must be transpiled for Chrome 44.
REM  Without this the app loads but fails at runtime on API 23 devices.
echo [5/6] Preparing API 23 compatible assets...
call npm run prepare:api23 || goto :fail

echo [6/6] Building debug APK with Gradle...
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
