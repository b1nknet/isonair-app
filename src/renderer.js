const channelList = document.getElementById('channel-list');
const addBar = document.getElementById('add-bar');
const channelInput = document.getElementById('channel-input');
const errorBanner = document.getElementById('error-banner');
const refreshBtn = document.getElementById('refresh-btn');
const countdownEl = document.getElementById('countdown');
const appEl = document.getElementById('app');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');
const scaleMinus = document.getElementById('scale-minus');
const scaleValue = document.getElementById('scale-value');
const scalePlus = document.getElementById('scale-plus');
const sortBtn = document.getElementById('sort-btn');
const viewBtn = document.getElementById('view-btn');
const moreBtn = document.getElementById('more-btn');
const moreMenu = document.getElementById('more-menu');
const menuAlwaysOnTop = document.getElementById('menu-always-on-top');
const menuHideOffline = document.getElementById('menu-hide-offline');
const updateBanner = document.getElementById('update-banner');
const updateText = document.getElementById('update-text');
const updateRestart = document.getElementById('update-restart');
const currentVersionEl = document.getElementById('current-version');

let alwaysOnTop = true;
let hideOffline = false;
let favorites = []; // channel ids pinned to a separate group at the top
let sortByLiveTime = false; // order live by start time, offline by end time
let viewMode = 'list'; // 'list' | 'grid'

// Interface zoom levels cycled by the footer scale button.
const SCALE_STEPS = [0.85, 1, 1.15, 1.3];
let uiScale = 1;

let currentVersion = '';

let channels = [];
let lastInfos = []; // full list in channel order (pre-filter)
const REFRESH_INTERVAL = 30; // seconds
let countdown = REFRESH_INTERVAL;
let isRefreshing = false;

// --- helpers -------------------------------------------------------------

function extractChannelId(raw) {
  raw = raw.trim();
  // Accept channel pages (chzzk.naver.com/<id>) as well as live/video URLs
  // (chzzk.naver.com/live/<id>, /video/<id>) — skip the leading path segment.
  const urlMatch = raw.match(/chzzk\.naver\.com\/(?:live\/|video\/)?([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]+$/.test(raw)) return raw;
  return null;
}

function formatViewers(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '만';
  return n.toLocaleString();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// chzzk returns KST strings like "2024-11-20 15:04:05" with no timezone.
// Parse them as KST (+09:00) so elapsed time is correct in any locale.
function parseKst(dateStr) {
  if (!dateStr) return null;
  const iso = dateStr.replace(' ', 'T') + '+09:00';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function formatDurationFrom(ms) {
  if (ms == null) return '';
  let seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function formatAgo(ms) {
  if (ms == null) return '';
  let seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const days = Math.floor(h / 24);
  if (days > 0) return `${days}일 전`;
  if (h > 0) return `${h}시간 전`;
  if (m > 0) return `${m}분 전`;
  return '방금';
}

// Recompute the live-duration / ended-ago text for a single card from the
// timestamps stored on it. Called every second so the live timer ticks.
function refreshDurationText(card) {
  const durEl = card.querySelector('.channel-duration');
  if (!durEl) return;
  const isLive = card.dataset.live === '1';
  if (isLive) {
    const open = card.dataset.openDate ? Number(card.dataset.openDate) : null;
    durEl.textContent = open != null ? `🔴 ${formatDurationFrom(open)} 방송 중` : '';
  } else {
    const close = card.dataset.closeDate ? Number(card.dataset.closeDate) : null;
    durEl.textContent = close != null ? `${formatAgo(close)} 종료` : '';
  }
}

function refreshAllDurations() {
  document.querySelectorAll('.channel-card').forEach(refreshDurationText);
}

// --- rendering -----------------------------------------------------------

function avatarHtml(info) {
  if (info.channelImageUrl) {
    return `<img class="channel-avatar" src="${info.channelImageUrl}" alt="" onerror="this.style.display='none'">`;
  }
  const initial = (info.channelName || info.channelId)[0].toUpperCase();
  return `<div class="channel-avatar-placeholder">${initial}</div>`;
}

function wireCard(card, info) {
  card.dataset.channelId = info.channelId;
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn')) return;
    window.chzzk.openChannel(info.channelId, info.isLive);
  });
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, info.channelId);
  });
  const rm = card.querySelector('.remove-btn');
  if (rm) rm.addEventListener('click', (e) => {
    e.stopPropagation();
    removeChannel(info.channelId);
  });
}

// If the text in `el` overflows its (clipped) width, wrap it in a track and
// animate it horizontally (ping-pong) so the full text is readable. Falls
// back to the element's normal ellipsis when it fits.
// withTitle: also expose the full text as a native tooltip when it overflows.
// Skipped for grid names, which already have the richer custom hover tooltip.
function setupMarquee(el, withTitle = true) {
  if (!el) return;
  const text = el.textContent;
  el.innerHTML = `<span class="marquee-track"><span class="marquee-seg">${escapeHtml(text)}</span></span>`;
  requestAnimationFrame(() => {
    const track = el.querySelector('.marquee-track');
    const seg = el.querySelector('.marquee-seg');
    if (!track || !seg) return;
    const overflow = seg.scrollWidth - el.clientWidth;
    if (overflow > 2) {
      // One-directional seamless loop: a second copy follows the first, and the
      // track scrolls left by exactly one copy+gap so the wrap is invisible.
      const gap = 40;
      const distance = seg.scrollWidth + gap;
      const copy = seg.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.appendChild(copy);
      el.classList.add('marquee');
      el.style.setProperty('--marquee-shift', `-${distance}px`);
      // ~28px/sec scroll, plus the 18% start-hold from the keyframes.
      el.style.setProperty('--marquee-dur', `${Math.max(5, distance / 28 / 0.82)}s`);
      if (withTitle) el.title = text;
    } else {
      el.classList.remove('marquee');
      el.removeAttribute('title');
    }
  });
}

// Order infos by broadcast time: live (most recently started) first, then
// offline (most recently ended) first. Null/unparseable dates sink within
// their group. Returns a new array; does not mutate the input.
function sortInfos(infos) {
  const byTime = (a, b) => (b ?? -Infinity) - (a ?? -Infinity);
  const live = infos.filter(i => i.isLive)
    .sort((a, b) => byTime(parseKst(a.openDate), parseKst(b.openDate)));
  const offline = infos.filter(i => !i.isLive)
    .sort((a, b) => byTime(parseKst(a.closeDate), parseKst(b.closeDate)));
  return [...live, ...offline];
}

function isFavorite(id) {
  return favorites.includes(id);
}

function appendSection(text) {
  const el = document.createElement('div');
  el.className = 'section-header';
  el.textContent = text;
  channelList.appendChild(el);
}

function appendDivider() {
  const el = document.createElement('div');
  el.className = 'section-divider';
  channelList.appendChild(el);
}

// Split lastInfos into a favorites group (always shown) and the rest (subject to
// hide-offline), order each group, then draw with a 즐겨찾기 header + divider.
function render() {
  hideTooltip();
  let favInfos = lastInfos.filter(i => isFavorite(i.channelId));
  let restInfos = lastInfos.filter(i => !isFavorite(i.channelId));
  if (hideOffline) restInfos = restInfos.filter(i => i.isLive);
  if (sortByLiveTime) {
    favInfos = sortInfos(favInfos);
    restInfos = sortInfos(restInfos);
  }

  const total = favInfos.length + restInfos.length;
  const useGrid = viewMode === 'grid' && total > 0;
  channelList.classList.toggle('grid-view', useGrid);
  channelList.innerHTML = '';

  if (lastInfos.length === 0) {
    channelList.innerHTML = `
      <div class="empty-state">
        <div>채널이 없습니다</div>
        <div class="hint">상단 + 버튼으로 채널을 추가하세요</div>
      </div>`;
    return;
  }
  if (total === 0) {
    channelList.innerHTML = `
      <div class="empty-state">
        <div>라이브 중인 채널이 없습니다</div>
        <div class="hint">'오프라인 채널 숨기기'가 켜져 있습니다</div>
      </div>`;
    return;
  }

  const renderGroup = viewMode === 'grid' ? renderGrid : renderList;
  if (favInfos.length > 0) {
    appendSection('즐겨찾기');
    renderGroup(favInfos);
    if (restInfos.length > 0) appendDivider();
  }
  renderGroup(restInfos);
}

function renderList(infos) {
  for (const info of infos) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.draggable = !sortByLiveTime;

    const openMs = parseKst(info.openDate);
    const closeMs = parseKst(info.closeDate);
    card.dataset.live = info.isLive ? '1' : '0';
    if (openMs != null) card.dataset.openDate = String(openMs);
    if (closeMs != null) card.dataset.closeDate = String(closeMs);

    if (info.error) {
      card.innerHTML = `
        ${avatarHtml(info)}
        <div class="channel-info">
          <div class="channel-header">
            <span class="channel-name">${escapeHtml(info.channelId)}</span>
          </div>
          <div class="channel-error">불러오기 실패</div>
        </div>
        <button class="remove-btn">×</button>`;
    } else {
      const liveBadge = info.isLive ? '<span class="live-badge">LIVE</span>' : '';
      const title = info.isLive
        ? `<div class="channel-title">${escapeHtml(info.liveTitle)}</div>`
        : '<div class="channel-title" style="opacity:0.4">오프라인</div>';
      const meta = info.isLive
        ? `<div class="channel-meta">
            <span class="viewer-count">👥 ${formatViewers(info.concurrentUserCount)}</span>
            ${info.liveCategoryValue ? `<span>${escapeHtml(info.liveCategoryValue)}</span>` : ''}
           </div>`
        : '';

      card.innerHTML = `
        ${avatarHtml(info)}
        <div class="channel-info">
          <div class="channel-header">
            <span class="channel-name">${escapeHtml(info.channelName)}</span>
            ${liveBadge}
          </div>
          ${title}
          ${meta}
          <div class="channel-duration ${info.isLive ? 'is-live' : ''}"></div>
        </div>
        <button class="remove-btn">×</button>`;
    }

    wireCard(card, info);
    if (!sortByLiveTime) attachDragHandlers(card);
    channelList.appendChild(card);
    refreshDurationText(card);
    setupMarquee(card.querySelector('.channel-name'));
    if (info.isLive) setupMarquee(card.querySelector('.channel-title'));
  }
}

// Grid view: icon + channel name, with a hover tooltip for title/category.
function renderGrid(infos) {
  for (const info of infos) {
    const card = document.createElement('div');
    card.className = `grid-card ${info.isLive ? 'live' : 'offline'}`;
    const dotClass = info.isLive ? 'live' : 'offline';
    const name = info.channelName || info.channelId;

    // Stash fields for the hover tooltip (raw text; escaped when shown).
    card.dataset.name = name;
    card.dataset.live = info.isLive ? '1' : '0';
    card.dataset.title = info.liveTitle || '';
    card.dataset.category = info.liveCategoryValue || '';
    card.dataset.viewers = info.isLive ? String(info.concurrentUserCount ?? 0) : '';

    card.innerHTML = `
      <div class="grid-avatar-wrap">
        ${avatarHtml(info)}
        <span class="status-dot ${dotClass}"></span>
      </div>
      <span class="grid-name">${escapeHtml(name)}</span>
      <button class="remove-btn">×</button>`;

    wireCard(card, info);
    attachGridTooltip(card);
    channelList.appendChild(card);
    setupMarquee(card.querySelector('.grid-name'), false);
  }
}

// --- grid hover tooltip --------------------------------------------------
// Appended to <body> (position: fixed) so it is never clipped by the
// scrollable channel list.

let gridTooltip = null;

function ensureTooltip() {
  if (!gridTooltip) {
    gridTooltip = document.createElement('div');
    gridTooltip.id = 'grid-tooltip';
    gridTooltip.className = 'hidden';
    document.body.appendChild(gridTooltip);
  }
  return gridTooltip;
}

function hideTooltip() {
  if (gridTooltip) gridTooltip.classList.add('hidden');
}

function positionTooltip(x, y) {
  const t = gridTooltip;
  const pad = 14;
  const rect = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > window.innerWidth) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight) top = y - rect.height - pad;
  t.style.left = `${Math.max(4, left)}px`;
  t.style.top = `${Math.max(4, top)}px`;
}

function attachGridTooltip(card) {
  card.addEventListener('mouseenter', (e) => {
    const t = ensureTooltip();
    const live = card.dataset.live === '1';
    let html = `<div class="tt-name">${escapeHtml(card.dataset.name)}</div>`;
    if (live) {
      if (card.dataset.title) html += `<div class="tt-title">${escapeHtml(card.dataset.title)}</div>`;
      const bits = [];
      if (card.dataset.category) bits.push(escapeHtml(card.dataset.category));
      if (bits.length) html += `<div class="tt-meta">${bits.join(' · ')}</div>`;
    } else {
      html += '<div class="tt-meta">오프라인</div>';
    }
    t.innerHTML = html;
    t.classList.remove('hidden');
    positionTooltip(e.clientX, e.clientY);
  });
  card.addEventListener('mousemove', (e) => {
    if (gridTooltip && !gridTooltip.classList.contains('hidden')) {
      positionTooltip(e.clientX, e.clientY);
    }
  });
  card.addEventListener('mouseleave', hideTooltip);
}

// --- drag-and-drop reordering -------------------------------------------

let dragSrcId = null;

function attachDragHandlers(card) {
  card.addEventListener('dragstart', (e) => {
    dragSrcId = card.dataset.channelId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.channel-card.drag-over')
      .forEach(c => c.classList.remove('drag-over'));
    dragSrcId = null;
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (card.dataset.channelId !== dragSrcId) card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const targetId = card.dataset.channelId;
    if (!dragSrcId || dragSrcId === targetId) return;
    await reorderChannels(dragSrcId, targetId);
  });
}

async function reorderChannels(srcId, targetId) {
  const from = channels.indexOf(srcId);
  const to = channels.indexOf(targetId);
  if (from === -1 || to === -1) return;
  channels.splice(from, 1);
  channels.splice(to, 0, srcId);
  await window.chzzk.saveChannels(channels);
  // Reorder the already-fetched infos to match, then re-render without refetch.
  const byId = Object.fromEntries(lastInfos.map(i => [i.channelId, i]));
  lastInfos = channels.map(id => byId[id]).filter(Boolean);
  render();
}

// --- data + refresh loop -------------------------------------------------

async function loadAndRender() {
  if (channels.length === 0) {
    lastInfos = [];
    render();
    return;
  }
  const infos = await window.chzzk.fetchAllChannels(channels);
  // Keep render order aligned with the persisted channel order.
  const byId = Object.fromEntries(infos.map(i => [i.channelId, i]));
  lastInfos = channels.map(id => byId[id]).filter(Boolean);
  render();
}

async function refreshNow() {
  if (isRefreshing) return;
  isRefreshing = true;
  refreshBtn.classList.add('refreshing');
  try {
    await loadAndRender();
  } finally {
    isRefreshing = false;
    refreshBtn.classList.remove('refreshing');
    countdown = REFRESH_INTERVAL;
    updateCountdownDisplay();
  }
}

async function removeChannel(channelId) {
  channels = channels.filter(id => id !== channelId);
  await window.chzzk.saveChannels(channels);
  if (isFavorite(channelId)) {
    favorites = favorites.filter(id => id !== channelId);
    await window.chzzk.setSettings({ favorites });
  }
  await loadAndRender();
}

// Pin/unpin a channel to the 즐겨찾기 group. Data is unchanged, so just persist
// the favorites list and re-render from cache (no refetch).
async function toggleFavorite(channelId) {
  if (isFavorite(channelId)) favorites = favorites.filter(id => id !== channelId);
  else favorites.push(channelId);
  await window.chzzk.setSettings({ favorites });
  render();
}

function updateCountdownDisplay() {
  countdownEl.textContent = `${countdown}s`;
}

// One master 1-second tick drives both the live-duration timers and the
// auto-refresh countdown.
function startTick() {
  setInterval(() => {
    refreshAllDurations();
    countdown -= 1;
    if (countdown <= 0) {
      refreshNow();
    } else {
      updateCountdownDisplay();
    }
  }, 1000);
}

// --- add channel bar -----------------------------------------------------

// Error banner between the titlebar and the input bar; auto-hides after a few seconds.
let errorBannerTimer = null;
function showAddError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
  clearTimeout(errorBannerTimer);
  errorBannerTimer = setTimeout(() => errorBanner.classList.add('hidden'), 3500);
}

function hideAddError() {
  errorBanner.classList.add('hidden');
  clearTimeout(errorBannerTimer);
}

function closeAddBar() {
  addBar.classList.add('hidden');
  hideAddError();
}

document.getElementById('add-btn').addEventListener('click', () => {
  // Toggle the inline input bar below the titlebar.
  if (!addBar.classList.contains('hidden')) {
    closeAddBar();
    return;
  }
  hideAddError();
  channelInput.value = '';
  addBar.classList.remove('hidden');
  setTimeout(() => channelInput.focus(), 50);
});

document.getElementById('add-cancel-btn').addEventListener('click', closeAddBar);

// Chzzk channel ids are 32-char lowercase hex strings.
const CHANNEL_ID_PATTERN = /^[a-z0-9]{32}$/;

// Validate `rawText` (a channel id or chzzk URL), look the channel up, and add
// it. Shared by the input-field confirm and the clipboard-paste shortcut.
// Returns true if a channel was added. `onBusy(true|false)` brackets the fetch
// so the caller can show a loading state.
async function tryAddChannel(rawText, onBusy) {
  const id = extractChannelId(rawText);
  if (!id) {
    showAddError('올바른 채널 ID 또는 URL을 입력하세요.');
    return false;
  }
  if (!CHANNEL_ID_PATTERN.test(id)) {
    showAddError('채널 ID는 32자리 영소문자·숫자여야 합니다.');
    return false;
  }
  if (channels.includes(id)) {
    showAddError('이미 추가된 채널입니다.');
    return false;
  }

  hideAddError();
  onBusy?.(true);
  const info = await window.chzzk.fetchChannelInfo(id);
  onBusy?.(false);

  if (info.error) {
    showAddError(`채널을 찾을 수 없습니다: ${info.error}`);
    return false;
  }

  channels.push(id);
  await window.chzzk.saveChannels(channels);
  await refreshNow();
  return true;
}

async function confirmAdd() {
  const confirmBtn = document.getElementById('add-confirm-btn');
  const ok = await tryAddChannel(channelInput.value, (busy) => {
    confirmBtn.textContent = busy ? '확인 중...' : '추가';
    confirmBtn.disabled = busy;
  });
  if (ok) closeAddBar();
}

document.getElementById('add-confirm-btn').addEventListener('click', confirmAdd);

// Paste shortcut: Ctrl/Cmd+V anywhere (except inside the input field) adds the
// clipboard text as a channel without opening the input bar.
document.addEventListener('paste', async (e) => {
  if (document.activeElement === channelInput) return; // let it paste into the field
  const text = (e.clipboardData?.getData('text') ?? '').trim();
  if (!text) return;
  e.preventDefault();
  const ok = await tryAddChannel(text);
  if (ok) showBanner('채널을 추가했습니다', false, 2500);
});

channelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmAdd();
  if (e.key === 'Escape') closeAddBar();
});

// --- titlebar + opacity --------------------------------------------------

refreshBtn.addEventListener('click', refreshNow);
document.getElementById('chzzk-btn').addEventListener('click', () => window.chzzk.openExternal('https://chzzk.naver.com'));
document.getElementById('github-btn').addEventListener('click', () => window.chzzk.openExternal('https://github.com/b1nknet/isonair-app'));
document.getElementById('close-btn').addEventListener('click', () => window.chzzk.closeApp());
document.getElementById('minimize-btn').addEventListener('click', () => window.chzzk.minimizeApp());

// At 100% the app background goes fully solid (no translucency / blur);
// below 100% it stays glassy so the desktop shows through.
function applyOpaque(pct) {
  appEl.classList.toggle('opaque', pct >= 100);
}

opacitySlider.addEventListener('input', () => {
  const pct = Number(opacitySlider.value);
  opacityValue.textContent = `${pct}%`;
  window.chzzk.setOpacity(pct / 100);
  applyOpaque(pct);
});

function applyPinState() {
  menuAlwaysOnTop.classList.toggle('active', alwaysOnTop);
}

menuAlwaysOnTop.addEventListener('click', async () => {
  alwaysOnTop = await window.chzzk.setAlwaysOnTop(!alwaysOnTop);
  applyPinState();
});

// --- interface scale -----------------------------------------------------

function applyScaleLabel() {
  scaleValue.textContent = `${Math.round(uiScale * 100)}%`;
  const idx = SCALE_STEPS.indexOf(uiScale);
  scaleMinus.disabled = idx <= 0;
  scalePlus.disabled = idx >= SCALE_STEPS.length - 1;
}

async function stepScale(delta) {
  let idx = SCALE_STEPS.indexOf(uiScale);
  if (idx === -1) idx = SCALE_STEPS.indexOf(1); // snap an off-step value to 100%
  const next = SCALE_STEPS[Math.min(SCALE_STEPS.length - 1, Math.max(0, idx + delta))];
  if (next === uiScale) return;
  uiScale = await window.chzzk.setUiScale(next);
  applyScaleLabel();
}

scaleMinus.addEventListener('click', () => stepScale(-1));
scalePlus.addEventListener('click', () => stepScale(1));

// --- view mode + hide offline -------------------------------------------

function applyViewState() {
  viewBtn.textContent = viewMode === 'grid' ? '☰' : '▦';
  viewBtn.title = viewMode === 'grid' ? '목록 보기로 전환' : '그리드 보기로 전환';
  menuHideOffline.classList.toggle('active', hideOffline);
}

function applySortState() {
  sortBtn.classList.toggle('active', sortByLiveTime);
  sortBtn.title = sortByLiveTime ? '정렬 해제 (원래 순서)' : '방송 시간순 정렬';
}

viewBtn.addEventListener('click', async () => {
  viewMode = viewMode === 'grid' ? 'list' : 'grid';
  applyViewState();
  render();
  await window.chzzk.setSettings({ viewMode });
});

sortBtn.addEventListener('click', async () => {
  sortByLiveTime = !sortByLiveTime;
  applySortState();
  render();
  await window.chzzk.setSettings({ sortByLiveTime });
});

menuHideOffline.addEventListener('click', async () => {
  hideOffline = !hideOffline;
  applyViewState();
  render();
  await window.chzzk.setSettings({ hideOffline });
});

// --- more menu -----------------------------------------------------------

function closeMenu() { moreMenu.classList.add('hidden'); }

moreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  moreMenu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!moreMenu.classList.contains('hidden') &&
      !moreMenu.contains(e.target) && e.target !== moreBtn) {
    closeMenu();
  }
});

// The titlebar is a drag region, so the OS swallows its `click` events and the
// outside-click handler above never fires there. Catch `mousedown` instead so
// clicking the titlebar still dismisses the menu (but not when re-toggling it).
document.getElementById('titlebar').addEventListener('mousedown', (e) => {
  if (e.target !== moreBtn && !moreBtn.contains(e.target)) closeMenu();
});

// --- card context menu (right-click to favorite) -------------------------

const contextMenu = document.getElementById('context-menu');
const ctxFavorite = document.getElementById('ctx-favorite');
const ctxCopyId = document.getElementById('ctx-copy-id');
const ctxCopyUrl = document.getElementById('ctx-copy-url');
let ctxTargetId = null;

function closeContextMenu() {
  contextMenu.classList.add('hidden');
  ctxTargetId = null;
}

function showContextMenu(e, channelId) {
  ctxTargetId = channelId;
  ctxFavorite.textContent = isFavorite(channelId) ? '즐겨찾기 해제' : '즐겨찾기 추가';
  contextMenu.classList.remove('hidden');
  // Clamp to the viewport so the menu never spills off-screen.
  const { offsetWidth: w, offsetHeight: h } = contextMenu;
  const x = Math.min(e.clientX, window.innerWidth - w - 4);
  const y = Math.min(e.clientY, window.innerHeight - h - 4);
  contextMenu.style.left = `${Math.max(4, x)}px`;
  contextMenu.style.top = `${Math.max(4, y)}px`;
}

ctxFavorite.addEventListener('click', async () => {
  const id = ctxTargetId;
  closeContextMenu();
  if (id) await toggleFavorite(id);
});

ctxCopyId.addEventListener('click', async () => {
  const id = ctxTargetId;
  closeContextMenu();
  if (!id) return;
  await window.chzzk.copyToClipboard(id);
  showBanner('채널 ID를 복사했습니다', false, 2000);
});

ctxCopyUrl.addEventListener('click', async () => {
  const id = ctxTargetId;
  closeContextMenu();
  if (!id) return;
  await window.chzzk.copyToClipboard(`https://chzzk.naver.com/${id}`);
  showBanner('채널 URL을 복사했습니다', false, 2000);
});

document.addEventListener('click', (e) => {
  if (!contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target)) {
    closeContextMenu();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeContextMenu();
});
channelList.addEventListener('scroll', closeContextMenu);

// --- in-app confirm dialog ----------------------------------------------

// A promise-based modal that resolves true on 삭제, false on 취소 / overlay
// click / Esc. Reused in place of the OS-native confirm dialog.
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');

function confirmDialog(message) {
  confirmMessage.textContent = message;
  confirmOverlay.classList.remove('hidden');
  confirmOkBtn.focus();
  return new Promise((resolve) => {
    const done = (result) => {
      confirmOverlay.classList.add('hidden');
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      confirmOverlay.removeEventListener('mousedown', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onOverlay = (e) => { if (e.target === confirmOverlay) done(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      else if (e.key === 'Enter') done(true);
    };
    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
    confirmOverlay.addEventListener('mousedown', onOverlay);
    document.addEventListener('keydown', onKey);
  });
}

// --- export / import -----------------------------------------------------

document.getElementById('menu-export').addEventListener('click', async () => {
  closeMenu();
  const r = await window.chzzk.exportChannels();
  if (r?.ok) showBanner(`${r.count}개 채널을 내보냈습니다`, false, 3000);
});

document.getElementById('menu-import').addEventListener('click', async () => {
  closeMenu();
  const r = await window.chzzk.importChannels();
  if (r?.canceled) return;
  if (!r?.ok) {
    showBanner(`가져오기 실패: ${r?.error ?? '알 수 없는 오류'}`, false, 4000);
    return;
  }
  // Merge: keep existing order, append new ids.
  const before = channels.length;
  const merged = [...channels];
  for (const id of r.channels) if (!merged.includes(id)) merged.push(id);
  channels = merged;
  await window.chzzk.saveChannels(channels);
  // Merge imported favorites (only for channels we now have).
  if (r.favorites?.length) {
    favorites = [...new Set([...favorites, ...r.favorites.filter(id => channels.includes(id))])];
    await window.chzzk.setSettings({ favorites });
  }
  await refreshNow();
  showBanner(`${channels.length - before}개 채널을 가져왔습니다`, false, 3000);
});

document.getElementById('menu-remove-all').addEventListener('click', async () => {
  closeMenu();
  if (channels.length === 0) return;
  const ok = await confirmDialog(
    `${channels.length}개 채널이 목록에서 제거됩니다. 이 작업은 되돌릴 수 없습니다.`
  );
  if (!ok) return;
  const removed = channels.length;
  channels = [];
  await window.chzzk.saveChannels(channels);
  if (favorites.length > 0) {
    favorites = [];
    await window.chzzk.setSettings({ favorites });
  }
  await loadAndRender();
  showBanner(`${removed}개 채널을 삭제했습니다`, false, 3000);
});

// --- updates -------------------------------------------------------------

// macOS can't auto-install unsigned builds via Squirrel.Mac, so it gets a
// notify-only flow: the action button opens the GitHub release for a manual
// download instead of triggering an in-place update.
const IS_MAC = window.chzzk.platform === 'darwin';
let bannerAction = null; // 'restart' (Windows) | 'download' (macOS)
let pendingReleaseUrl = null;

let bannerTimer = null;
function showBanner(text, withButton = false, autoHideMs = 0, btnLabel = '재시작') {
  updateText.textContent = text;
  updateRestart.textContent = btnLabel;
  updateRestart.classList.toggle('hidden', !withButton);
  updateBanner.classList.remove('hidden');
  clearTimeout(bannerTimer);
  if (autoHideMs > 0) {
    bannerTimer = setTimeout(() => updateBanner.classList.add('hidden'), autoHideMs);
  }
}

// Numeric compare of dotted versions (a vs b): 1 if a>b, -1 if a<b, 0 if equal.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkUpdates() {
  closeMenu();
  showBanner('업데이트 확인 중...');
  const latest = await window.chzzk.getLatestVersion();
  if (latest.error) {
    showBanner(`업데이트 확인 실패: ${latest.error}`, false, 5000);
    return;
  }
  if (compareVersions(latest.version, currentVersion) > 0) {
    if (IS_MAC) {
      // Notify-only: Squirrel.Mac can't install our unsigned build, so point
      // the user at the release page to download and replace the app manually.
      bannerAction = 'download';
      pendingReleaseUrl = latest.url;
      showBanner(`새 버전 v${latest.version} 사용 가능 (현재 v${currentVersion})`, true, 0, '다운로드');
    } else {
      bannerAction = 'restart';
      showBanner(`새 버전 v${latest.version} 사용 가능 (현재 v${currentVersion})`);
      // Packaged build: trigger the actual download (progress/restart banners
      // follow via onUpdateStatus). Dev: no-op, so this message stays.
      window.chzzk.checkForUpdates();
    }
  } else {
    showBanner(`최신 버전입니다 (v${currentVersion})`, false, 4000);
  }
}

document.getElementById('menu-update').addEventListener('click', checkUpdates);

updateRestart.addEventListener('click', () => {
  if (bannerAction === 'download' && pendingReleaseUrl) {
    window.chzzk.openExternal(pendingReleaseUrl);
  } else {
    window.chzzk.restartToUpdate();
  }
});

// These events only fire on Windows now — macOS never starts the Squirrel
// updater, so it stays on the manual-download banner from checkUpdates().
window.chzzk.onUpdateStatus((d) => {
  switch (d.status) {
    case 'checking': showBanner('업데이트 확인 중...'); break;
    case 'available': showBanner(`새 버전 ${d.version} 발견, 다운로드 중...`); break;
    case 'downloading': showBanner(`다운로드 중... ${d.percent ?? 0}%`); break;
    case 'downloaded': bannerAction = 'restart'; showBanner(`버전 ${d.version} 준비 완료 — 재시작하여 적용`, true); break;
    case 'none': showBanner('최신 버전입니다', false, 3000); break;
    case 'error': showBanner(`업데이트 오류: ${d.message ?? ''}`, false, 5000); break;
  }
});

// --- init ----------------------------------------------------------------

async function init() {
  currentVersion = await window.chzzk.getAppVersion();
  currentVersionEl.textContent = `v${currentVersion}`;

  const settings = await window.chzzk.getSettings();
  const pct = Math.round((settings.opacity ?? 1) * 100);
  opacitySlider.value = String(pct);
  opacityValue.textContent = `${pct}%`;
  applyOpaque(pct);

  alwaysOnTop = settings.alwaysOnTop ?? true;
  applyPinState();

  uiScale = settings.uiScale ?? 1;
  applyScaleLabel();

  hideOffline = settings.hideOffline ?? false;
  viewMode = settings.viewMode ?? 'list';
  applyViewState();

  sortByLiveTime = settings.sortByLiveTime ?? false;
  applySortState();

  favorites = Array.isArray(settings.favorites) ? settings.favorites : [];

  channels = await window.chzzk.getChannels();
  updateCountdownDisplay();
  await refreshNow();
  startTick();
}

init();
