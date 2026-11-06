// Listening sessions through the microphone (acoustic piano, voice, guitar, horns). Only between Start and Stop, which
// the person presses; the window shows "Listening" the whole time. The window sends the sound in 20 s pieces (with 1 s
// of the piece before, so a note on the seam is heard whole); each piece becomes notes in a worker thread and is thrown
// away. The notes are written as a take like any keyboard take (rewritten after every piece, so nothing is lost if the
// app closes), and the analysis reads it the same way. No audio is ever saved.
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { writeSmf } from './midi.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)).replace('app.asar', 'app.asar.unpacked');
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hms = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

export function micSessions({ root, log = () => {} }) {
  let worker = null, nextId = 1;
  const waiting = new Map();
  const getWorker = () => {
    if (worker) return worker;
    worker = new Worker(path.join(HERE, 'transcribe-worker.mjs'));
    worker.on('message', (m) => { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); m.error ? w.bad(new Error(m.error)) : w.ok(m.notes); } });
    worker.on('error', (e) => { log(`[mic] transcriber stopped: ${e.message}`); for (const w of waiting.values()) w.bad(e); waiting.clear(); worker = null; });
    return worker;
  };
  const run = (audio, offset, keepFrom) => new Promise((ok, bad) => { const id = nextId++; waiting.set(id, { ok, bad }); getWorker().postMessage({ id, audio, offset, keepFrom }, [audio]); });

  let s = null; // the session: { started, notes, heardAt, queue, pending, base }
  const save = () => {
    if (!s || !s.notes.length) return;
    const end = Math.max(...s.notes.map((n) => n.t + n.dur));
    fs.mkdirSync(path.dirname(s.base), { recursive: true });
    fs.writeFileSync(`${s.base}.mid`, writeSmf(s.notes));
    fs.writeFileSync(`${s.base}.json`, JSON.stringify({ start_ms: s.started, end_ms: Math.round(s.started + end * 1000), notes: s.notes.length, seconds: Math.round(end), port: 'microphone', source: 'mic' }));
  };
  return {
    start() {
      if (s) return this.state();
      const started = Date.now();
      s = { started, notes: [], heardAt: started, queue: Promise.resolve(), pending: 0, base: path.join(root, 'midi', dayOf(started), `take-${hms(started)}`) };
      log('[mic] listening started');
      return this.state();
    },
    /** one piece of sound: Float32 mono 22,050 Hz; `offset` = seconds into the session where it starts, `preroll` = the
     *  seconds at its start that repeat the end of the previous piece */
    chunk(buf, offset, preroll = 0) {
      if (!s) return Promise.resolve({ stopped: true });
      const sess = s, audio = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      sess.pending++;
      const p = sess.queue = sess.queue.then(async () => {
        const notes = await run(audio, offset - preroll, offset);
        sess.notes.push(...notes);
        if (notes.length >= 3) sess.heardAt = Date.now();
        if (sess === s) save(); else saveOld(sess);
        return { heard: notes.length };
      }).catch((e) => { log(`[mic] ${e.message}`); return { heard: 0 }; }).finally(() => { sess.pending--; });
      return p;
    },
    async stop() {
      if (!s) return { stopped: true };
      const sess = s; s = null;
      await sess.queue;
      saveOld(sess);
      log(`[mic] listening stopped: ${sess.notes.length} notes`);
      return { stopped: true, notes: sess.notes.length };
    },
    state() { return s ? { active: true, started: s.started, heardAt: s.heardAt, pending: s.pending, notes: s.notes.length } : { active: false }; },
  };
  function saveOld(sess) { const keep = s; s = sess; save(); s = keep; }
}
