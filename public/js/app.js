let allRemotes = [];
let syncPairs = [];
let syncSchedule = [];
let jobHistory = [];
let authType = '';
let authRemoteName = '';
let authSessionId = '';
let authPollTimer = null;
let addingPairFor = '';
let dismissedErrors = new Set(JSON.parse(localStorage.getItem('rclonegui_dismissed') || '[]'));

const ICONS = {
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  key: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  sync: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  cloud: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  arrowRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  arrowLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
  terminal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  history: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  folderOpen: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  fileText: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="4"/></svg>',
};

function icon(name, size) {
  const svg = ICONS[name] || '';
  if (size && svg) return svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
  return svg;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  return res.json();
}

async function loadAll() {
  const data = await api('/api/remotes');
  allRemotes = data.remotes || [];
  const settings = await api('/api/sync-settings');
  syncPairs = settings.settings?.pairs || [];
  syncSchedule = settings.settings?.schedule || [];
  const jobs = await api('/api/jobs');
  jobHistory = jobs.jobs || [];
  renderAll();
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  const iconHtml = type === 'success' ? icon('check') : type === 'error' ? icon('x') : icon('clock');
  t.innerHTML = iconHtml + msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 4000);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  if (name === 'main') loadAll();
  if (name === 'jobs') loadJobs();
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}
function closeModalBg(e) { if (e.target === e.currentTarget) closeModal(); }

function esc(s) { return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function dismissError(source, dest) {
  dismissedErrors.add(`${source}→${dest}`);
  localStorage.setItem('rclonegui_dismissed', JSON.stringify([...dismissedErrors]));
  showPage('jobs');
}

function renderAll() {
  const container = document.getElementById('remote-cards');
  const schedSection = document.getElementById('schedule-section');

  if (!allRemotes.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon('cloud')}</div>
        <h3>アカウントが未登録です</h3>
        <p>右上のボタンからクラウドアカウントを追加してください</p>
      </div>`;
    schedSection.style.display = 'none';
    return;
  }

  let html = '';
  for (const r of allRemotes) {
    const pairs = syncPairs.filter(p => p.remoteName === r.name);
    const typeLabel = r.type === 'drive' ? 'Google ドライブ' : 'OneDrive';
    const typeIcon = r.type === 'drive'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M7.71 3.5 1.15 15l3.43 6h13.14l3.43-6L15.29 3.5H7.71z"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M10.5 18.5h-6a3.5 3.5 0 0 1-.72-6.93A5 5 0 0 1 14.56 8H18a3.5 3.5 0 0 1 .5 6.94"/><path d="M18 8V6.5a3.5 3.5 0 0 0-7 0V8"/></svg>';

    html += `
    <div class="card remote-card">
      <div class="remote-card-header">
        <div class="remote-card-left">
          <div class="remote-icon ${r.type}">${typeIcon}</div>
          <div>
            <div class="remote-card-name">${esc(r.name)}</div>
            <div class="remote-card-type">${typeLabel}</div>
          </div>
        </div>
        <div class="remote-card-actions">
          <button class="btn btn-outline btn-sm" onclick="setupSsh()">${icon('terminal')} 一時SSH</button>
          <button class="btn btn-pastel btn-sm" onclick="startAuthFlow('${esc(r.name)}','${r.type}')">${icon('key')} 認証</button>
          <button class="btn btn-outline btn-sm" onclick="testRemote('${esc(r.name)}')">${icon('link')} テスト</button>
          <button class="btn btn-outline btn-sm" onclick="teardownSsh()">${icon('trash')} SSH削除</button>
          <button class="btn btn-pastel-green btn-sm" onclick="openAddPair('${esc(r.name)}','${r.type}')">${icon('plus')} 同期ペア追加</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRemote('${esc(r.name)}')">${icon('trash')} 削除</button>
        </div>
      </div>`;

    if (pairs.length) {
      html += '<div class="sync-pairs-area">';
      html += '<div class="sync-pairs-area-title">同期ペア</div>';
      for (let i = 0; i < pairs.length; i++) {
        const pi = syncPairs.indexOf(pairs[i]);
        const p = pairs[i];
        const pairJobs = jobHistory.filter(j => j.source === p.source && j.dest === p.dest);
        const errorKey = `${p.source}→${p.dest}`;
        const hasError = pairJobs.some(j => j.status === 'failed') && !dismissedErrors.has(errorKey);
        const errorLink = hasError ? `<span class="sync-error-link" onclick="dismissError('${esc(p.source)}','${esc(p.dest)}')">同期エラーあり</span>` : '';
        html += `
        <div class="sync-pair-row">
          <div class="sync-pair-left">
            <span class="sync-pair-path">${esc(p.source)}</span>
            <span class="sync-arrow">${icon('arrowRight')}</span>
            <span class="sync-pair-path">${esc(p.dest)}</span>
            ${p.deleteExtra ? '<span class="tag tag-red">削除あり</span>' : ''}
          </div>
          <div class="sync-pair-right">
            ${errorLink}
            <button class="btn btn-pastel btn-sm" onclick="syncPairNow(${pi})">${icon('sync')} 同期</button>
            <button class="btn btn-outline btn-sm" onclick="editPair(${pi})">${icon('edit')} 編集</button>
            <button class="btn btn-danger btn-sm" onclick="deletePair(${pi})">${icon('trash')}</button>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;

  if (syncPairs.length) {
    schedSection.style.display = '';
    renderSyncSchedule();
  } else {
    schedSection.style.display = 'none';
  }
}

// === Remote Actions ===
async function testRemote(n) {
  showToast('テスト中...', 'info');
  try {
    const d = await api(`/api/remotes/${n}/test`, { method: 'POST' });
    showToast(d.ok ? `${n} 接続成功` : `失敗: ${(d.error || '').substring(0, 80)}`, d.ok ? 'success' : 'error');
  } catch (e) {
    showToast('テスト失敗: ' + e.message, 'error');
  }
}

async function deleteRemote(n) {
  if (!confirm(`「${n}」を削除しますか？`)) return;
  try {
    const d = await api(`/api/remotes/${n}`, { method: 'DELETE' });
    if (d.ok) { showToast('削除しました', 'success'); loadAll(); }
    else showToast(d.error || '失敗', 'error');
  } catch (e) { showToast('失敗: ' + e.message, 'error'); }
}

// === SSH ===
async function setupSsh() {
  showToast('SSH設定中...', 'info');
  try {
    const d = await api('/api/ssh/setup', { method: 'POST' });
    if (d.ok) {
      alert(`SSH一時設定完了\n\nホスト: ${d.hostname}\nユーザー: root\nパスワード: ${d.password}\n\n接続:\nssh -L 53682:127.0.0.1:53682 root@${d.hostname}`);
      showToast('SSH有効', 'success');
    } else showToast('失敗: ' + (d.error || ''), 'error');
  } catch (e) { showToast('失敗: ' + e.message, 'error'); }
}

async function teardownSsh() {
  if (!confirm('一時SSH設定を削除しますか？')) return;
  try {
    const d = await api('/api/ssh/teardown', { method: 'POST' });
    showToast(d.ok ? '削除しました' : '失敗', d.ok ? 'success' : 'error');
  } catch (e) { showToast('失敗: ' + e.message, 'error'); }
}

// === Add Remote ===
function openAddModal(type) {
  authType = type;
  const title = type === 'drive' ? 'Google ドライブを追加' : 'OneDrive を追加';
  document.getElementById('modal-title').textContent = title;
  const defaultName = type === 'drive' ? 'gdrive' : 'onedrive';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>リモート名</label>
      <input type="text" id="add-name" value="${defaultName}">
    </div>
    <div class="modal-footer" style="padding:0;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-pastel" onclick="addRemoteOnly()">追加する</button>
    </div>`;
  document.getElementById('modal-add').classList.add('open');
}

async function addRemoteOnly() {
  const name = document.getElementById('add-name').value.trim();
  if (!name) { showToast('名前を入力', 'error'); return; }
  try {
    const d = await api('/api/remotes', { method: 'POST', body: { name, type: authType, params: {} } });
    if (!d.ok) { showToast(d.error || '失敗', 'error'); return; }
    showToast(`「${name}」を追加しました`, 'success');
    closeModal();
    loadAll();
  } catch (e) { showToast('失敗: ' + e.message, 'error'); }
}

// === Auth ===
function startAuthFlow(name, type) {
  authRemoteName = name;
  authType = type;
  if (authPollTimer) { clearInterval(authPollTimer); authPollTimer = null; }
  document.getElementById('auth-status').textContent = '認証サーバー起動中...';
  document.getElementById('auth-url-area').style.display = 'none';
  document.getElementById('auth-done-area').style.display = 'none';
  document.getElementById('modal-auth').classList.add('open');

  fetch('/api/auth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, remoteName: name })
  }).then(r => r.json()).then(data => {
    if (!data.ok) { document.getElementById('auth-status').textContent = 'エラー: ' + (data.error || ''); return; }
    authSessionId = data.sessionId;
    if (data.authUrl) showUrl(data.authUrl);
    authPollTimer = setInterval(pollAuth, 1500);
    pollAuth();
  }).catch(e => { document.getElementById('auth-status').textContent = 'エラー: ' + e.message; });
}

function pollAuth() {
  if (!authSessionId) return;
  fetch(`/api/auth/poll/${authSessionId}`).then(r => r.json()).then(data => {
    if (data.authUrl) showUrl(data.authUrl);
    if (data.done) {
      clearInterval(authPollTimer); authPollTimer = null;
      if (data.success) {
        document.getElementById('auth-done-area').style.display = '';
        document.getElementById('auth-status').textContent = '';
        setTimeout(() => { closeModal(); showToast(`「${authRemoteName}」認証完了`, 'success'); loadAll(); }, 2000);
      } else {
        document.getElementById('auth-status').textContent = '失敗: ' + (data.error || '');
      }
    }
  }).catch(() => {});
}

function showUrl(url) {
  document.getElementById('auth-url-area').style.display = '';
  document.getElementById('auth-url-input').value = url;
  document.getElementById('auth-url-link').href = url;
  const m = url.match(/http:\/\/[\d.]+:(\d+)/);
  const port = m ? m[1] : '53682';
  document.getElementById('auth-status').textContent = 'SSHトンネル接続後、下のURLを開いてください';
  document.getElementById('ssh-cmd').textContent = `ssh -L ${port}:127.0.0.1:${port} root@${location.hostname}`;
}

function copyAuthUrl() {
  const e = document.getElementById('auth-url-input');
  e.select(); e.setSelectionRange(0, 99999);
  try { document.execCommand('copy'); showToast('コピーしました', 'success'); } catch { showToast('失敗', 'error'); }
}

function copySshCmd() {
  const e = document.getElementById('ssh-cmd');
  const t = document.createElement('textarea');
  t.value = e.textContent; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); showToast('コピーしました', 'success'); } catch { showToast('失敗', 'error'); }
  document.body.removeChild(t);
}

// === Sync Pairs ===
function openAddPair(remoteName, remoteType) {
  addingPairFor = remoteName;
  const prefix = `${remoteName}:`;
  document.getElementById('pair-prefix').textContent = prefix;
  document.getElementById('pair-source').value = '';
  document.getElementById('pair-dest').value = '';
  document.getElementById('pair-delete').checked = false;
  document.getElementById('modal-sync-pair').classList.add('open');
}

async function saveSyncPair() {
  const source = document.getElementById('pair-source').value.trim();
  const pathOnly = document.getElementById('pair-dest').value.trim();
  const prefix = document.getElementById('pair-prefix').textContent;
  const deleteExtra = document.getElementById('pair-delete').checked;
  if (!source) { showToast('コピー元を入力', 'error'); return; }
  if (!pathOnly) { showToast('コピー先を入力', 'error'); return; }

  if (editingPairIdx >= 0) {
    syncPairs[editingPairIdx] = { source, dest: prefix + pathOnly, deleteExtra, remoteName: addingPairFor };
    showToast('同期ペアを更新しました', 'success');
  } else {
    syncPairs.push({ source, dest: prefix + pathOnly, deleteExtra, remoteName: addingPairFor });
    showToast('同期ペアを追加しました', 'success');
  }
  editingPairIdx = -1;
  await saveSettings();
  closeModal();
  loadAll();
}

async function deletePair(idx) {
  if (!confirm('この同期ペアを削除しますか？')) return;
  syncPairs.splice(idx, 1);
  try {
    await saveSettings();
    showToast('削除しました', 'success');
    loadAll();
  } catch (e) { showToast('失敗: ' + e.message, 'error'); }
}

async function syncPairNow(idx) {
  const p = syncPairs[idx];
  if (!p) return;
  showToast('同期開始...', 'info');
  try {
    const d = await api('/api/jobs', {
      method: 'POST',
      body: { source: p.source, dest: p.dest, mode: 'copy', name: `${p.source} → ${p.dest}`, deleteExtra: p.deleteExtra }
    });
    if (d.jobId) { showToast(`ジョブ ${d.jobId} 開始`, 'success'); showPage('jobs'); }
    else showToast(d.error || '失敗', 'error');
  } catch (e) { showToast('失敗: ' + e.message, 'error'); }
}

let editingPairIdx = -1;

function editPair(idx) {
  editingPairIdx = idx;
  const p = syncPairs[idx];
  const remoteName = p.remoteName || allRemotes[0]?.name || 'gdrive';
  addingPairFor = remoteName;
  const prefix = `${remoteName}:`;
  let pathOnly = p.dest || '';
  if (pathOnly.startsWith(prefix)) pathOnly = pathOnly.substring(prefix.length);

  document.getElementById('pair-source').value = p.source || '';
  document.getElementById('pair-dest').value = pathOnly;
  document.getElementById('pair-delete').checked = p.deleteExtra || false;
  document.getElementById('pair-prefix').textContent = prefix;
  document.getElementById('modal-sync-pair').classList.add('open');
}

async function saveSettings() {
  await api('/api/sync-settings', { method: 'POST', body: { pairs: syncPairs, schedule: syncSchedule } });
}

// === Schedule ===
function renderSyncSchedule() {
  const el = document.getElementById('sync-schedule-list');
  if (!syncSchedule.length) {
    el.innerHTML = '<div style="padding:8px 0;color:var(--text3);font-size:0.85rem">未設定</div>';
    return;
  }
  el.innerHTML = syncSchedule.map((t, i) => `
    <div class="sync-schedule-item">
      <span class="sync-schedule-time">${icon('clock')} ${t}</span>
      <button class="btn btn-danger btn-sm" onclick="syncSchedule.splice(${i},1);renderSyncSchedule()">${icon('trash')}</button>
    </div>
  `).join('');
}

function addSyncSchedule() {
  const hourSelect = document.getElementById('schedule-time-select');
  const minSelect = document.getElementById('schedule-min-select');
  const hour = hourSelect.value;
  const min = minSelect.value;
  if (!hour && hour !== '0') { showToast('時間を選択してください', 'error'); return; }
  const h = hour.padStart(2, '0');
  const time = `${h}:${min}`;
  if (syncSchedule.includes(time)) { showToast('重複しています', 'error'); return; }
  syncSchedule.push(time);
  syncSchedule.sort();
  renderSyncSchedule();
  hourSelect.value = '';
  minSelect.value = '00';
}

async function saveSchedule() {
  await api('/api/sync-settings', { method: 'POST', body: { pairs: syncPairs, schedule: syncSchedule } });
  showToast('スケジュールを保存しました', 'success');
}

function exportSettings() {
  const data = { pairs: syncPairs, schedule: syncSchedule, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rclonegui-settings-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('設定をエクスポートしました', 'success');
}

function importSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.pairs && data.schedule) {
        syncPairs = data.pairs;
        syncSchedule = data.schedule;
        await saveSettings();
        showToast('設定をインポートしました', 'success');
        loadAll();
      } else {
        showToast('無効な設定ファイルです', 'error');
      }
    } catch (e) {
      showToast('読み込みエラー: ' + e.message, 'error');
    }
  };
  input.click();
}

async function showCronInfo() {
  const area = document.getElementById('cron-info-area');
  const content = document.getElementById('cron-info-content');
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  area.style.display = '';
  content.textContent = '読み込み中...';
  const d = await api('/api/cron-info');
  content.textContent = d.ok ? d.output : 'エラー: ' + (d.error || '');
}

// === Jobs ===
async function loadJobs() {
  const data = await api('/api/jobs');
  const list = document.getElementById('job-list');
  if (!data.jobs?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon('fileText')}</div>
        <h3>ジョブがありません</h3>
      </div>`;
    return;
  }
  list.innerHTML = data.jobs.map(j => {
    const sl = { running: '実行中', completed: '完了', failed: '失敗', stopped: '停止' }[j.status] || j.status;
    const logLines = (j.log || '').split('\n').filter(Boolean);
    const lastLines = logLines.slice(-20).join('\n');
    return `
    <div class="job-card">
      <div class="job-card-top">
        <span class="job-card-name">${esc(j.name || j.id)}</span>
        <span class="job-status ${j.status}">${sl}</span>
      </div>
      <div class="job-card-paths"><span>${esc(j.source)}</span><span class="sync-arrow">${icon('arrowRight')}</span><span>${esc(j.dest)}</span></div>
      <div class="job-card-meta">
        <div>${new Date(j.createdAt).toLocaleString('ja-JP')}${j.completedAt ? ' → ' + new Date(j.completedAt).toLocaleString('ja-JP') : ''}</div>
      </div>
      ${lastLines ? `<div class="job-log"><pre>${esc(lastLines)}</pre></div>` : ''}
    </div>`;
  }).join('');

  if (data.jobs.some(j => j.status === 'running')) setTimeout(loadJobs, 2000);
}

document.addEventListener('DOMContentLoaded', () => loadAll());
