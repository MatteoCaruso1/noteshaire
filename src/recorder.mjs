// The built-in recorder (for everyone without Piano Studio): any USB MIDI keyboard, picked up by itself, every note kept.
// A take ends after 10 s with no key and no pedal down and is saved as <root>/midi/<date>/take-HHMMSS.mid (+ .json), the
// same files Piano Studio writes, so the analysis reads both the same way.
import fs from 'node:fs';
import path from 'node:path';
import midiFile from 'midi-file';
const { writeMidi } = midiFile;

const KEEP_CC = new Set([64, 66, 67]); // sustain, sostenuto, soft
const SKIP = /through|loopmidi|loopbe|virtual|iac driver|midi mapper|wavetable/i;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hms = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

/** raw MIDI bytes -> a midi-file event, or null for what is not kept */
export function rawToEvent(bytes) {
  const [st, d1 = 0, d2 = 0] = bytes || [];
  const kind = st & 0xf0, channel = st & 0x0f;
  if (kind === 0x90 && d2 > 0) return { type: 'noteOn', channel, noteNumber: d1, velocity: d2 };
  if (kind === 0x80 || (kind === 0x90 && d2 === 0)) return { type: 'noteOff', channel, noteNumber: d1, velocity: d2 };
  if (kind === 0xb0 && KEEP_CC.has(d1)) return { type: 'controller', channel, controllerType: d1, value: d2 };
  return null;
}

/** [{ ms, ev }] -> SMF bytes (1 tick = 1 ms), ending 3 s after the last event so the last chord rings */
export function eventsToSmf(items, tailMs = 3000) {
  const track = [{ deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 1000000 }];
  let last = 0;
  for (const { ms, ev } of [...items].sort((a, b) => a.ms - b.ms)) { const t = Math.max(last, Math.round(ms)); track.push({ deltaTime: t - last, ...ev }); last = t; }
  track.push({ deltaTime: tailMs, meta: true, type: 'endOfTrack' });
  return Buffer.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 1000 }, tracks: [track] }));
}

/** the take logic without any MIDI port, so it can be tested: feed(bytes, ms), tick(ms) */
export function takeKeeper({ root, splitAfterS = 10, minNotes = 8, onSaved = () => {}, log = () => {} }) {
  const k = { take: null, held: new Set(), pedal: false, last: 0, port: '' };
  k.feed = (bytes, t) => {
    const ev = rawToEvent(bytes); if (!ev) return;
    if (!k.take) {
      if (ev.type !== 'noteOn') { if (ev.type === 'controller' && ev.controllerType === 64) k.pedal = ev.value >= 64; return; }
      k.take = { start: t, items: [] };
      if (k.pedal) k.take.items.push({ ms: 0, ev: { type: 'controller', channel: ev.channel, controllerType: 64, value: 127 } });
    }
    k.take.items.push({ ms: t - k.take.start, ev });
    if (ev.type === 'noteOn') k.held.add(ev.noteNumber);
    if (ev.type === 'noteOff') k.held.delete(ev.noteNumber);
    if (ev.type === 'controller' && ev.controllerType === 64) k.pedal = ev.value >= 64;
    k.last = t;
  };
  k.tick = (t) => { if (k.take && !k.held.size && !k.pedal && t - k.last > splitAfterS * 1000) k.close('silence'); };
  k.close = (reason) => {
    const tk = k.take; k.take = null; k.held.clear();
    if (!tk) return null;
    const notes = tk.items.filter((x) => x.ev.type === 'noteOn').length;
    if (notes < minNotes) return null;
    const end = Math.max(...tk.items.map((x) => x.ms)) + 50;
    const dir = path.join(root, 'midi', dayOf(tk.start)); fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `take-${hms(tk.start)}`);
    fs.writeFileSync(`${base}.mid`, eventsToSmf([...tk.items, { ms: end, ev: { type: 'controller', channel: 0, controllerType: 64, value: 0 } }]));
    fs.writeFileSync(`${base}.json`, JSON.stringify({ start_ms: Math.round(tk.start), end_ms: Math.round(tk.start + end), notes, seconds: Math.round(end / 1000), port: k.port, closed: reason }));
    log(`[recorder] saved ${path.basename(base)}: ${notes} notes`);
    onSaved(base);
    return base;
  };
  return k;
}

/** the live recorder: watches for keyboards every second, opens every real MIDI input, keeps takes */
export async function startRecorder({ root, match = '', log = () => {}, onSaved }) {
  const state = { state: 'starting', nord: '', recording: false, take_seconds: 0, error: '' };
  let lib;
  try { lib = (await import('@julusian/midi')).default; } catch (e) { state.state = 'off'; state.error = `MIDI unavailable: ${e.message}`; return { state, stop: () => {} }; }
  const now = () => performance.timeOrigin + performance.now();
  const keeper = takeKeeper({ root, log, onSaved });
  const probe = new lib.Input();
  const open = new Map(); // port name -> Input
  const failed = new Map(); // port name -> time of the last failed open
  const re = match ? new RegExp(match, 'i') : null;
  function scan() {
    const names = Array.from({ length: probe.getPortCount() }, (_, i) => probe.getPortName(i));
    for (const [name, input] of open) if (!names.includes(name)) { keeper.close('unplugged'); try { input.closePort(); } catch {} open.delete(name); log(`[recorder] ${name} unplugged`); }
    names.forEach((name, i) => {
      if (open.has(name) || SKIP.test(name) || (re && !re.test(name))) return;
      if (Date.now() - (failed.get(name) || 0) < 15000) return;
      try {
        const input = new lib.Input();
        input.ignoreTypes(true, true, true);
        input.on('message', (_dt, bytes) => keeper.feed(bytes, now()));
        input.openPort(i);
        open.set(name, input); keeper.port = name; failed.delete(name);
        log(`[recorder] listening to ${name}`);
      } catch (e) { failed.set(name, Date.now()); state.error = `${name} is in use by another program`; log(`[recorder] could not open ${name}: ${e.message}`); }
    });
    const live = [...open.keys()];
    state.nord = live.join(', ');
    state.state = 'on';
    if (live.length) state.error = '';
    else if (!names.filter((n) => !SKIP.test(n)).length) state.error = '';
  }
  const timer = setInterval(() => {
    try { keeper.tick(now()); scan(); state.recording = !!keeper.take; state.take_seconds = keeper.take ? Math.round((now() - keeper.take.start) / 1000) : 0; }
    catch (e) { state.error = e.message; }
  }, 1000);
  scan();
  return { state, stop: () => { clearInterval(timer); keeper.close('app closed'); for (const i of open.values()) try { i.closePort(); } catch {} } };
}
