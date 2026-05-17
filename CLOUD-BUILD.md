# Get the APK with NO software installed — free GitHub cloud build

Follow this once. GitHub's servers will compile the installable `.apk` for you
and give you a download link. **Nothing to install on your computer.** Free.

Total time: ~5 minutes of clicking + ~6 minutes waiting for the build.

---

## Step 1 — Make a free GitHub account
1. Go to **https://github.com** → **Sign up**.
2. Use any email, pick a username and password. (Free plan is enough.)

## Step 2 — Create an empty repository
1. Top-right **➕ → New repository**.
2. Repository name: `saagar-control-centre`
3. Select **Private** (recommended — this is business software).
4. Leave everything else as default. Click **Create repository**.

## Step 3 — Upload the project
1. On the new repo page click the link **“uploading an existing file”**
   (or **Add file → Upload files**).
2. Open the folder `SaagarBCC-Android` on your computer.
3. Select **everything inside it** (the `www` folder, `.github` folder,
   `package.json`, `capacitor.config.json`, `README.md`, `build.bat`,
   `.gitignore`, this file) and **drag it all** onto the GitHub upload page.
   - Make sure the **`.github`** folder is included — it contains the build
     instructions. (On Windows it is visible; just select it too.)
4. Wait for the file list to finish uploading, then click
   **Commit changes** (green button).

## Step 4 — The build starts by itself
1. Click the **Actions** tab at the top of the repo.
2. You will see a run called **“Build Saagar Control Centre APK”** with a
   yellow dot (in progress). It takes about **6–8 minutes**.
   - If it ever asks *“Workflows aren’t being run”*, click
     **“I understand my workflows, go ahead and enable them.”**
3. Wait for the dot to turn into a **green ✓**.

## Step 5 — Download the APK
**Easiest way:**
1. Go to the repo home page → right side, click **Releases**
   (or open: `https://github.com/<your-username>/saagar-control-centre/releases`).
2. Open the release **“Saagar Control Centre — latest APK”**.
3. Under **Assets**, click **`SaagarControlCentre-latest.apk`** to download it.

**Alternative way (from the build run):**
1. **Actions** tab → click the finished green run.
2. Scroll to **Artifacts** → click **SaagarControlCentre-APK** to download
   (it comes as a `.zip`; unzip to get the `.apk`).

## Step 6 — Install on the phone
1. Copy the `.apk` to the phone (WhatsApp-to-self, Google Drive, USB cable…).
2. Tap the file on the phone.
3. When asked, allow **“Install from unknown sources / this source”**.
4. Open **Saagar Control Centre**. It works fully offline from now on.

---

## Getting a fresh APK later
Whenever you change anything (e.g. a new `www/index.html`):
- Repo → **Add file → Upload files** → drop the changed file → **Commit**.
- The build runs again automatically; download the new APK from **Releases**.

You can also trigger it by hand: **Actions** tab → **Build Saagar Control
Centre APK** → **Run workflow**.

---

## If the build shows a red ✗ (failed)
1. Click the failed run → click the red step to read the message.
2. Most common causes:
   - The **`.github`** folder was not uploaded → re-upload it, ensuring
     `.github/workflows/build-apk.yml` exists in the repo.
   - `www/index.html` missing or didn’t finish uploading (it is ~900 KB) →
     re-upload `www` and commit again.
3. Re-run: **Actions** → the run → **Re-run all jobs**.

The build needs no secrets, no payment, and no Android tools on your side —
everything runs on GitHub’s free Linux machines.
