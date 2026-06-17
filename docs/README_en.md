# isonair — Chzzk live widget

[한국어](../README.md) · **English**

A small, frameless, always-on-top desktop widget that tracks the live status of
your favorite [Chzzk](https://chzzk.naver.com) (치지직, Naver's live‑streaming
platform) channels at a glance. Built with Electron. The interface is in Korean.

> Unofficial, fan-made tool. Not affiliated with Naver / Chzzk. It reads the
> public Chzzk web API; no login is required.

## Features

- **Live status at a glance** — live/offline badge, current stream title,
  concurrent viewer count, category, and a ticking "방송 중" (on‑air) duration or
  "종료" (ended) timer.
- **List & grid views** — a detailed list, or a compact icon grid with a hover
  tooltip. Toggle with the titlebar button.
- **Add by ID or URL** — paste a channel ID or any `chzzk.naver.com/…`,
  `…/live/…`, or `…/video/…` link.
- **One‑click open** — clicking a card opens the channel; live channels jump
  straight to the player at `/live/<id>`.
- **Drag‑and‑drop reordering** and per‑channel removal.
- **Auto‑refresh** every 30 seconds, with a combined refresh button + countdown.
- **Hide offline channels** to keep only what's live.
- **Adjustable appearance** — opacity slider (fully opaque at 100%), interface
  scale (− / +), and an always‑on‑top toggle.
- **Import / export** your channel list as JSON (export filenames are
  timestamped).
- **Auto‑update** — installed builds update themselves from GitHub Releases.

## Download

Grab the latest installer from the
[Releases page](https://github.com/b1nknet/isonair-app/releases/latest):

- **Windows** — `isonair-Setup-<version>.exe` (NSIS installer)
- **macOS (Apple Silicon)** — `isonair-<version>-arm64.dmg`

Builds are **unsigned**, so the OS will warn on first launch:

- Windows: SmartScreen → *More info* → *Run anyway*.
- macOS: right‑click the app → *Open*, or allow it under
  *System Settings → Privacy & Security*.

## Usage

1. Launch the app — a compact widget window appears, pinned on top.
2. Click **+** in the titlebar and paste a channel ID or URL to add a channel.
3. Click a channel to open it in your browser. Drag cards to reorder.
4. Use the **⋯** menu for always‑on‑top, hiding offline channels, import/export,
   and manual update checks. Adjust opacity and UI scale from the footer.

## Development

Requires [Node.js](https://nodejs.org/) (CI uses Node 24).

```bash
npm install      # install dependencies
npm start        # run the app in development (electron .)
```

There is no build step or bundler for the source — Electron runs the files in
`src/` directly.

### Project layout

| File | Role |
| --- | --- |
| `src/main.js` | Main process: window, persistence, Chzzk API calls, IPC, auto‑update |
| `src/preload.js` | `contextBridge` exposing `window.chzzk` to the renderer |
| `src/renderer.js` | All UI logic and DOM rendering |
| `src/index.html` / `src/style.css` | Static shell and styles |

See [CLAUDE.md](../CLAUDE.md) for a deeper architecture overview.

### Stored data

Your channel list and settings live in Electron's per‑user `userData` directory
(outside the repo), as `channels.json` and `settings.json`.

## Building & releasing

Package locally with [electron-builder](https://www.electron.build/):

```bash
npm run dist        # current platform
npm run dist:mac    # macOS
npm run dist:win    # Windows
```

Releases are automated via GitHub Actions (`.github/workflows/build.yml`).
Pushing a `v*` tag builds macOS (arm64) and Windows (x64), then a single release
job publishes one GitHub Release (marked latest) with all installers and the
auto‑update manifests:

```bash
# bump "version" in package.json and package-lock.json first
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin master --follow-tags
```

Pushes and PRs that aren't tags just build and upload artifacts to the run.

## License

ISC
