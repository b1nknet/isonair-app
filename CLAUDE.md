# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A frameless, always-on-top desktop widget (Electron) that tracks the live status of [Chzzk](https://chzzk.naver.com) (치지직, Naver's streaming platform) channels. The UI is in Korean. There are no tests, linters, or a build step for the source — it runs the `src/` files directly.

## Commands

- `npm start` — run the app in dev (`electron .`)
- `npm run dist` — package for the current platform via electron-builder
- `npm run dist:mac` / `npm run dist:win` — package for a specific platform

Releases are produced by `.github/workflows/build.yml`: pushing a `v*` tag builds macOS (arm64) + Windows (x64) and publishes a GitHub Release; other pushes/PRs build and upload artifacts to the run. Builds are unsigned (`CSC_IDENTITY_AUTO_DISCOVERY: false`).

## Architecture

Three processes, classic Electron split with context isolation:

- **`src/main.js`** (main process) — owns all I/O: persistence, network, and OS dialogs. There is no app state in main beyond the single `win` reference; everything is loaded from disk per request.
- **`src/preload.js`** — exposes a single `window.chzzk` bridge over `contextBridge`. Every renderer↔main call goes through here; keep this in sync when adding IPC handlers.
- **`src/renderer.js`** — all UI logic and DOM rendering (no framework, hand-built DOM). `src/index.html` + `src/style.css` are the static shell.

### Data flow & persistence

- Two JSON files live in Electron's `userData` dir (not the repo): `channels.json` (a bare array of channel-id strings) and `settings.json` (merged over `DEFAULT_SETTINGS`). `loadJson`/`saveJson` swallow errors and fall back to defaults — reads are cheap and always re-read from disk.
- The `userData` dir is derived from `productName`. The app was renamed `Chzzk Widget` → `isonair`, so `migrateLegacyUserData()` (run once at `whenReady`, before any read) copies the old `channels.json`/`settings.json` from the legacy `.../Chzzk Widget` dir into the new one. `appId` was also rebranded (`com.chzzk.widget` → `net.b1nk.isonair`); changing it means a pre-rename install won't auto-update in place (acceptable — single user), but the userData migration still carries that user's data across.
- The renderer holds the source-of-truth arrays in memory (`channels`, `lastInfos`) and persists by calling `saveChannels` after every mutation. Render order always follows the persisted `channels` order — after any fetch, `lastInfos` is rebuilt by mapping `channels` over an id→info map so reordering/filtering never desync.
- Settings have two IPC shapes: `set-opacity`, `set-always-on-top`, and `set-ui-scale` (webContents zoom factor) have dedicated handlers because they also drive the `BrowserWindow`; everything else (`hideOffline`, `viewMode`) goes through the generic partial-merge `set-settings`.

### Chzzk API

`fetchChannelInfo` (main) hits two undocumented endpoints in parallel: `service/v1/channels/{id}` and `service/v2/channels/{id}/live-detail`. Notes that aren't obvious:
- Live status is `live-detail`'s `status === 'OPEN'`.
- The `live-detail` response nests a `channel` object that is populated even when the top-level channels endpoint is sparse — fields fall back through `ch → detailCh → channelId`.
- Dates come back as KST strings (`"2024-11-20 15:04:05"`) with no timezone. The renderer's `parseKst` appends `+09:00` so elapsed-time math is correct in any locale. Don't treat these as local time.
- A channel id is `[a-zA-Z0-9]+`. `extractChannelId` (renderer) accepts a raw id or a `chzzk.naver.com/[live/|video/]<id>` URL.

### Rendering & timers

- A single 1-second `setInterval` (`startTick`) drives both the auto-refresh countdown (`REFRESH_INTERVAL = 30`s) and the live-duration tickers. Duration text is recomputed in-place from `data-*` timestamps on each card, so the per-second tick never refetches or re-renders.
- Two view modes (`list` / `grid`) rendered by `renderList` / `renderGrid` off the same filtered `visible` list. Grid cards use a body-level fixed-position tooltip (`#grid-tooltip`) so it isn't clipped by the scroll container.
- `setupMarquee` animates overflowing text horizontally; all dynamic text passes through `escapeHtml` since cards are built via `innerHTML`.
- Drag-and-drop reordering (`attachDragHandlers` → `reorderChannels`) mutates `channels`, persists, then re-renders from cache without a refetch.

### Auto-update

`electron-updater` against the `publish` GitHub provider in `package.json`. It is a **no-op unless `app.isPackaged`** (dev runs have no update feed) and degrades gracefully if the dependency is missing. Status flows main→renderer via the `update-status` event and is surfaced in the `#update-banner`.

## Conventions

- CommonJS (`require`), not ESM.
- User-facing strings are Korean; match that when adding UI text.
- When adding a renderer↔main capability, add the `ipcMain` handler in `main.js` **and** the matching method in `preload.js`'s `window.chzzk` bridge — the renderer never touches `ipcRenderer` directly.
