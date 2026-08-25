# API 23 emulator acceptance — 2026-08-11

## Result

The final seeded Android APK passed clean-install, navigation, module-open, restart, and runtime-log checks on the `saagar_api23_evidence` Android 6/API 23 x86_64 emulator.

This is virtual-device engineering acceptance. It does not replace owner acceptance on a physical device.

## Repeatable environment

The project now pins and checks the workspace-local Android toolchain through `scripts/android-emulator.ps1`:

- Android SDK: `V:\Co work\Projects\Retail\.android-build\sdk`
- JDK 17: `V:\Co work\Projects\Retail\.android-build\jdk17\jdk-17.0.19+10`
- AVD: `saagar_api23_evidence`
- acceleration: WHPX installed and usable

Commands:

```powershell
npm run android:configure
npm run android:preflight
npm run emulator:api23:start
npm run emulator:api23:status
npm run emulator:api23:stop
```

`android:configure` also generates `android/local.properties` with the pinned SDK path.

## Compatibility corrections verified

- API 23 no longer attempts the WebAssembly SQL path when WebAssembly is unavailable.
- Seed data migrates directly into the encrypted native store on first launch.
- Restart does not reseed or rewrite the 7,878,728-byte seed archive.
- Generated API 23 assets resolve CSS custom properties to legacy-compatible literals.
- Flex fallbacks restore the shell, bottom navigation, KPI layouts, module lists, and three-column module tiles in Chrome 44.
- The synthetic-data warning remains visible and does not intercept navigation.

## Emulator exercise

1. Installed the final APK with `adb install -r`.
2. Cleared app data and launched from a clean state.
3. Confirmed the dashboard and bottom navigation render.
4. Opened Modules and confirmed all 11 module tiles render in the corrected grid.
5. Opened Stock Register and confirmed the module renders.
6. Forced the app to stop and relaunched it.
7. Confirmed the seed archive retained the same size and timestamp before and after restart.
8. Confirmed logcat contained no fatal exception, ANR, uncaught JavaScript, WebAssembly, load, or reseed error.

## Artifact

- APK: `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`
- Size: 6,981,352 bytes
- SHA-256: `24D96B698FC66D50D5C5FB5077BB07D5ED9AB35769F9AD1BBF76448E1ADF8894`
- Signature verification: APK Signature Scheme v1 and v2 verified
- Signer: Android debug certificate (engineering/demo distribution, not a production release signer)

## Automated regression result

`npm run test:offline` passed all prerequisites and all 262 main tests after the fixes.
