#!/usr/bin/env node
// PRACTICE: the app. Starts with Windows (src/install.mjs), runs without a window, serves the dashboard on
// http://127.0.0.1:4320 (laptop only) and keeps Piano Studio's recorder running, because Piano Studio is the one program
// that holds the Nord's MIDI port (Windows lets one program open it at a time). Every take Piano Studio saves is read here.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStore, weekStart } from './store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, '..', 'ui');
const PORT = +(process.env.PRACTICE_PORT || 4320);
const STUDIO = { dir: process.env.PRACTICE_STUDIO_DIR || 'C:/dev/ad-machine', script: process.env.PRACTICE_STUDIO_SCRIPT || 'scripts/piano/piano-studio.mjs', port: +(process.env.PRACTICE_STUDIO_PORT || 4319) };
const store = openStore();
const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}\n`; process.stdout.write(line); try { fs.appendFileSync(path.join(store.DATA, 'practice.log'), line); } catch {} };

// ---- the recorder: Piano Studio, started hidden if it is not running ---------------------------------------------------
const rec = { state: 'checking', nord: '', recording: false, take_seconds: 0, misses: 0, started: 0 };
const studioKey = () => { try { return fs.readFileSync(path.join(store.root, '.key'), 'utf8').trim(); } catch { return ''; } };
function poll() {
  const req = http.get({ host: '127.0.0.1', port: STUDIO.port, path: `/api/state?k=${encodeURIComponent(studioKey())}`, timeout: 2500 }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => {
      try {
        const s = JSON.parse(b);
        Object.assign(rec, { state: 'on', nord: s.nord || '', recording: !!s.recording, take_seconds: s.take_seconds || 0, misses: 0, building: !!(s.job && !s.job.done) });
        if (rec.recording) rec.lastPlayed = Date.now();
        if (!rec.codeSeen) rec.codeSeen = studioCode();
      }
      catch { rec.state = 'on'; rec.misses = 0; }
    });
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', () => {
    rec.misses++; rec.nord = ''; rec.recording = false;
    if (rec.misses >= 2 && Date.now() - rec.started > 60e3) startStudio();
    else if (rec.state !== 'starting') rec.state = 'off';
  });
}
function startStudio() {
  const script = path.join(STUDIO.dir, STUDIO.script);
  if (!fs.existsSync(script)) { rec.state = 'missing'; return; }
  rec.state = 'starting'; rec.started = Date.now();
  const out = fs.openSync(path.join(store.DATA, 'recorder.log'), 'a');
  const p = spawn(process.execPath, [STUDIO.script], { cwd: STUDIO.dir, windowsHide: true, detached: true, stdio: ['ignore', out, out] });
  p.unref();
  log(`[recorder] Piano Studio was not running: started it (pid ${p.pid})`);
}
// Piano Studio's code is updated from GitHub by itself; a running recorder keeps the old code until it restarts. Restart it
// only when nothing can be lost: not recording, nothing played for 20 minutes, no video being built.
const STUDIO_FILES = ['scripts/piano/piano-studio.mjs', 'scripts/piano/piano-midi.mjs', 'scripts/piano/piano-build.mjs', 'config/piano.json'];
function studioCode() { return Math.max(...STUDIO_FILES.map((f) => { try { return fs.statSync(path.join(STUDIO.dir, f)).mtimeMs; } catch { return 0; } })); }
function refreshStudio() {
  if (rec.state !== 'on' || !rec.codeSeen || rec.recording || rec.building) return;
  if (Date.now() - (rec.lastPlayed || 0) < 20 * 60e3 || studioCode() <= rec.codeSeen) return;
  log('[recorder] Piano Studio was updated: restarting it');
  rec.codeSeen = 0;
  const kill = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'piano-studio\\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { windowsHide: true });
  kill.on('close', () => { rec.started = 0; rec.misses = 2; startStudio(); });
}
if (!process.env.PRACTICE_NO_RECORDER) setInterval(refreshStudio, 5 * 60e3);
if (!process.env.PRACTICE_NO_RECORDER) { setInterval(poll, 5000); poll(); } else rec.state = 'on';

// ---- keep the analysis warm so the page opens instantly -------------------------------------------------------------
let warm = { at: 0, takes: 0 };
function warmUp() {
  try { const n = store.takes().length; if (n !== warm.takes || Date.now() - warm.at > 10 * 60e3) { store.week(weekStart(Date.now())); warm = { at: Date.now(), takes: n }; } }
  catch (e) { log(`[analyse] ${e.stack || e.message}`); }
}
setInterval(warmUp, 30e3); setTimeout(warmUp, 2000);

// ---- web --------------------------------------------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const body = (req) => new Promise((ok, bad) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });
const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const server = http.createServer(async (req, res) => {
  if (!local(req)) return send(res, 403, 'laptop only', 'text/plain');
  const u = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && !u.pathname.startsWith('/api/')) {
      const f = path.join(UI, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^[/\\]+/, ''));
      if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
    }
    if (u.pathname === '/api/status') return send(res, 200, { recorder: rec.state, nord: rec.nord, recording: rec.recording, take_seconds: rec.take_seconds, takes: store.takes().length });
    if (u.pathname === '/api/week') {
      const w = u.searchParams.get('start');
      return send(res, 200, store.week(/^\d{4}-\d\d-\d\d$/.test(w || '') ? weekStart(new Date(`${w}T12:00:00`).getTime()) : weekStart(Date.now())));
    }
    if (u.pathname === '/api/trends') return send(res, 200, store.trends(12));
    if (u.pathname === '/api/notes') return send(res, 200, store.pieceNotes(u.searchParams.get('id') || '') || []);
    if (u.pathname === '/api/progress') return send(res, 200, store.progress(u.searchParams.get('label') || ''));
    if (req.method !== 'POST') return send(res, 404, { error: 'unknown' });
    const b = await body(req);
    if (u.pathname === '/api/name') { if (!b.piece || !String(b.name || '').trim()) return send(res, 400, { error: 'piece and name' }); return send(res, 200, store.nameSong(b.piece, b.name, b.status)); }
    if (u.pathname === '/api/cut') return send(res, 200, { ok: store.cut(String(b.take || ''), +b.t) });
    if (u.pathname === '/api/join') return send(res, 200, { ok: store.join(String(b.piece || '')) });
    if (u.pathname === '/api/kind') { store.setKind(b.piece, b.kind || null); return send(res, 200, { ok: true }); }
    if (u.pathname === '/api/song') return send(res, 200, store.updateSong(b.id, b) || { error: 'no such song' });
    if (u.pathname === '/api/goals') return send(res, 200, store.setGoals(b.week, b.goals || []));
    return send(res, 404, { error: 'unknown' });
  } catch (e) { log(`[web] ${u.pathname}: ${e.stack || e.message}`); return send(res, 500, { error: e.message }); }
});
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { log('[practice] already running'); process.exit(0); } throw e; });
server.listen(PORT, '127.0.0.1', () => log(`[practice] on http://127.0.0.1:${PORT}/ (data ${store.DATA})`));
process.on('uncaughtException', (e) => log(`[practice] ${e.stack || e.message}`));
