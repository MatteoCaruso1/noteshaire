// A demo week of practice (generated takes + his real 2026-11-05 session) for looking at the dashboard.
import fs from 'node:fs';
import path from 'node:path';
import * as G from './gen.mjs';
import { writeSmf } from '../src/midi.mjs';
const root = process.argv[2];
fs.rmSync(root, { recursive: true, force: true });
const save = (day, hhmmss, take) => {
  const dir = path.join(root, 'midi', day); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `take-${hhmmss}.mid`), writeSmf(take.notes));
  const start = new Date(`${day}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4)}`).getTime();
  fs.writeFileSync(path.join(dir, `take-${hhmmss}.json`), JSON.stringify({ start_ms: start, seconds: Math.round(take.end) }));
};
const join = (...parts) => { let t = 0; const notes = []; for (const p of parts) { const q = p(t); notes.push(...q.notes); t = q.end + 6; } return { notes, end: t }; };
save('2026-11-02', '190500', join((s) => G.playScales(['C', 'G', 'D', 'A', 'E'], { start: s }), (s) => G.playArps(['C', 'F', 'Bb'], { start: s }), (s) => G.playTune('allofme', { bpm: 132, start: s })));
save('2026-11-03', '201000', join((s) => G.playLickDrill({ start: s }), (s) => G.playLickDrill({ start: s, transpose: true, seed: 9 }), (s) => G.playTune('leaves', { feel: 'ballad', bpm: 64, seed: 4, start: s })));
save('2026-11-04', '081500', join((s) => G.playHanon({ start: s }), (s) => G.playScales(['Db', 'Ab', 'Eb', 'Bb', 'F'], { start: s, seed: 8 }), (s) => G.playTune('dflat', { feel: 'ballad', bpm: 72, start: s })));
save('2026-11-04', '210000', join((s) => G.playTune('leaves', { feel: 'stride', bpm: 168, seed: 7, start: s }), (s) => G.playFragments({ seconds: 120, start: s })));
// his real session
const real = 'C:/Users/matte/Videos/Piano Studio';
fs.cpSync(path.join(real, 'midi', '2026-11-05'), path.join(root, 'midi', '2026-11-05'), { recursive: true, filter: (f) => !f.endsWith('.wav') });
fs.mkdirSync(path.join(root, 'sets', '2026-11-05-new-set'), { recursive: true });
fs.copyFileSync(path.join(real, 'sets', '2026-11-05-new-set', 'set.json'), path.join(root, 'sets', '2026-11-05-new-set', 'set.json'));
console.log('demo at', root);
