// npm run test:audio: the microphone path. Generated practice is played through the Salamander piano samples (with a little
// room noise) into audio, transcribed back to notes by Basic Pitch, and the analysis must still read it right.
// Slower than npm test (a minute or two) and needs ffmpeg on PATH to decode the samples.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as G from './gen.mjs';
import { analyzeTake, TECH } from '../src/analyze.mjs';
import { fingerprint, likeness } from '../src/songs.mjs';
import { transcribe, SAMPLE_RATE } from '../src/transcribe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SR = SAMPLE_RATE;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`  FAIL ${m}`); } };

import { render } from './verify-audio-render.mjs';
const CAT = (k) => (TECH.has(k) ? 'technique' : k === 'lick' || k === 'fragment' ? 'noodling' : 'music');
const share = (notes) => { const o = {}; let tot = 0; for (const p of analyzeTake({ notes })) for (const s of p.segs) { const c = CAT(s.kind); o[c] = (o[c] || 0) + s.t1 - s.t0; tot += s.t1 - s.t0; } for (const k in o) o[k] /= tot; return o; };

console.log('heard through a microphone (Basic Pitch transcription of piano audio)');
const cases = [
  ['major scales through keys', G.playScales(['C', 'G', 'D', 'F', 'Bb']), 'technique'],
  ['maj7 arpeggios', G.playArps(['C', 'F', 'Bb']), 'technique'],
  ['a lick drilled in one key', G.playLickDrill({ seed: 15, reps: 8 }), 'noodling'],
  ['tune, swing', G.playTune('leaves', { bpm: 140, choruses: ['head', 'solo'] }), 'music'],
  ['tune, ballad', G.playTune('dflat', { feel: 'ballad', bpm: 68, choruses: ['head'] }), 'music'],
];
const heard = {};
for (const [name, take, want] of cases) {
  const t0 = Date.now();
  const notes = await transcribe(render(take.notes, take.end));
  heard[name] = notes;
  const s = share(notes), got = s[want] || 0;
  console.log(`  ${name.padEnd(28)} ${want.padEnd(10)} ${(got * 100).toFixed(0).padStart(3)}%   (${take.notes.length} notes played, ${notes.length} heard, ${((Date.now() - t0) / 1000).toFixed(1)} s for ${Math.round(take.end)} s of audio)`);
  ok(got >= 0.7, `${name}: ${(got * 100).toFixed(0)}% read as ${want} ${JSON.stringify(s)}`);
}
// keys still found
const runs = analyzeTake({ notes: heard['major scales through keys'] }).flatMap((p) => p.segs.flatMap((s) => (s.runs || []).map((r) => r.label)));
console.log(`  scales heard as: ${[...new Set(runs)].join(', ')}`);
ok(['C major scale', 'G major scale', 'F major scale'].every((x) => runs.includes(x)), 'scale keys lost through the microphone');
// a tune heard through the mic matches the same tune played on a MIDI keyboard
const mid = G.playTune('leaves', { bpm: 150, seed: 7 }), fpMidi = (() => { const p = analyzeTake(mid).sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0))[0]; return fingerprint(mid.notes.filter((n) => n.t >= p.t0 && n.t < p.t1), p.t0, p.t1); })();
const fpOf = (notes) => { const p = analyzeTake({ notes }).sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0))[0]; return fingerprint(notes.filter((n) => n.t >= p.t0 && n.t < p.t1), p.t0, p.t1); };
const same = likeness(fpOf(heard['tune, swing']), fpMidi), other = likeness(fpOf(heard['tune, ballad']), fpMidi);
console.log(`  same tune, mic vs keyboard: ${same}; a different tune: ${other}`);
ok(same > 0.075 && same > other * 2, 'a tune heard through the mic does not match its keyboard take');

// the listening session through the server, as the window drives it: 20 s pieces with 1 s in front, then Stop
{
  const os = await import('node:os');
  const { startServer } = await import('../src/server.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'micflow-'));
  const srv = await startServer({ mode: 'none', root, port: 0 });
  const B = 'http://127.0.0.1:' + srv.port;
  const post = (p, body, raw) => fetch(B + p, { method: 'POST', body: raw ? body : JSON.stringify(body || {}), headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } }).then((r) => r.json());
  const a = G.playScales(['C', 'G', 'D', 'F']), b = G.playTune('allofme', { bpm: 130, start: a.end + 1, choruses: ['head'] });
  const audio = render([...a.notes, ...b.notes], b.end), PIECE = 20;
  await post('/api/mic/start');
  for (let s0 = 0; s0 < audio.length / SR; s0 += PIECE) {
    const from = Math.max(0, s0 - 1), piece = audio.slice(Math.round(from * SR), Math.round((s0 + PIECE) * SR));
    await post('/api/mic/chunk?offset=' + s0 + '&preroll=' + (s0 - from), Buffer.from(piece.buffer), true);
  }
  await post('/api/mic/stop');
  const w = await fetch(B + '/api/week').then((r) => r.json());
  console.log('  listening session: ' + JSON.stringify(w.cats));
  ok(Math.abs((w.cats.technique || 0) - a.end) < 8, 'listening session: scales not counted as technique');
  ok((w.cats.unnamed || 0) > 40, 'listening session: the tune not found');
  ok(!fs.readdirSync(root, { recursive: true }).some((f) => /\.(wav|webm|ogg|mp3)$/.test(String(f))), 'audio was saved');
  srv.close(); fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n${fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`}`);
process.exit(fails ? 1 : 0);