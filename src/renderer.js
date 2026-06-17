const channelList = document.getElementById('channel-list');
const addModal = document.getElementById('add-modal');
const channelInput = document.getElementById('channel-input');
const addError = document.getElementById('add-error');
const refreshBtn = document.getElementById('refresh-btn');
const countdownEl = document.getElementById('countdown');
const appEl = document.getElementById('app');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');
const scaleMinus = document.getElementById('scale-minus');
const scaleValue = document.getElementById('scale-value');
const scalePlus = document.getElementById('scale-plus');
const viewBtn = document.getElementById('view-btn');
const moreBtn = document.getElementById('more-btn');
const moreMenu = document.getElementById('more-menu');
const menuAlwaysOnTop = document.getElementById('menu-always-on-top');
const menuHideOffline = document.getElementById('menu-hide-offline');
const updateBanner = document.getElementById('update-banner');
const updateText = document.getElementById('update-text');
const updateRestart = document.getElementById('update-restart');

let alwaysOnTop = true;
let hideOffline = false;
let viewMode = 'list'; // 'list' | 'grid'

// Interface zoom levels cycled by the footer scale button.
const SCALE_STEPS = [0.85, 1, 1.15, 1.3];
let uiScale = 1;

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
  el.innerHTML = `<span class="marquee-track">${escapeHtml(text)}</span>`;
  requestAnimationFrame(() => {
    const track = el.querySelector('.marquee-track');
    if (!track) return;
    const overflow = track.scrollWidth - el.clientWidth;
    if (overflow > 2) {
      const distance = overflow + 6;
      el.classList.add('marquee');
      el.style.setProperty('--marquee-shift', `-${distance}px`);
      // ~28px/sec so longer text scrolls proportionally longer.
      el.style.setProperty('--marquee-dur', `${Math.max(4, distance / 28)}s`);
      if (withTitle) el.title = text;
    } else {
      el.classList.remove('marquee');
      el.removeAttribute('title');
    }
  });
}

// Apply the current view-mode + hide-offline filter to lastInfos and draw.
function render() {
  hideTooltip();
  const visible = hideOffline ? lastInfos.filter(i => i.isLive) : lastInfos;
  const useGrid = viewMode === 'grid' && visible.length > 0;
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
  if (visible.length === 0) {
    channelList.innerHTML = `
      <div class="empty-state">
        <div>라이브 중인 채널이 없습니다</div>
        <div class="hint">'오프라인 채널 숨기기'가 켜져 있습니다</div>
      </div>`;
    return;
  }

  if (viewMode === 'grid') renderGrid(visible);
  else renderList(visible);
}

function renderList(infos) {
  for (const info of infos) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.draggable = true;

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
    attachDragHandlers(card);
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
  await loadAndRender();
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

// --- add channel modal ---------------------------------------------------

document.getElementById('add-btn').addEventListener('click', () => {
  addError.classList.add('hidden');
  channelInput.value = '';
  addModal.classList.remove('hidden');
  setTimeout(() => channelInput.focus(), 50);
});

document.getElementById('add-cancel-btn').addEventListener('click', () => {
  addModal.classList.add('hidden');
});

async function confirmAdd() {
  const id = extractChannelId(channelInput.value);
  if (!id) {
    addError.textContent = '올바른 채널 ID 또는 URL을 입력하세요.';
    addError.classList.remove('hidden');
    return;
  }
  if (channels.includes(id)) {
    addError.textContent = '이미 추가된 채널입니다.';
    addError.classList.remove('hidden');
    return;
  }

  const confirmBtn = document.getElementById('add-confirm-btn');
  addError.classList.add('hidden');
  confirmBtn.textContent = '확인 중...';
  confirmBtn.disabled = true;

  const info = await window.chzzk.fetchChannelInfo(id);
  confirmBtn.textContent = '추가';
  confirmBtn.disabled = false;

  if (info.error) {
    addError.textContent = `채널을 찾을 수 없습니다: ${info.error}`;
    addError.classList.remove('hidden');
    return;
  }

  channels.push(id);
  await window.chzzk.saveChannels(channels);
  addModal.classList.add('hidden');
  await refreshNow();
}

document.getElementById('add-confirm-btn').addEventListener('click', confirmAdd);

channelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmAdd();
  if (e.key === 'Escape') addModal.classList.add('hidden');
});

// --- titlebar + opacity --------------------------------------------------

refreshBtn.addEventListener('click', refreshNow);
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

viewBtn.addEventListener('click', async () => {
  viewMode = viewMode === 'grid' ? 'list' : 'grid';
  applyViewState();
  render();
  await window.chzzk.setSettings({ viewMode });
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
  await refreshNow();
  showBanner(`${channels.length - before}개 채널을 가져왔습니다`, false, 3000);
});

// --- updates -------------------------------------------------------------

let bannerTimer = null;
function showBanner(text, withRestart = false, autoHideMs = 0) {
  updateText.textContent = text;
  updateRestart.classList.toggle('hidden', !withRestart);
  updateBanner.classList.remove('hidden');
  clearTimeout(bannerTimer);
  if (autoHideMs > 0) {
    bannerTimer = setTimeout(() => updateBanner.classList.add('hidden'), autoHideMs);
  }
}

document.getElementById('menu-update').addEventListener('click', () => {
  closeMenu();
  showBanner('업데이트 확인 중...');
  window.chzzk.checkForUpdates();
});

updateRestart.addEventListener('click', () => window.chzzk.restartToUpdate());

window.chzzk.onUpdateStatus((d) => {
  switch (d.status) {
    case 'checking': showBanner('업데이트 확인 중...'); break;
    case 'available': showBanner(`새 버전 ${d.version} 발견, 다운로드 중...`); break;
    case 'downloading': showBanner(`다운로드 중... ${d.percent ?? 0}%`); break;
    case 'downloaded': showBanner(`버전 ${d.version} 준비 완료 — 재시작하여 적용`, true); break;
    case 'none': showBanner('최신 버전입니다', false, 3000); break;
    case 'error': showBanner(`업데이트 오류: ${d.message ?? ''}`, false, 5000); break;
  }
});

// --- init ----------------------------------------------------------------

async function init() {
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

  channels = await window.chzzk.getChannels();
  updateCountdownDisplay();
  await refreshNow();
  startTick();
}

init();
