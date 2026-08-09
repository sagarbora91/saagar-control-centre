# API-23 update-in-place storage evidence

This is emulator engineering evidence only. It never represents physical-device
or owner acceptance.

The runner refuses non-emulator serials. It installs the baseline APK, clears
only that emulator package, generates 6,567 synthetic operational records
(including one value whose body exceeds 3 MiB), and records its hash. It then
force-stops the app and installs the candidate with `adb install -r` without
clearing package data. After launch it verifies the same UID, generated-record
count, boundary sentinels, large-value length/hash, runtime mode and recovery
state. Relevant Android logs are stored with the JSON evidence.

`pass: true` requires every named check in the evidence file to pass: the APK
replace command reports success; the package UID is preserved; all 6,567
generated records and both boundary sentinels survive; the large value retains
its exact expected length and SHA-256; storage is ready and not blocked;
recovery reports `expectedRows === loadedRows === 6567`; and persistence mode is
`native-incremental`. A successful check cannot compensate for a failed one.

Run from the repository root:

```powershell
node verification/native-upgrade/run-api23-update-evidence.mjs `
  --serial emulator-5556 `
  --baseline V:\path\baseline.apk `
  --candidate V:\path\candidate.apk `
  --out verification/native-upgrade/API23-UPDATE-EVIDENCE.json
```

Never point this runner at a physical device or production APK data.
