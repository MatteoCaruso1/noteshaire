// MIDI files in and out. Piano Studio writes each take as a Standard MIDI File (1 tick = 1 ms).
import midiFile from 'midi-file';
const { parseMidi, writeMidi } = midiFile;

/** SMF bytes -> { notes: [{ t, dur, note, vel }], pedal: [{ t, down }], end } in seconds */
export function readSmf(buf) {
  const m = parseMidi(buf);
  const tpb = m.header.ticksPerBeat || 480;
  const all = [];
  for (const tr of m.tracks) { let tick = 0; for (const e of tr) { tick += e.deltaTime; all.push({ tick, e }); } }
  all.sort((a, b) => a.tick - b.tick);
  let usPerBeat = 500000, lastTick = 0, sec = 0;
  const open = new Map(), notes = [], pedal = [];
  const close = (k) => { const n = open.get(k); if (!n) return; open.delete(k); notes.push({ ...n, dur: Math.max(0, sec - n.t) }); };
  for (const { tick, e } of all) {
    sec += ((tick - lastTick) / tpb) * (usPerBeat / 1e6); lastTick = tick;
    if (e.type === 'setTempo') usPerBeat = e.microsecondsPerBeat;
    else if (e.type === 'noteOn' && e.velocity > 0) { const k = `${e.channel}:${e.noteNumber}`; if (open.has(k)) close(k); open.set(k, { t: sec, note: e.noteNumber, vel: e.velocity }); }
    else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) close(`${e.channel}:${e.noteNumber}`);
    else if (e.type === 'controller' && e.controllerType === 64) pedal.push({ t: sec, down: e.value >= 64 });
  }
  for (const k of [...open.keys()]) close(k);
  notes.sort((a, b) => a.t - b.t || a.note - b.note);
  return { notes, pedal, end: sec };
}

/** notes [{ t, dur, note, vel }] (seconds) -> SMF bytes at 1 tick = 1 ms, the format Piano Studio writes */
export function writeSmf(notes, pedal = []) {
  const ev = [];
  for (const n of notes) {
    ev.push({ ms: Math.max(0, Math.round(n.t * 1000)), e: { type: 'noteOn', channel: 0, noteNumber: n.note, velocity: n.vel || 64 } });
    ev.push({ ms: Math.max(1, Math.round((n.t + Math.max(0.02, n.dur)) * 1000)), e: { type: 'noteOff', channel: 0, noteNumber: n.note, velocity: 0 } });
  }
  for (const p of pedal) ev.push({ ms: Math.round(p.t * 1000), e: { type: 'controller', channel: 0, controllerType: 64, value: p.down ? 127 : 0 } });
  ev.sort((a, b) => a.ms - b.ms || (a.e.type === 'noteOff' ? -1 : 1));
  const track = [{ deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 1000000 }];
  let last = 0;
  for (const { ms, e } of ev) { track.push({ deltaTime: ms - last, ...e }); last = ms; }
  track.push({ deltaTime: 500, meta: true, type: 'endOfTrack' });
  return Buffer.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 1000 }, tracks: [track] }));
}
