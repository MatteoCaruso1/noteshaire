#!/usr/bin/env node
// NOTESHAIRE: the local server behind the window. Two recorder modes:
//   builtin       (everyone): src/recorder.mjs listens to any USB MIDI keyboard itself.
//   piano-studio  (Matteo's laptop): Piano Studio (ad-machine) holds the Nord's port, since Windows lets one program open
//                 it; this keeps Piano Studio running and reads the takes it saves.
// Started by the desktop app (electron/main.mjs) or directly (`node src/server.mjs`, port 4320).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStore, weekStart, DEFAULT_GOALS, OWNER_GOALS } from './store.mjs';
import { startRecorder } from './recorder.mjs';
import { micSessions } from './mic.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, '..', 'ui');
const STUDIO = { dir: process.env.PRACTICE_STUDIO_DIR || 'C:/dev/ad-machine', script: process.env.PRACTICE_STUDIO_SCRIPT || 'scripts/piano/piano-studio.mjs', port: +(process.env.PRACTICE_STUDIO_PORT || 4319) };
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'));

/** which recorder this computer uses: Piano Studio where it is installed, the built-in one everywhere else */
export function detectMode() {
  if (process.env.PRACTICE_NO_RECORDER) return 'none';
  if (process.env.NOTESHAIRE_RECORDER) return process.env.NOTESHAIRE_RECORDER;
  return fs.existsSync(path.join(STUDIO.dir, STUDIO.script)) ? 'piano-studio' : 'builtin';
}
export function defaultRoot(mode) {
  if (process.env.PRACTICE_ROOT) return process.env.PRACTICE_ROOT;
  if (mode === 'piano-studio') { try { return JSON.parse(fs.readFileSync(path.join(STUDIO.dir, 'config/piano.json'), 'utf8')).root; } catch {} }
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support'), 'NoteshAIre');
}

export async function startServer({ mode = detectMode(), root = defaultRoot(mode), port = 4320, onError } = {}) {
  const store = openStore({ root, data: process.env.PRACTICE_DATA, defaultGoals: mode === 'piano-studio' ? OWNER_GOALS : DEFAULT_GOALS });
  const settingsFile = path.join(store.DATA, 'settings.json');
  const settings = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; } };
  const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}\n`; process.stdout.write(line); try { fs.appendFileSync(path.join(store.DATA, 'practice.log'), line); } catch {} };
  const timers = [];
  const mic = micSessions({ root, log: (...a) => log(...a) });
  let rec = { state: 'on', nord: '', recording: false, take_seconds: 0, error: '' }, builtin = null;

  if (mode === 'builtin') { builtin = await startRecorder({ root, log }); rec = builtin.state; }
  if (mode === 'piano-studio') {
    // ---- Piano Studio, started hidden if it is not running ----
    Object.assign(rec, { state: 'checking', misses: 0, started: 0 });
    const studioKey = () => { try { return fs.readFileSync(path.join(store.root, '.key'), 'utf8').trim(); } catch { return ''; } };
    const studioCode = () => Math.max(...['scripts/piano/piano-studio.mjs', 'scripts/piano/piano-midi.mjs', 'scripts/piano/piano-build.mjs', 'config/piano.json'].map((f) => { try { return fs.statSync(path.join(STUDIO.dir, f)).mtimeMs; } catch { return 0; } }));
    const startStudio = () => {
      const script = path.join(STUDIO.dir, STUDIO.script);
      if (!fs.existsSync(script)) { rec.state = 'missing'; return; }
      rec.state = 'starting'; rec.started = Date.now();
      const out = fs.openSync(path.join(store.DATA, 'recorder.log'), 'a');
      // inside the desktop app: the laptop's own node if it has one, else the app itself running as node
      const sysNode = 'C:/Program Files/nodejs/node.exe', inApp = !!process.versions.electron, node = inApp && fs.existsSync(sysNode) ? sysNode : process.execPath;
      const p = spawn(node, [STUDIO.script], { cwd: STUDIO.dir, windowsHide: true, detached: true, stdio: ['ignore', out, out], env: inApp && node === process.execPath ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env });
      p.unref();
      log(`[recorder] Piano Studio was not running: started it (pid ${p.pid})`);
    };
    const poll = () => {
      const req = http.get({ host: '127.0.0.1', port: STUDIO.port, path: `/api/state?k=${encodeURIComponent(studioKey())}`, timeout: 2500 }, (res) => {
        let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => {
          try {
            const s = JSON.parse(b);
            Object.assign(rec, { state: 'on', nord: s.nord || '', recording: !!s.recording, take_seconds: s.take_seconds || 0, misses: 0, building: !!(s.job && !s.job.done) });
            if (rec.recording) rec.lastPlayed = Date.now();
            if (!rec.codeSeen) rec.codeSeen = studioCode();
          } catch { rec.state = 'on'; rec.misses = 0; }
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', () => {
        rec.misses++; rec.nord = ''; rec.recording = false;
        if (rec.misses >= 2 && Date.now() - rec.started > 60e3) startStudio();
        else if (rec.state !== 'starting') rec.state = 'off';
      });
    };
    // Piano Studio's code updates itself from GitHub; restart it only when nothing can be lost (not recording, 20 min quiet, no build)
    const refresh = () => {
      if (rec.state !== 'on' || !rec.codeSeen || rec.recording || rec.building) return;
      if (Date.now() - (rec.lastPlayed || 0) < 20 * 60e3 || studioCode() <= rec.codeSeen) return;
      log('[recorder] Piano Studio was updated: restarting it');
      rec.codeSeen = 0;
      const kill = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'piano-studio\\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { windowsHide: true });
      kill.on('close', () => { rec.started = 0; rec.misses = 2; startStudio(); });
    };
    timers.push(setInterval(refresh, 5 * 60e3), setInterval(poll, 5000)); poll();
  }

  // ---- keep the analysis warm so the page opens instantly ----
  let warm = { at: 0, takes: 0 };
  const warmUp = () => {
    try { const n = store.takes().length; if (n !== warm.takes || Date.now() - warm.at > 10 * 60e3) { store.week(weekStart(Date.now())); warm = { at: Date.now(), takes: n }; } }
    catch (e) { log(`[analyse] ${e.stack || e.message}`); }
  };
  timers.push(setInterval(warmUp, 30e3)); setTimeout(warmUp, 2000);
  const prune = () => { if (settings().keepRecordings === false) { const n = store.prune(7); if (n) log(`[recordings] deleted ${n} older than 7 days (keep recordings is off)`); } };
  timers.push(setInterval(prune, 6 * 3600e3)); setTimeout(prune, 60e3);
  timers.push(setInterval(() => { if (rec.recording) rec.lastPlayed = Date.now(); }, 5000));

  // ---- web ----
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
  const send = (res, code, b, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); };
  const body = (req) => new Promise((ok, bad) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });
  const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

  const server = http.createServer(async (req, res) => {
    if (!local(req)) return send(res, 403, 'this computer only', 'text/plain');
    // Websites open in a browser can also reach 127.0.0.1. Only answer requests addressed to this
    // server by name (blocks DNS rebinding), and only accept writes from the app itself as JSON
    // (a cross-site form or text/plain POST can't set that without a preflight we never allow).
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) return send(res, 403, 'bad host', 'text/plain');
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`) return send(res, 403, 'bad origin', 'text/plain');
      // sound pieces from the listening session come as raw audio: also a type a cross-site page cannot send without a preflight
      const ct = String(req.headers['content-type'] || ''), raw = req.url.startsWith('/api/mic/chunk') && ct.startsWith('application/octet-stream');
      if (!ct.startsWith('application/json') && !raw) return send(res, 415, 'json only', 'text/plain');
    }
    const u = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && !u.pathname.startsWith('/api/')) {
        const f = path.join(UI, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^[/\\]+/, ''));
        if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'not found', 'text/plain');
        return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
      }
      if (u.pathname === '/api/info') { const st = settings(); return send(res, 200, { mode, version: PKG.version, tutorialSeen: !!st.tutorialSeen, guideDone: !!st.guideDone, goalsSet: fs.existsSync(path.join(store.DATA, 'goals.json')), keepRecordings: st.keepRecordings !== false, instrument: st.instrument || 'piano', background: st.background !== false, app: !!process.versions.electron }); }
      if (u.pathname === '/api/status') return send(res, 200, { recorder: rec.state, nord: rec.nord, recording: rec.recording, take_seconds: rec.take_seconds, error: rec.error || '', takes: store.takes().length });
      if (u.pathname === '/api/week') {
        const w = u.searchParams.get('start');
        return send(res, 200, store.week(/^\d{4}-\d\d-\d\d$/.test(w || '') ? weekStart(new Date(`${w}T12:00:00`).getTime()) : weekStart(Date.now())));
      }
      if (u.pathname === '/api/trends') return send(res, 200, store.trends(12));
      if (u.pathname === '/api/notes') return send(res, 200, store.pieceNotes(u.searchParams.get('id') || '') || []);
      if (u.pathname === '/api/progress') return send(res, 200, store.progress(u.searchParams.get('label') || ''));
      if (u.pathname === '/api/mic') return send(res, 200, mic.state());
      if (req.method !== 'POST') return send(res, 404, { error: 'unknown' });
      if (u.pathname === '/api/mic/chunk') {
        const chunks = []; let len = 0;
        for await (const c of req) { chunks.push(c); len += c.length; if (len > 12e6) return send(res, 413, { error: 'too big' }); }
        const buf = Buffer.concat(chunks);
        const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
        return send(res, 200, await mic.chunk(f32, +u.searchParams.get('offset') || 0, +u.searchParams.get('preroll') || 0));
      }
      const b = await body(req);
      if (u.pathname === '/api/mic/start') return send(res, 200, mic.start());
      if (u.pathname === '/api/mic/stop') return send(res, 200, await mic.stop());
      if (u.pathname === '/api/seen') { fs.writeFileSync(settingsFile, JSON.stringify({ ...settings(), tutorialSeen: true })); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/settings') {
        const next = { ...settings() };
        if (typeof b.keepRecordings === 'boolean') next.keepRecordings = b.keepRecordings;
        if (typeof b.guideDone === 'boolean') next.guideDone = b.guideDone;
      if (['piano', 'guitar', 'voice', 'wind', 'other'].includes(b.instrument)) next.instrument = b.instrument;
      if (typeof b.background === 'boolean') next.background = b.background;
        fs.writeFileSync(settingsFile, JSON.stringify(next));
        if (next.keepRecordings === false) prune();
        return send(res, 200, { ok: true });
      }
      if (u.pathname === '/api/session') return send(res, 200, store.setSession(b.items || []) || { cleared: true });
      if (u.pathname === '/api/name') { if (!b.piece || !String(b.name || '').trim()) return send(res, 400, { error: 'piece and name' }); return send(res, 200, store.nameSong(b.piece, b.name, b.status)); }
      if (u.pathname === '/api/cut') return send(res, 200, { ok: store.cut(String(b.take || ''), +b.t) });
      if (u.pathname === '/api/join') return send(res, 200, { ok: store.join(String(b.piece || '')) });
      if (u.pathname === '/api/key') { store.setKey(String(b.piece || ''), b.root == null ? null : +b.root, b.mode); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/kind') { store.setKind(b.piece, b.kind || null); return send(res, 200, { ok: true }); }
      if (u.pathname === '/api/song') return send(res, 200, store.updateSong(b.id, b) || { error: 'no such song' });
      if (u.pathname === '/api/goals') return send(res, 200, store.setGoals(b.week, b.goals || []));
      return send(res, 404, { error: 'unknown' });
    } catch (e) { log(`[web] ${u.pathname}: ${e.stack || e.message}`); return send(res, 500, { error: e.message }); }
  });
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(port, '127.0.0.1', ok); });
  const actual = server.address().port;
  log(`[noteshaire] ${PKG.version} on http://127.0.0.1:${actual}/ (${mode}, data ${store.DATA})`);
  return { port: actual, mode, store, status: () => rec, close: () => { timers.forEach(clearInterval); if (builtin) builtin.stop(); mic.stop(); server.close(); } };
}

// run directly: the old way (Matteo's laptop before the desktop app), port 4320
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on('uncaughtException', (e) => console.error(`[noteshaire] ${e.stack || e.message}`));
  startServer({ port: +(process.env.PRACTICE_PORT || 4320) }).catch((e) => {
    if (e.code === 'EADDRINUSE') { console.log('[noteshaire] already running'); process.exit(0); }
    throw e;
  });
}
