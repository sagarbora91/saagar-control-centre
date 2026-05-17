# Saagar Traders — Business Control Centre V4 → Offline Android APK

This project packages **`Saagar_Traders_Business_Control_Centre_V4.html`** (with all 9
modules embedded) into a **fully offline Android app** that stores business data for
months and writes an automatic daily backup to the phone's **Documents** folder.

- 100% offline — no internet ever required (V4 has zero external resources).
- All data stays on the phone in the app's private WebView storage (`localStorage`).
- A dated JSON backup is written every day to `Documents/SaagarBCC-Backups/`
  as a safety net (recover after uninstall / move to a new phone).
- Nothing about V4's behaviour changes — it is the same app, wrapped natively.

---

## 1. What you need (one-time setup on a Windows PC)

| Tool | Version | Link |
|---|---|---|
| Node.js LTS | 18 or 20 | https://nodejs.org |
| Java JDK | 17 | https://adoptium.net (Temurin 17) |
| Android Studio | latest | https://developer.android.com/studio |

After installing Android Studio, open it once and let it download the
**Android SDK** (Tools → SDK Manager → install "Android SDK Platform 34" and
"Android SDK Build-Tools"). Set the `JAVA_HOME` environment variable to the JDK 17
folder.

> No coding required after setup — the build is two commands.

---

## 2. Build the APK (the short version)

Open **PowerShell** or **Command Prompt** in this folder
(`SaagarBCC-Android`) and run:

```bat
npm install
npm run add:android
npm run build:apk
```

The signed-for-testing APK appears at:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

Copy that file to the phone and tap it to install
(enable "Install from unknown sources" when prompted).

**Even simpler:** just double-click **`build.bat`** in this folder — it runs all
three steps and tells you where the APK is.

---

## 3. Build the APK (with Android Studio UI, recommended first time)

```bat
npm install
npm run add:android
npm run sync
npm run open
```

`npm run open` launches Android Studio with the project. Then in Android Studio:

1. Wait for "Gradle sync" to finish (bottom status bar).
2. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Click **locate** in the popup → that is your `app-debug.apk`.

---

## 4. A proper release APK (optional, for long-term use)

A debug APK works fine for in-store use. For a clean signed release build:

```bat
keytool -genkey -v -keystore saagar.keystore -alias saagar -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android\key.properties`:

```
storeFile=../../saagar.keystore
storePassword=YOUR_PASSWORD
keyAlias=saagar
keyPassword=YOUR_PASSWORD
```

…and run `npm run build:release`. (Android Studio's **Build → Generate Signed
Bundle / APK** wizard does the same thing with a UI.)

---

## 5. Data storage & durability (this is the important part)

**Where the data lives.** Everything you enter (stock, payroll, expenses, staff,
service jobs, leave, tax, etc.) is stored by V4 in the WebView's `localStorage`,
inside the app's private data directory. This is **not** browser cache — Android
treats it as app data, so it survives:

- closing the app, phone restarts, app updates (the origin is pinned to
  `https://localhost` in `capacitor.config.json` so updates keep the same data),
- weeks and months of daily use.

It is only lost if the app is **uninstalled** or the user taps
**Settings → Apps → Saagar Control Centre → Storage → Clear storage**.

**The safety net.** Because those two actions wipe data, the app writes an
automatic backup every day:

```
Documents/SaagarBCC-Backups/backup-YYYY-MM-DD.json   (one per day, 90 kept)
Documents/SaagarBCC-Backups/latest.json              (always the newest)
```

These files are plain JSON and live in the phone's normal **Documents** folder,
so they survive an app uninstall and can be copied to a PC or a new phone.

**To restore** (new phone, or after a reset): install the app, open it, go to
**Configuration → Data & Backup → Restore from JSON**, and pick any
`backup-….json` file. (V4 already has this Restore feature built in.)

**Manual backup any time:** the dev/console command `SaagarBackup.now()` forces an
immediate backup; `SaagarBackup.status()` shows the last backup date and log.
The on-screen **Backup** button in V4 also still works.

> Tip: once a month, copy the `SaagarBCC-Backups` folder off the phone (USB,
> Google Drive, WhatsApp to yourself). That is your true long-term archive.

---

## 6. Storage permission note (older phones only)

On Android 11+ the Filesystem plugin writes to Documents without any runtime
permission. On **Android 9–10** add this line inside `<manifest>` in
`android\app\src\main\AndroidManifest.xml` (after `npm run add:android`):

```xml
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="29" />
```

Capacitor will still keep `localStorage` working even if file backup is denied —
you simply lose the external safety-net copy, not the live data.

---

## 7. Updating the app later (new V4 build)

1. Replace `www\index.html` with the new V4 file.
2. Keep the line `<script src="auto-backup.js"></script>` just before `</body>`
   (re-add it if the new file doesn't have it).
3. Run `npm run build:apk` and reinstall.

Because the app origin is pinned, **existing on-device data is preserved** across
the update.

---

## 8. Project layout

```
SaagarBCC-Android/
├── www/
│   ├── index.html        ← V4 (all 9 modules embedded) + 1 backup line
│   └── auto-backup.js     ← daily offline backup safety net
├── capacitor.config.json  ← app id, pinned origin (do not change hostname)
├── package.json           ← build scripts
├── build.bat              ← double-click to build the APK
├── .gitignore
└── README.md              ← this file
```

`android/` and `node_modules/` are generated by the build commands and are not
shipped in this folder.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `cap: command not found` | Run `npm install` first (installs Capacitor CLI locally). |
| Gradle sync fails / SDK not found | Open Android Studio → SDK Manager → install Platform 34 + Build-Tools. Set `JAVA_HOME` to JDK 17. |
| APK installs but data resets each launch | Don't change `hostname`/`androidScheme` in `capacitor.config.json` — the origin must stay constant. |
| No backup files in Documents | Check section 6 (older-Android permission). Live data is still safe in the app. |
| White screen on launch | Confirm `www\index.html` exists and still ends with `</body></html>`; re-run `npm run sync`. |
