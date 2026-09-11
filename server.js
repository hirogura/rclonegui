const express = require('express');
const { execSync, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const app = express();
const PORT = process.env.PORT || 3348;
const RCLONE_CONFIG_DIR = path.join(__dirname, 'config');
const SYNC_JOBS_DIR = path.join(__dirname, 'sync-jobs');
const CONFIG_PATH = path.join(RCLONE_CONFIG_DIR, 'rclone.conf');

const APP_VERSION = '1.0.1';
const SERVICE_NAME = process.env.RCLONEGUI_SERVICE || 'rclonegui';
const GITHUB_RAW = 'https://raw.githubusercontent.com/hirogura/rclonegui/main/';
const UPDATE_FILES = ['server.js', 'public/index.html', 'public/js/app.js', 'public/css/style.css'];

if (!fs.existsSync(RCLONE_CONFIG_DIR)) fs.mkdirSync(RCLONE_CONFIG_DIR, { recursive: true });
if (!fs.existsSync(SYNC_JOBS_DIR)) fs.mkdirSync(SYNC_JOBS_DIR, { recursive: true });

process.env.RCLONE_CONFIG = CONFIG_PATH;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return '';
  return fs.readFileSync(CONFIG_PATH, 'utf-8');
}

function writeConfig(content) {
  fs.writeFileSync(CONFIG_PATH, content.trim() + '\n');
}

function parseRemotes() {
  const content = readConfig();
  if (!content.trim()) return [];
  const remotes = [];
  let current = null;
  for (const line of content.split('\n')) {
    const m = line.match(/^\[(.+)\]$/);
    if (m) {
      if (current) remotes.push(current);
      current = { name: m[1], type: '', params: {} };
    } else if (current && line.includes('=')) {
      const eq = line.indexOf('=');
      const key = line.substring(0, eq).trim();
      const val = line.substring(eq + 1).trim();
      current.params[key] = val;
      if (key === 'type') current.type = val;
    }
  }
  if (current) remotes.push(current);
  return remotes;
}

function rclone(args) {
  try {
    const out = execFileSync('rclone', args, {
      timeout: 30000,
      encoding: 'utf-8',
      env: { ...process.env, RCLONE_CONFIG: CONFIG_PATH }
    });
    return { ok: true, data: out.trim() };
  } catch (e) {
    const msg = e.stdout ? String(e.stdout).trim() : '';
    return { ok: false, error: (msg || e.message).trim() };
  }
}

function isValidRemoteName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name);
}

function isValidJobId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

// === Admin: version / update / restart ===
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

function fetchRaw(rel) {
  return new Promise((resolve, reject) => {
    https.get(GITHUB_RAW + rel, { headers: { 'User-Agent': 'rclonegui-updater' } }, r => {
      if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode}: ${rel}`));
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    }).on('error', reject);
  });
}

function restartService() {
  setTimeout(() => {
    spawn('systemctl', ['restart', SERVICE_NAME], { stdio: 'ignore', detached: true }).unref();
  }, 800);
}

app.post('/api/admin/restart', (req, res) => {
  restartService();
  res.json({ ok: true });
});

app.post('/api/admin/update', async (req, res) => {
  try {
    const fetched = {};
    for (const rel of UPDATE_FILES) fetched[rel] = await fetchRaw(rel);
    if (!fetched['server.js'].includes("require('express')") || !fetched['public/index.html'].includes('</html>')) {
      return res.status(500).json({ ok: false, error: 'ダウンロードしたファイルが不正です' });
    }

    let changed = false;
    for (const rel of UPDATE_FILES) {
      let cur = '';
      try { cur = fs.readFileSync(path.join(__dirname, rel), 'utf-8'); } catch {}
      if (cur !== fetched[rel]) changed = true;
    }
    if (!changed) return res.json({ ok: true, updated: false });

    // server.js を構文チェックしてから置換
    // 注: `node --check` は拡張子 .new を解釈できず ERR_UNKNOWN_FILE_EXTENSION で
    // 必ず失敗するため、vm.Script でメモリ上にコンパイルして検証する
    try {
      new vm.Script(fetched['server.js'], { filename: 'server.js' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'ダウンロードしたserver.jsの構文チェックに失敗しました\n' + e.message });
    }
    const tmpSrv = path.join(__dirname, 'server.js.new');
    fs.writeFileSync(tmpSrv, fetched['server.js']);
    fs.renameSync(tmpSrv, path.join(__dirname, 'server.js'));
    for (const rel of UPDATE_FILES) {
      if (rel === 'server.js') continue;
      const tmp = path.join(__dirname, rel + '.new');
      fs.writeFileSync(tmp, fetched[rel]);
      fs.renameSync(tmp, path.join(__dirname, rel));
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
  restartService();
  res.json({ ok: true, updated: true });
});

// === Config API ===
app.get('/api/remotes', (req, res) => {
  res.json({ remotes: parseRemotes() });
});

app.post('/api/remotes', (req, res) => {
  const { name, type, params } = req.body;
  if (!name || !type) return res.status(400).json({ error: '名前とタイプは必須です' });
  if (!isValidRemoteName(name)) return res.status(400).json({ error: '名前は英数字、ハイフン、アンダースコアのみ' });
  if (typeof type !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(type)) return res.status(400).json({ error: 'タイプが不正です' });

  const remotes = parseRemotes();
  if (remotes.find(r => r.name === name)) return res.status(409).json({ error: `「${name}」は既に存在します` });

  let section = `[${name}]\ntype = ${type}`;
  for (const [k, v] of Object.entries(params || {})) {
    if (!/^[a-zA-Z0-9_]+$/.test(k)) return res.status(400).json({ error: `パラメータ名が不正です: ${k}` });
    if (typeof v !== 'string' || v === '' || v == null) continue;
    if (/[\r\n[\]]/.test(v)) return res.status(400).json({ error: `パラメータ値が不正です: ${k}` });
    section += `\n${k} = ${v}`;
  }
  const sep = readConfig().trim() ? '\n' : '';
  fs.appendFileSync(CONFIG_PATH, sep + section + '\n');
  res.json({ ok: true });
});

app.delete('/api/remotes/:name', (req, res) => {
  const { name } = req.params;
  if (!isValidRemoteName(name)) return res.status(400).json({ error: '名前が不正です' });
  let content = readConfig();
  const re = new RegExp(`\\n?\\[${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\[]*`, 'g');
  if (!re.test(content)) return res.status(404).json({ error: `「${name}」が見つかりません` });
  content = content.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();
  writeConfig(content);
  res.json({ ok: true });
});

app.post('/api/remotes/:name/test', (req, res) => {
  const { name } = req.params;
  if (!isValidRemoteName(name)) return res.status(400).json({ ok: false, error: '名前が不正です' });
  const result = rclone(['lsf', `${name}:`, '--max-depth', '1', '--dirs-only']);
  if (result.ok) {
    res.json({ ok: true, folders: result.data ? result.data.split('\n').filter(Boolean).map(l => l.replace(/\/$/, '')) : [] });
  } else {
    res.json({ ok: false, error: result.error });
  }
});

// === Sync Settings ===
const SYNC_SETTINGS_PATH = path.join(__dirname, 'config', 'sync-settings.json');

app.get('/api/sync-settings', (req, res) => {
  try {
    if (fs.existsSync(SYNC_SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
      res.json({ ok: true, settings: data });
    } else {
      res.json({ ok: true, settings: { pairs: [], schedule: [] } });
    }
  } catch (e) {
    res.json({ ok: true, settings: { pairs: [], schedule: [] } });
  }
});

const CRON_MARKER = '# rclonegui-schedule';
const CRON_SCRIPT = path.join(__dirname, 'cron-sync.sh');

function shEscape(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

function writeCronScript(pairs) {
  let script = `#!/bin/bash
export RCLONE_CONFIG="${CONFIG_PATH}"
JOBS_DIR="${SYNC_JOBS_DIR}"

run_pair() {
  local src="$1" dest="$2" del="$3" name="$4"
  local jid="job_$(date +%s%N | cut -c1-13)_$(shuf -i 1000-9999 -n1)"
  local jfile="$JOBS_DIR/$jid.json"
  local jtmp="$JOBS_DIR/$jid.tmp"
  local args=""
  if [ "$del" = "true" ]; then args="sync"; else args="copy"; fi
  args="$args --stats 2s --stats-one-line -v"
  rclone $args "$src" "$dest" > "$jtmp" 2>&1
  local code=$?
  local status="completed"
  if [ $code -ne 0 ]; then status="failed"; fi
  local logcontent=""
  if [ -f "$jtmp" ]; then logcontent=$(cat "$jtmp" | tr "\\n" " " | head -c 5000); fi
  local mode="copy"
  if [ "$del" = "true" ]; then mode="sync"; fi
  local ts=$(date -Iseconds)
  python3 - "$jfile" "$jid" "$name" "$src" "$dest" "$mode" "$del" "$status" "$logcontent" "$ts" <<'PYEOF'
import json, sys
jfile, jid, name, src, dest, mode, dele, status, log, ts = sys.argv[1:11]
job = {
  "id": jid, "name": name, "source": src, "dest": dest, "mode": mode,
  "deleteExtra": dele == "true", "status": status, "log": log,
  "createdAt": ts, "completedAt": ts,
}
with open(jfile, "w") as f:
  json.dump(job, f, indent=2, ensure_ascii=False)
PYEOF
  rm -f "$jtmp"
}

`;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const del = p.deleteExtra ? 'true' : 'false';
    const label = `${p.source} -> ${p.dest}`.replace(/\n/g, ' ');
    script += `# Pair ${i + 1}\n`;
    script += `run_pair ${shEscape(p.source)} ${shEscape(p.dest)} ${shEscape(del)} ${shEscape(label)}\n\n`;
  }
  fs.writeFileSync(CRON_SCRIPT, script);
  fs.chmodSync(CRON_SCRIPT, '755');
}

function buildCronLine(schedule) {
  const valid = (schedule || []).filter(t => typeof t === 'string' && /^([01]\d|2[0-3]):(00|15|30|45)$/.test(t));
  if (!valid.length) return '';
  const sorted = [...valid].sort();
  const groups = {};
  sorted.forEach(t => {
    const [h, m] = t.split(':');
    const min = parseInt(m);
    if (!groups[min]) groups[min] = [];
    groups[min].push(parseInt(h));
  });
  return Object.entries(groups).map(([min, hours]) => {
    return `${min} ${hours.join(',')} * * * ${CRON_SCRIPT} >> ${SYNC_JOBS_DIR}/cron.log 2>&1`;
  }).join('\n');
}

app.post('/api/sync-settings', (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.pairs) || !Array.isArray(body.schedule)) {
      return res.status(400).json({ ok: false, error: 'リクエスト形式が不正です' });
    }
    for (const p of body.pairs) {
      if (!p || typeof p.source !== 'string' || typeof p.dest !== 'string' || !p.source || !p.dest) {
        return res.status(400).json({ ok: false, error: '同期ペアのコピー元・コピー先は必須です' });
      }
      if (p.source.length > 500 || p.dest.length > 500) {
        return res.status(400).json({ ok: false, error: 'パスが長すぎます' });
      }
      if (/[\r\n]/.test(p.source) || /[\r\n]/.test(p.dest)) {
        return res.status(400).json({ ok: false, error: 'パスに改行は使用できません' });
      }
      if (p.remoteName != null && (typeof p.remoteName !== 'string' || (p.remoteName && !isValidRemoteName(p.remoteName)))) {
        return res.status(400).json({ ok: false, error: 'リモート名が不正です' });
      }
    }
    for (const t of body.schedule) {
      if (typeof t !== 'string' || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(t)) {
        return res.status(400).json({ ok: false, error: `スケジュール時刻が不正です: ${t}` });
      }
    }
    const settings = {
      pairs: body.pairs.map(p => ({
        source: p.source,
        dest: p.dest,
        deleteExtra: !!p.deleteExtra,
        ...(p.remoteName ? { remoteName: p.remoteName } : {}),
      })),
      schedule: [...new Set(body.schedule)].sort(),
    };
    fs.writeFileSync(SYNC_SETTINGS_PATH, JSON.stringify(settings, null, 2));

    // Write sync script
    writeCronScript(settings.pairs || []);

    // Update cron - remove ALL old rclonegui entries
    let cronLines = [];
    try {
      const existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
      cronLines = existing.split('\n').filter(l => !l.includes('cron-sync.sh') && !l.includes(CRON_MARKER) && l.trim());
    } catch {}

    const cronLine = buildCronLine(settings.schedule || []);
    if (cronLine) {
      cronLines.push('');
      cronLines.push(CRON_MARKER);
      cronLines.push(cronLine);
    }

    const newCron = cronLines.join('\n') + '\n';
    const tmpFile = '/tmp/rclonegui_cron_tmp';
    fs.writeFileSync(tmpFile, newCron);
    execSync(`crontab ${tmpFile}`, { timeout: 5000 });
    fs.unlinkSync(tmpFile);

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/cron-info', (req, res) => {
  try {
    let output = '';

    // Check user crontab first (most relevant)
    output += '=== root の crontab ===\n';
    try {
      const userCron = execSync('crontab -l 2>/dev/null || echo "(crontabなし)"', { encoding: 'utf-8', timeout: 5000 });
      output += userCron;
    } catch { output += '(crontabなし)\n'; }

    // Check rclone related (from all sources)
    output += '\n=== rclone 関連の cron エントリ ===\n';
    try {
      const rcloneCron = execSync('crontab -l 2>/dev/null | grep -i rclone || echo "(rclone関連のcronエントリなし)"', { encoding: 'utf-8', timeout: 5000 });
      output += rcloneCron;
    } catch { output += '(rclone関連のcronエントリなし)\n'; }

    // Check scheduled sync settings
    output += '\n=== rcloneGUI スケジュール設定 ===\n';
    try {
      if (fs.existsSync(SYNC_SETTINGS_PATH)) {
        const settings = JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
        output += `同期ペア数: ${(settings.pairs || []).length}\n`;
        output += `スケジュール: ${(settings.schedule || []).join(', ') || '未設定'}\n`;
        (settings.pairs || []).forEach((p, i) => {
          output += `  [${i + 1}] ${p.source} → ${p.dest}${p.deleteExtra ? ' (削除あり)' : ''}\n`;
        });
      } else {
        output += '(設定ファイルなし)\n';
      }
    } catch { output += '(設定読み取りエラー)\n'; }

    // System crontab (brief)
    output += '\n=== システム crontab (抜粋) ===\n';
    try {
      const sysCron = execSync('cat /etc/crontab 2>/dev/null | grep -v "^#" | grep -v "^$" || echo "(ファイルなし)"', { encoding: 'utf-8', timeout: 5000 });
      output += sysCron;
    } catch { output += '(読み取り不可)\n'; }

    // Check systemd timers (rclone related)
    output += '\n=== systemd タイマー (rclone関連) ===\n';
    try {
      const timers = execSync('systemctl list-timers --all --no-pager 2>/dev/null | grep -i rclone || echo "(rclone関連のタイマーなし)"', { encoding: 'utf-8', timeout: 5000 });
      output += timers;
    } catch { output += '(rclone関連のタイマーなし)\n'; }

    res.json({ ok: true, output });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// === Temp SSH setup ===
app.post('/api/ssh/setup', (req, res) => {
  try {
    const password = 'rclone';
    execSync(`echo "root:${password}" | chpasswd`, { timeout: 5000 });
    execSync(`sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/60-cloudimg-settings.conf 2>/dev/null || sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config 2>/dev/null || true`, { timeout: 3000 });
    execSync(`grep -q "KbdInteractiveAuthentication yes" /etc/ssh/sshd_config.d/60-cloudimg-settings.conf 2>/dev/null || echo "KbdInteractiveAuthentication yes" >> /etc/ssh/sshd_config.d/60-cloudimg-settings.conf 2>/dev/null || true`, { timeout: 3000 });
    execSync(`grep -q "PermitRootLogin yes" /etc/ssh/sshd_config.d/60-cloudimg-settings.conf 2>/dev/null || echo "PermitRootLogin yes" >> /etc/ssh/sshd_config.d/60-cloudimg-settings.conf 2>/dev/null || true`, { timeout: 3000 });
    execSync(`systemctl restart sshd 2>/dev/null || systemctl restart ssh`, { timeout: 10000 });
    const hostname = execSync('hostname -I | awk \'{print $1}\'', { encoding: 'utf-8' }).trim();
    res.json({ ok: true, password, hostname });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/ssh/teardown', (req, res) => {
  try {
    execSync(`passwd -d root 2>/dev/null; true`, { timeout: 5000 });
    execSync(`[ -f /etc/ssh/sshd_config.d/60-cloudimg-settings.conf ] && sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/60-cloudimg-settings.conf; true`, { timeout: 3000 });
    execSync(`[ -f /etc/ssh/sshd_config.d/60-cloudimg-settings.conf ] && sed -i '/^KbdInteractiveAuthentication yes$/d' /etc/ssh/sshd_config.d/60-cloudimg-settings.conf; true`, { timeout: 3000 });
    execSync(`systemctl restart sshd 2>/dev/null || systemctl restart ssh`, { timeout: 10000 });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/ssh/status', (req, res) => {
  try {
    const out = execSync('sshd -T 2>/dev/null | grep passwordauthentication', { encoding: 'utf-8' });
    const enabled = out.includes('yes');
    res.json({ ok: true, enabled });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// === Auth: run rclone authorize to get token ===
const authSessions = new Map();

app.post('/api/auth/start', (req, res) => {
  const { type, remoteName } = req.body;
  if (!['drive', 'onedrive'].includes(type)) return res.status(400).json({ error: 'サポートされていないタイプです' });
  if (remoteName != null && remoteName !== '' && !isValidRemoteName(remoteName)) {
    return res.status(400).json({ error: 'リモート名が不正です' });
  }

  // Kill any lingering rclone authorize processes
  try { execSync('pkill -9 -f "rclone authorize"', { timeout: 3000 }); } catch {}

  const sessionId = `auth_${Date.now()}`;
  const args = ['authorize', type, '--auth-no-open-browser'];

  const proc = spawn('rclone', args, {
    env: { ...process.env, RCLONE_CONFIG: CONFIG_PATH },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let authUrl = '';
  let stdoutBuf = '';

  proc.stderr.on('data', d => {
    const text = d.toString();
    const match = text.match(/(https?:\/\/[^\s"']+\/auth\?state=[^\s"']+)/);
    if (match && !authUrl) {
      authUrl = match[1].replace(/["']$/, '');
    }
  });

  const session = { proc, type, remoteName, token: null, done: false, authUrl: '' };
  authSessions.set(sessionId, session);

  proc.stdout.on('data', d => {
    stdoutBuf += d.toString();
  });

  proc.on('close', (code) => {
    const raw = stdoutBuf.trim();
    console.log(`[Auth ${sessionId}] rclone closed code=${code} stdout=${raw.substring(0, 300)}`);
    // rclone authorize wraps JSON in "Paste the following..." text
    const jsonMatch = raw.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        session.token = JSON.parse(jsonMatch[1]);
        console.log(`[Auth ${sessionId}] token parsed OK`);
      } catch (e) {
        console.log(`[Auth ${sessionId}] token parse FAILED: ${e.message}`);
      }
    }
    session.done = true;
  });

  const check = setInterval(() => {
    if (authUrl && !session.authUrl) session.authUrl = authUrl;
    if (session.done && session.token && !session.success) {
      console.log(`[Auth ${sessionId}] writing token to config`);
      clearInterval(check);
      try {
        writeTokenToConfig(session.remoteName || `remote_${Date.now()}`, session.type, session.token);
        session.success = true;
      } catch (e) {
        console.log(`[Auth ${sessionId}] write failed: ${e.message}`);
        session.writeError = e.message;
      }
      // ポーリング側が成功を確実に取得できるよう、セッションはしばらく保持してから破棄する
      setTimeout(() => authSessions.delete(sessionId), 60000);
    } else if (session.done && !session.token) {
      console.log(`[Auth ${sessionId}] done but no token, stdout was: ${stdoutBuf.substring(0, 200)}`);
    }
  }, 500);

  setTimeout(() => {
    clearInterval(check);
    if (authSessions.has(sessionId)) {
      session.proc.kill();
      authSessions.delete(sessionId);
    }
  }, 300000);

  res.json({ ok: true, sessionId, authUrl: null });
});

app.get('/api/auth/poll/:sessionId', (req, res) => {
  const session = authSessions.get(req.params.sessionId);
  if (!session) return res.json({ done: true, success: false, error: 'セッションが見つかりません' });
  if (session.success) {
    return res.json({ done: true, success: true });
  }
  if (session.done && session.token) {
    return res.json({ done: true, success: true });
  }
  if (session.done && !session.token) {
    return res.json({ done: true, success: false, error: session.writeError || 'トークン取得に失敗しました' });
  }
  res.json({ done: false, authUrl: session.authUrl || null });
});

function fetchDriveId(accessToken) {
  return new Promise((resolve) => {
    try {
      const req = https.get('https://graph.microsoft.com/v1.0/me/drive', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      }, r => {
        if (r.statusCode !== 200) { r.resume(); return resolve(null); }
        let body = '';
        r.on('data', d => { body += d; });
        r.on('end', () => {
          try {
            const info = JSON.parse(body);
            resolve(typeof info.id === 'string' ? info.id : null);
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}

function writeTokenToConfig(remoteName, type, token) {
  // 同期関数であること: 呼び出し元の try/catch で書き込み失敗を検出するため。
  // drive_id 追記のみ非同期 fire-and-forget（fetchDriveId().then(...)）。
  const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
  let content = readConfig();

  const sectionRe = new RegExp(`\\[${remoteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\[]*`, 'g');
  if (sectionRe.test(content)) {
    content = content.replace(sectionRe, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  let section = `\n[${remoteName}]\ntype = ${type}`;
  if (type === 'drive') {
    section += `\nscope = drive`;
  } else if (type === 'onedrive') {
    section += `\ndrive_type = personal`;
    // drive_id は非同期で取得して追記する（トークンをシェルに渡さない）
    try {
      const tokenObj = typeof token === 'string' ? JSON.parse(token) : token;
      const accessToken = tokenObj && typeof tokenObj.access_token === 'string' ? tokenObj.access_token : null;
      if (accessToken && /^[A-Za-z0-9\-._~+/=]+$/.test(accessToken)) {
        fetchDriveId(accessToken).then(driveId => {
          if (!driveId || !/^[A-Za-z0-9!._-]+$/.test(driveId)) return;
          try {
            let cur = readConfig();
            const re = new RegExp(`(\\[${remoteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\[]*?)(\\ntoken = )`);
            if (re.test(cur) && !cur.includes(`drive_id = ${driveId}`)) {
              cur = cur.replace(re, `$1\ndrive_id = ${driveId}$2`);
              fs.writeFileSync(CONFIG_PATH, cur);
            }
          } catch (e) {
            console.log(`[Config] Failed to append drive_id for ${remoteName}: ${e.message}`);
          }
        });
      }
    } catch (e) {
      console.log(`[Config] Failed to get drive_id for ${remoteName}: ${e.message}`);
    }
  }
  section += `\ntoken = ${tokenStr}`;

  const sep = content.trim() ? '\n' : '';
  fs.writeFileSync(CONFIG_PATH, (content.trim() + sep + section + '\n').trim() + '\n');
}

// === File Browser ===
app.get('/api/browse/:remote/*', (req, res) => {
  const remote = req.params.remote;
  if (!isValidRemoteName(remote)) return res.status(400).json({ items: [], error: 'リモート名が不正です' });
  const subPath = req.params[0] || '';
  if (subPath.includes('\n') || subPath.includes('\0')) return res.status(400).json({ items: [], error: 'パスが不正です' });
  const target = subPath ? `${remote}:/${subPath}` : `${remote}:`;
  const result = rclone(['lsf', target, '--format', 'tp', '--dirs-only']);
  if (!result.ok && !result.data) return res.json({ items: [], error: result.error });

  const lines = (result.data || '').split('\n').filter(Boolean);
  const items = lines.map(l => {
    const isDir = l.endsWith('/');
    return { name: isDir ? l.slice(0, -1) : l, isDir };
  }).sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));

  res.json({ items, path: subPath });
});

app.get('/api/browse-files/:remote/*', (req, res) => {
  const remote = req.params.remote;
  if (!isValidRemoteName(remote)) return res.status(400).json({ items: [], error: 'リモート名が不正です' });
  const subPath = req.params[0] || '';
  if (subPath.includes('\n') || subPath.includes('\0')) return res.status(400).json({ items: [], error: 'パスが不正です' });
  const target = subPath ? `${remote}:/${subPath}` : `${remote}:`;
  const result = rclone(['lsf', target, '--format', 'tp']);
  if (!result.ok && !result.data) return res.json({ items: [], error: result.error });

  const lines = (result.data || '').split('\n').filter(Boolean);
  const items = lines.map(l => {
    const isDir = l.endsWith('/');
    return { name: isDir ? l.slice(0, -1) : l, isDir };
  }).sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));

  res.json({ items, path: subPath });
});

// === Sync Jobs ===
const JOB_RETENTION_DAYS = 30;
const runningJobs = new Map();

function cleanupOldJobs() {
  try {
    const files = fs.readdirSync(SYNC_JOBS_DIR).filter(f => f.endsWith('.json'));
    const cutoff = Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const f of files) {
      try {
        const job = JSON.parse(fs.readFileSync(path.join(SYNC_JOBS_DIR, f), 'utf-8'));
        const created = new Date(job.createdAt || 0).getTime();
        if (created < cutoff) fs.unlinkSync(path.join(SYNC_JOBS_DIR, f));
      } catch {}
    }
  } catch {}
}

app.get('/api/jobs', (req, res) => {
  try {
    cleanupOldJobs();
    const files = fs.readdirSync(SYNC_JOBS_DIR).filter(f => f.endsWith('.json'));
    const jobs = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SYNC_JOBS_DIR, f), 'utf-8')); }
      catch { return null; }
    }).filter(Boolean);
    jobs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ jobs });
  } catch (e) {
    res.json({ jobs: [] });
  }
});

app.post('/api/jobs', (req, res) => {
  const { source, dest, mode, exclude, dryRun, verbose, name, deleteExtra } = req.body;
  if (!source || !dest) return res.status(400).json({ error: 'コピー元とコピー先は必須です' });
  if (typeof source !== 'string' || typeof dest !== 'string') return res.status(400).json({ error: 'コピー元とコピー先は必須です' });
  if (source.length > 500 || dest.length > 500) return res.status(400).json({ error: 'パスが長すぎます' });
  if (/[\r\n\0]/.test(source) || /[\r\n\0]/.test(dest)) return res.status(400).json({ error: 'パスに改行は使用できません' });

  const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`;
  const job = {
    id: jobId,
    name: name || `${source.split(':')[0]} → ${dest.split(':')[0]}`,
    source, dest,
    mode: mode || 'copy',
    exclude: exclude || '',
    dryRun: !!dryRun,
    verbose: !!verbose,
    deleteExtra: !!deleteExtra,
    status: 'running',
    log: '',
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(SYNC_JOBS_DIR, `${jobId}.json`), JSON.stringify(job, null, 2));

  const args = [deleteExtra ? 'sync' : 'copy'];
  args.push('--stats', '2s', '--stats-one-line', '-v');
  if (dryRun) args.push('--dry-run');
  if (exclude) args.push('--exclude', exclude);
  args.push(source, dest);

  const jobFile = path.join(SYNC_JOBS_DIR, `${jobId}.json`);
  const proc = spawn('rclone', args, {
    env: { ...process.env, RCLONE_CONFIG: CONFIG_PATH },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  runningJobs.set(jobId, proc);
  proc.on('error', () => {});
  let logBuf = '';
  proc.stdout.on('data', d => { logBuf += d.toString(); });
  proc.stderr.on('data', d => { logBuf += d.toString(); });
  const saveLog = setInterval(() => {
    if (logBuf) {
      job.log = logBuf;
      try { fs.writeFileSync(jobFile, JSON.stringify(job, null, 2)); } catch {}
    }
  }, 500);
  proc.on('close', (code) => {
    clearInterval(saveLog);
    runningJobs.delete(jobId);
    // ユーザーが停止済みの場合は上書きしない
    try {
      const cur = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
      if (cur.status === 'stopped') return;
    } catch {}
    job.status = code === 0 ? 'completed' : 'failed';
    job.completedAt = new Date().toISOString();
    job.log = logBuf || '(no output)';
    job.exitCode = code;
    try { fs.writeFileSync(jobFile, JSON.stringify(job, null, 2)); } catch {}
  });

  res.json({ jobId, status: 'running' });
});

app.delete('/api/jobs/:id', (req, res) => {
  if (!isValidJobId(req.params.id)) return res.status(400).json({ error: 'ジョブIDが不正です' });
  const f = path.join(SYNC_JOBS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(f)) { fs.unlinkSync(f); res.json({ ok: true }); }
  else res.status(404).json({ error: 'ジョブが見つかりません' });
});

app.post('/api/jobs/:id/stop', (req, res) => {
  if (!isValidJobId(req.params.id)) return res.status(400).json({ error: 'ジョブIDが不正です' });
  const f = path.join(SYNC_JOBS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'ジョブが見つかりません' });
  let job;
  try {
    job = JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return res.status(500).json({ error: 'ジョブファイルの読み取りに失敗しました' });
  }
  const proc = runningJobs.get(req.params.id);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    runningJobs.delete(req.params.id);
    job.status = 'stopped';
  } else if (job.status === 'running') {
    job.status = 'stopped';
  } else {
    return res.json({ ok: true });
  }
  job.completedAt = new Date().toISOString();
  try { fs.writeFileSync(f, JSON.stringify(job, null, 2)); } catch {}
  res.json({ ok: true });
});

// === Size ===
app.get('/api/size/:remote/*', (req, res) => {
  if (!isValidRemoteName(req.params.remote)) return res.status(400).json({ error: 'リモート名が不正です' });
  const sub = req.params[0] || '';
  if (sub.includes('\n') || sub.includes('\0')) return res.status(400).json({ error: 'パスが不正です' });
  const target = sub ? `${req.params.remote}:/${sub}` : `${req.params.remote}:`;
  const result = rclone(['size', target, '--json']);
  if (result.ok) { try { return res.json(JSON.parse(result.data)); } catch {} }
  res.json({ error: result.error || 'サイズ取得に失敗' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`\n  🚀 rcloneGUI 起動`);
  console.log(`  📡 http://${HOST}:${PORT}\n`);
});
