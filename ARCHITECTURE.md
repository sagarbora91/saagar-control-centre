# Saagar Traders — Business Control Centre — Architecture

This document describes how the offline Android app is actually built, as of `main`. It
complements `README.md` (which covers building/installing the APK). It documents reality;
it does not propose changes. Storage **code** work is deferred — this only describes the
current behaviour.

The whole app is a single offline WebView page, `www/index.html` ("the shell"), wrapped by
Capacitor. There is no server, no network, no bundler — every script is a plain `<script
src>` loaded from `www/`.

---

## 1. The shell + base64-embedded modules

The app is **one shell that hosts 10 independent business modules**. Each module is a
complete, standalone HTML application that was authored separately; the build pipeline
base64-encodes each module's HTML and injects it into a `MODULES` array in `index.html`
(each entry: `{ id, title, short, category, icon, priority, file, subtitle, summary,
bytes, sha256, html_b64 }`).

The 10 modules (`id` → `title`):

| `id`       | `title`                            |
|------------|------------------------------------|
| `stock`    | Stock Register                     |
| `service`  | Watch Service Centre               |
| `qms`      | Queue Management                   |
| `dsr`      | CRO Login                          |
| `expense`  | Expense Manager — Central Ledger   |
| `grooming` | Grooming Checklist                 |
| `cro_audit`| Store Manager                      |
| `payroll`  | Saagar Traders — Payroll           |
| `leave`    | Staff Leave Calendar               |
| `tax`      | Tax Compliance Calendar            |

### One srcdoc iframe

There is exactly **one** module host element in the shell:

```html
<iframe id="moduleFrame" class="module-frame" title="Business module"></iframe>
```

Opening a module (`openModule(id)` in `index.html`) decodes that module's `html_b64`, runs
it through an **injection pipeline**, and assigns the result to the iframe's **`srcdoc`**.
The iframe is **same-origin and not sandboxed**, so injected scripts run with a real
`parent` reference and full access to the shared `localStorage` origin. Closing a module
sets `srcdoc = ''`.

`buildModuleSrc(mod)` memoises the fully-injected HTML per module id (`__moduleSrcCache`),
so the first open pays the decode+inject cost and every later open/switch/reload is a cache
hit. The iframe still re-mounts on each open, so each module boots fresh against current
data.

### The injection pipeline

`buildModuleSrc` composes several string transforms over the decoded module HTML (each
named `inject*` in `index.html`). In composition order they add, among other things:

- **`injectBackHome`** — a boot script exposing a "back to home" affordance that posts
  `ST_BACK_HOME` to the shell.
- **`injectModuleHideCSS`** — CSS that hides each module's own "add employee / brand /
  vendor" entry points, because those masters are now created centrally (Settings) and
  flow in via the integration bridge.
- **`injectEmployeeAssist`**, **`injectModuleAuditBridge`** — module audit/event wiring
  (the audit bridge posts `ST_AUDIT` to the shell).
- **`injectUniformCSS`**, **`injectMobileMode`** — shared styling plus a `st-v5-mobile-boot`
  script that toggles a `bcc-mobile` class and **hosts the date/UI-mode receiver** (see
  the postMessage rail below).
- **`injectSafetyNet`**, **`injectIframeShim`** — storage/error safety wiring for the
  in-iframe context.

Net effect: the module's own code is unchanged, but each frame boots with shared chrome,
the shell↔module message rail, and the storage shim already in place.

---

## 2. The postMessage rail (shell ↔ module iframe)

Because the module runs inside the `srcdoc` iframe, shell and module talk over
`window.postMessage`. The shell's listener is `window.addEventListener('message', …)` in
`index.html`. The rail is small and one-purpose-per-message:

### Module → shell (handled in the shell's `message` listener)

- **`ST_BACK_HOME`** → `showMainView()`. Leave the open module and return to the home
  screen. (Also drives the Android hardware-back stack.)
- **`ST_OPEN_MODULE`** `{ id, date? }` → `navigateToModule(id, date)`. Jump straight to
  another module. Used by cross-module "next step" chips and by the integration bridge's
  in-iframe gate banner (`integration-bridge.js` posts `ST_OPEN_MODULE` with `id:'grooming'`
  from the "Open ▸" button).
- **`ST_AUDIT`** `{ action, detail?, before?, after? }` → `auditLog(...)`. Modules report
  state changes into the shell's central audit log (and the home view re-renders if it is
  showing). `sqlite-store.js`, when it is the active engine, also listens for `ST_AUDIT` to
  mirror in-iframe writes into its DB.

### Shell → module (posted into `moduleFrame.contentWindow`)

- **`ST_SET_DATE`** `{ date }` — broadcast the shell's currently-viewed "as-of" date.
  Sent by `applyDateToFrame()`. **Received inside the iframe by the `st-v5-mobile-boot`
  script** (injected by `injectMobileMode`), which:
  - seeds `window.__stAsOf` from `localStorage['saagar_selected_date']` at iframe boot, and
  - on each `ST_SET_DATE` sets `window.__stAsOf = e.data.date` and dispatches a
    `CustomEvent('st-date', { detail: window.__stAsOf })` on the iframe `window`.

  So a module opts into "viewing a past date" by reading **`window.__stAsOf`** and/or
  listening for the **`st-date`** event. This is a **Phase-0 rail**: it is wired end to end,
  but modules that have not yet opted in simply ignore `__stAsOf`/`st-date` (dormant no-op).
- **`ST_UI_MODE`** `{ mode }` — broadcast mobile/desktop UI mode (`applyUiModeToFrame()`);
  the same in-iframe boot script toggles the `bcc-mobile` class. (In-iframe it also still
  honours a `storage` event on `saagar_ui_mode` as a fallback.)

> Note (from `storage-core.js` §13.8): when the SQLite engine is live, native `localStorage`
> is no longer written after boot, so the browser's cross-frame `storage` event no longer
> fires for business writes. The engine re-fires a synthetic `storage` event **on the shell
> window** so the integration bridge's debounced cycle still triggers; it deliberately does
> **not** cross into the iframe (the iframe's UI-mode coherence is driven by `ST_UI_MODE`,
> not by `storage`).

---

## 3. The storage stack

All five pieces below load as plain scripts in `index.html`. Load order matters:
`sql-wasm.js` and `storage-core.js` are in `<head>` (so the engine's `Storage.prototype`
override installs before the demo seeder, the bridge, or any module runs); the rest load
near the end of `<body>`.

```
<head>:  sql-wasm.js  →  storage-core.js  →  photo-store.js  → (demo seeder)
<body>:  … auto-backup.js …  sqlite-store.js
```

### `storage-core.js` — LIVE (Option C, SQLite-primary)

This is the **active** engine on `main` (`STORAGE_CORE_ENABLED = true`). It is an IIFE that,
when enabled, overrides `Storage.prototype` (`getItem/setItem/removeItem/clear/key/length`)
and exposes `window.SaagarStore` and a delegating `window.SaagarDB`.

Model:

- **`MEM` (a `Map`) is the synchronous source of truth** once the engine is `_ready`. At
  startup (Step 0, synchronous) it hydrates `MEM` from whatever is in native `localStorage`,
  so reads work instantly and an upgrade from a pure-`localStorage` install is lossless.
- **`sql.js` in-memory SQLite DB** (`kv(k TEXT PRIMARY KEY, v TEXT)`) is the persistence
  layer. The whole DB is exported to base64 and written to a **`bcc.sqlite`** file via the
  Capacitor Filesystem plugin (app-private `DATA` directory). The export is heavy, so it is
  **debounced** (~6 s) and also flushed on `visibilitychange→hidden`, `pagehide`, and the
  Capacitor `pause` event.
- **WAL journaling** — a sequenced, synchronous write-ahead log kept in native
  `localStorage` (`saagar_storage_wal`). Every set/remove/clear is journaled *first*; large
  values are journaled as a pointer + forced prompt persist; the log is byte-bounded and is
  cleared only through the sequence number that the last successful export captured (so a
  write that lands mid-export is never dropped). It is replayed into `MEM`+DB on the next
  boot.
- **Atomic persist + `.bak` rotation** — `persist()` first promotes the current good live
  file to `bcc.sqlite.bak` (via `.bak.tmp` + rename), then writes the new live file (via
  `.tmp` + rename). A persist mutex serialises whole-file writes so concurrent flushes never
  race on the temp files.
- **Corrupt-DB recovery chain** — on boot it validates each candidate with
  `PRAGMA quick_check` (a full page scan, not just the page-1 header) and walks
  `live → .tmp → .bak → fresh`, adopting the first that passes. A hard **boot timeout**
  (`BOOT_TIMEOUT_MS`, 6 s) falls back to the Step-0-hydrated data, and a late DB load after
  that timeout **self-heals** `MEM` from the real DB (DB-wins) instead of running the session
  on stale data.
- **Marker-gated migration / reconcile** — a one-way `saagar_storage_migrated` marker is set
  only after a verified, durably-persisted first-boot migration. On later boots (marker set
  and the DB actually loaded from a file) the engine is **DB-wins** (`MEM := DB`), so a record
  deleted in SQLite-mode can never resurrect from the frozen native-`localStorage` copy; if
  the marker is set but all DB files are lost, it re-migrates from that native copy instead of
  wiping.
- **Bulk paths** — `SaagarStore.bulk()` / `bulkAsync()` suspend per-write WAL+export for a
  burst (first-boot seed / large restore) and do one durable persist at the end, so a
  multi-thousand-key seed does not freeze the device.
- **Surface** — `window.SaagarStore` (`get/set/remove/keys/length/ready/whenReady/flush/
  bulk/_reset/_status/...`) for the shell + iframe shim; `window.SaagarDB`
  (`ready/status/save/allKeys/query/pruneKeys/raw`) for SQL-level access; `_reset()` performs
  an awaited Factory Reset (clears `MEM`, the SQLite files, and the WAL).
- **Fallback** — if `window.Storage`, `sql.js`, or the Filesystem plugin is unavailable, or
  anything throws, the engine touches nothing and the app runs on native `localStorage`
  exactly as before.

> **Flag-comment discrepancy (surfaced, not judged).** The value is
> `var STORAGE_CORE_ENABLED = true;` (engine ON), but the in-file comment beside it says
> *"ON in this commit — TEST BRANCH `test/sqlite-on` ONLY … main stays false."* The value
> and the comment disagree about whether this should be on `main`. This doc records the
> **actual** value (`true`). The mismatch should be reconciled; this note does not assert
> which side is correct.

### `sqlite-store.js` — DORMANT when storage-core is on (older "Design A")

The predecessor engine: it kept `localStorage` as the live store and attached SQLite as a
*durable mirror* (write-through + recovery + `ST_AUDIT` mirroring of iframe writes). It
**stands down** when storage-core is active: its first statement checks
`window.SaagarStore && window.SaagarStore.enabled` and returns early, logging
`"[sqlite-store] storage-core active — standing down"`. Since storage-core loads first and
synchronously sets `enabled = true`, only one engine ever owns `Storage.prototype` and the
single `bcc.sqlite` file. When the flag is OFF, `SaagarStore` is undefined and this file is
the active mirror engine.

### `photo-store.js` — DORMANT (mechanism only)

Provides a Filesystem-backed photo API (photos as `DATA/saagar-photos/{id}.{ext}` files,
loaded lazily) so large image blobs stay out of `MEM` and the text SQLite DB. It is
explicitly **mechanism only**: per its own header, **none of the 10 modules are wired to it
yet** — that is a flagged follow-up gated on backup/restore learning to carry photo bytes.
Today photos are still base64 inside `localStorage` JSON values (so the JSON backup covers
them). It self-guards on the Filesystem plugin being absent and never synthesises a truthy
`SaagarStore.enabled` (so it cannot break `sqlite-store.js`'s stand-down guard): it attaches
`.photo` to an existing `SaagarStore`, or stashes `window.__SaagarPhoto` for storage-core to
adopt.

### `sql.js` WASM (`sql-wasm.js` / `sql-wasm.wasm`)

The SQLite-compiled-to-WebAssembly engine that defines `initSqlJs`. Loaded in `<head>`
before storage-core so the engine's async boot (on DOM-ready) can find it. Both storage-core
(when live) and sqlite-store (when it is the active engine) call the same `initSqlJs`.

---

## 4. `integration-bridge.js` — the cross-module event bus (previously undocumented)

The 10 modules each persist into their own `localStorage` keys and do **not** call each other
directly. `integration-bridge.js` is the glue: an **append-only event bus** that reconciles
data across modules. It was previously undocumented; this section is the reference.

### Bus model

- The bus is a single array persisted at **`saagar_bus`** (capped at 2000 events, oldest
  trimmed). Each event is `{ id, type, at, src, payload, consumed:{} }`.
- **Producers** scan each module's `localStorage` and `emit(...)` events with a
  **deterministic id** (`type:idSuffix`), so the same source fact is never double-emitted
  (idempotent producers).
- **Consumers** call `consume(bus, type, who, fn)`: they process only events of their type
  they have not already marked, and stamp `consumed[who] = true` when done (idempotent
  consumers). The bus is therefore the single audit trail of every cross-module flow — and,
  per the file header, the same shape an eventual PHP rebuild would reuse.

### What it wires (producers → consumers)

Producers emit from module state: `GROOMING_RESULT`, `QMS_ALLOCATED`,
`SALE_CLOSED`/`SERVICE_CLOSED`/`NONPURCHASE_CLOSED`, `LEAVE_APPROVED`, `DSR_SUBMITTED`,
`STOCK_LOCKED`, `CASH_CLOSED`, `PAYROLL_MONTH`. Consumers then drive:

- **QMS → DSR** auto-fill — closed QMS leads become sales / non-purchase / visitor rows in
  the matching CRO's DSR record (deduped by QMS customer id).
- **DSR → Stock** roll-up — submitted DSRs aggregate into an informational `_dsrRollup` on
  today's Stock blob (the SM's own count/lock is untouched).
- **DSR + Leave → Payroll** — submitted DSRs and approved leave build a monthly
  `saagar_payroll_attendance_feed` (present-days, leave-days, avg SM score) for the payroll
  maker to reconcile before lock.
- **DSR/QMS/Grooming → CRO Daily Audit** — derived inputs feed (`saagar_cro_audit_feed`):
  grooming %, QMS sales/non-purchase counts, DSR submit/score.
- **QMS service → Watch Service Centre** — a service-closed lead creates a stub WSC case to
  complete intake (deduped by source ref).
- **Floor gate** — grooming fails (below a configurable %) and approved leave produce a
  `saagar_gate_status` block list, surfaced as a fixed banner inside QMS/DSR (the banner's
  "Open ▸" posts `ST_OPEN_MODULE` → `grooming`).
- **Payroll + Expense → Tax** — PF/ESIC/PT from payroll rows plus the Expense Manager's GST
  estimate build a best-effort `saagar_tax_payable`.
- **Exceptions Hub** — one aggregated red-flag feed (`saagar_exceptions`): floor-gate blocks,
  open QMS leads, unlocked stock, unclosed/mismatched cash, missing high-value expense
  vouchers, accruing statutory tax.

It also performs **master reconciliation** (not events): a one-way **Employee Master** union
(`saagar_employee_master_v1`, the single source of truth edited in Settings → People) is
pushed into the QMS roster, the DSR staff list, and the Leave staff master; **brand / vendor
/ customer masters** are unioned with each module's own lists; and an **Organisation
publisher** seeds the Payroll firm and Tax firms additively (never overwriting user data).

> Honest boundary (per the file header): this is **best-effort offline reconciliation**, not
> transactional enforcement; true enforcement is the eventual server rebuild. Every write is
> idempotent, labelled, and visible in the bus.

### When it runs

`cycle()` runs the full produce → consume → reconcile pass. It is triggered:

- **On a 60 s tick** (`setInterval(..., TICK=60000)`).
- **On a `storage` event** on the shell window (debounced ~4 s via `safeCycle(true)` with a
  re-entrancy lock, so a burst of writes can't re-enter and freeze the app). With the SQLite
  engine live, this is the synthetic `storage` event that storage-core re-fires on the shell
  window (see §2).
- **On every module-iframe `load`** — `hookFrame()` binds the `moduleFrame` `load` event: it
  paints the (cheap) gate banner immediately, then runs a **deferred + debounced** reconcile
  (`setTimeout(50)` → `safeCycle(true)`) so opening a module doesn't block on a full pass.

`window.SaagarBridge` exposes `runNow()`, `bus()`, `events(type)`, `exceptions()`,
`croAuditFeed()`, `taxPayable()`, `config()`, and `status()` for inspection.

---

## 5. `auto-backup.js` — daily offline JSON safety net

Independent of the storage engine. ~6 s after launch (and every 6 h thereafter) it snapshots
**every `localStorage` key** (which, via the engine override, reflects the live `MEM` data),
serialises it to JSON, and writes it via the Capacitor Filesystem plugin to the phone's
**Documents** folder:

```
Documents/SaagarBCC-Backups/backup-YYYY-MM-DD.json   (one per calendar day, 90 kept)
Documents/SaagarBCC-Backups/latest.json              (always the newest snapshot)
```

It writes at most one dated file per day (tracked in `bcc_autobackup_last`), prunes to the
most recent 90, and degrades gracefully in a plain desktop browser (records the marker + logs,
no error). `window.SaagarBackup.now()` forces an immediate backup; `window.SaagarBackup.status()`
returns the last backup date, native flag, folder, and recent log. Because these JSON files
live in normal Documents storage, they survive an app uninstall and can be copied to a PC or a
new phone, then restored via the shell's Configuration → Data & Backup → Restore.

> Caveat tied to the deferred photo work (§3): the JSON backup carries photos **only** while
> they remain base64 inside `localStorage` values. If a module is ever rewired to move photos
> into `photo-store.js`'s Filesystem refs, this backup (and the `bcc.sqlite` safety-net, which
> is text-only) would no longer contain the image bytes — so photo snapshot/restore must be
> added to the backup path *before* that rewire.

---

## 6. End-to-end summary

1. Capacitor loads `www/index.html` (the shell) at a pinned `https://localhost` origin,
   fully offline.
2. In `<head>`, `sql-wasm.js` then `storage-core.js` load; the SQLite-primary engine installs
   its `Storage.prototype` override (LIVE on `main`), so all `localStorage` access is backed
   by an in-memory `MEM` map + a `bcc.sqlite` file (WAL-journaled, atomic writes, recovery
   chain). `sqlite-store.js` and `photo-store.js` stand down / stay dormant.
3. The shell renders home; opening a module decodes its base64 HTML, runs the injection
   pipeline, and mounts it in the single `#moduleFrame` `srcdoc` iframe.
4. Shell and module communicate over the `postMessage` rail (`ST_BACK_HOME`, `ST_OPEN_MODULE`,
   `ST_AUDIT` upward; `ST_SET_DATE`/`window.__stAsOf`/`st-date` and `ST_UI_MODE` downward).
5. `integration-bridge.js` continuously reconciles the 10 modules through the append-only
   `saagar_bus` event log (60 s tick + on storage event + on iframe load).
6. `auto-backup.js` writes a dated JSON snapshot to Documents daily as the recover-after-wipe
   safety net.
