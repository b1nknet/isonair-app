const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CHANNELS_PATH = path.join(app.getPath('userData'), 'channels.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// One-time migration: the app was renamed "Chzzk Widget" -> "isonair", which
// changes the userData directory (Electron derives it from productName). On the
// first run of the renamed build, copy the old channels/settings over so
// existing users keep their data. Best-effort; failure just starts fresh.
function migrateLegacyUserData() {
  try {
    const dir = app.getPath('userData');
    const legacyDir = path.join(app.getPath('appData'), 'Chzzk Widget');
    if (legacyDir === dir) return;
    for (const file of ['channels.json', 'settings.json']) {
      const src = path.join(legacyDir, file);
      const dest = path.join(dir, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
  } catch {
    /* ignore */
  }
}

const DEFAULT_SETTINGS = {
  opacity: 1,
  alwaysOnTop: true,
  hideOffline: false,
  viewMode: 'list', // 'list' | 'grid'
  uiScale: 1, // webContents zoom factor for the whole interface
};

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

function loadChannels() {
  const data = loadJson(CHANNELS_PATH, []);
  return Array.isArray(data) ? data : [];
}

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...loadJson(SETTINGS_PATH, {}) };
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchChannelInfo(channelId) {
  try {
    const [channelRes, detailRes] = await Promise.all([
      httpsGet(`https://api.chzzk.naver.com/service/v1/channels/${channelId}`),
      httpsGet(`https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`),
    ]);

    const ch = channelRes?.content ?? {};
    const detail = detailRes?.content ?? {};
    // live-detail nests a channel object that is populated even when the
    // top-level channels endpoint is sparse.
    const detailCh = detail.channel ?? {};

    const isLive = detail.status === 'OPEN';

    return {
      channelId,
      channelName: ch.channelName ?? detailCh.channelName ?? channelId,
      channelImageUrl: ch.channelImageUrl ?? detailCh.channelImageUrl ?? null,
      followerCount: ch.followerCount ?? 0,
      isLive,
      liveTitle: detail.liveTitle ?? '',
      concurrentUserCount: detail.concurrentUserCount ?? 0,
      categoryType: detail.categoryType ?? '',
      liveCategoryValue: detail.liveCategoryValue ?? '',
      // KST date strings like "2024-11-20 15:04:05" (or null).
      openDate: detail.openDate ?? null,
      closeDate: detail.closeDate ?? null,
    };
  } catch (err) {
    return { channelId, error: err.message };
  }
}

let win;

function createWindow() {
  const settings = loadSettings();

  win = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 300,
    minHeight: 200,
    alwaysOnTop: settings.alwaysOnTop,
    frame: false,
    transparent: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.setOpacity(settings.opacity);
  // Zoom factor only sticks once content has loaded.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(settings.uiScale || 1);
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

// --- GitHub auto-update ---------------------------------------------------
// Uses electron-updater against the `publish` config in package.json
// (GitHub provider). Only meaningful in a packaged, installed app — in a
// dev run there is no update feed, so we no-op.

let autoUpdater = null;

function sendUpdateStatus(status, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-status', { status, ...payload });
  }
}

function setupAutoUpdate() {
  if (!app.isPackaged) return; // nothing to update against in dev
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return; // dependency not installed
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info?.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus('none'));
  autoUpdater.on('download-progress', (p) => sendUpdateStatus('downloading', { percent: Math.round(p?.percent ?? 0) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('downloaded', { version: info?.version }));
  autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: String(err?.message || err) }));

  autoUpdater.checkForUpdates().catch(() => {});
}

ipcMain.handle('check-for-updates', () => {
  if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {});
  else sendUpdateStatus('none');
});

ipcMain.handle('restart-to-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  migrateLegacyUserData();
  createWindow();
  setupAutoUpdate();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-channels', () => loadChannels());

ipcMain.handle('save-channels', (_e, channels) => {
  saveJson(CHANNELS_PATH, channels);
});

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('set-opacity', (_e, opacity) => {
  const clamped = Math.min(1, Math.max(0.2, Number(opacity) || 1));
  const settings = loadSettings();
  settings.opacity = clamped;
  saveJson(SETTINGS_PATH, settings);
  if (win) win.setOpacity(clamped);
});

ipcMain.handle('set-always-on-top', (_e, value) => {
  const enabled = Boolean(value);
  const settings = loadSettings();
  settings.alwaysOnTop = enabled;
  saveJson(SETTINGS_PATH, settings);
  if (win) win.setAlwaysOnTop(enabled);
  return enabled;
});

ipcMain.handle('set-ui-scale', (_e, scale) => {
  const clamped = Math.min(2, Math.max(0.5, Number(scale) || 1));
  const settings = loadSettings();
  settings.uiScale = clamped;
  saveJson(SETTINGS_PATH, settings);
  if (win) win.webContents.setZoomFactor(clamped);
  return clamped;
});

// Generic partial-merge for view settings with no window side effects
// (hideOffline, viewMode). opacity / alwaysOnTop / uiScale keep their
// dedicated handlers because they also drive the BrowserWindow.
ipcMain.handle('set-settings', (_e, partial) => {
  const settings = { ...loadSettings(), ...(partial || {}) };
  saveJson(SETTINGS_PATH, settings);
  return settings;
});

ipcMain.handle('export-channels', async () => {
  // Local timestamp, filesystem-safe (no colons): YYYY-MM-DD_HH-MM-SS.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '채널 목록 내보내기',
    defaultPath: `chzzk-channels-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const payload = {
    type: 'chzzk-widget-channels',
    version: 1,
    exportedAt: new Date().toISOString(),
    channels: loadChannels(),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, filePath, count: payload.channels.length };
});

ipcMain.handle('import-channels', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '채널 목록 가져오기',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
  try {
    const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    // Accept either our export wrapper or a bare array of channel ids.
    const list = Array.isArray(raw) ? raw : raw.channels;
    if (!Array.isArray(list)) return { ok: false, error: '잘못된 파일 형식입니다.' };
    const channels = [...new Set(list.filter(id => typeof id === 'string' && /^[a-zA-Z0-9]+$/.test(id)))];
    return { ok: true, channels };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fetch-channel-info', async (_e, channelId) => {
  return fetchChannelInfo(channelId);
});

ipcMain.handle('fetch-all-channels', async (_e, channelIds) => {
  return Promise.all(channelIds.map(fetchChannelInfo));
});

ipcMain.handle('open-channel', (_e, channelId, isLive) => {
  // Live channels go straight to the player at /live/<id>; otherwise the
  // channel home page.
  const path = isLive ? `live/${channelId}` : channelId;
  shell.openExternal(`https://chzzk.naver.com/${path}`);
});

ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => win.minimize());
