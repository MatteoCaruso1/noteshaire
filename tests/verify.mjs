// npm test: the analyser, the song matcher and the weekly totals against practice with known answers.
// Generated practice (tests/gen.mjs) for every kind of drill and feel, and his real 2026-11-05 Beatles session when it is
// on this laptop. Writes only to a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from './gen.mjs';
import { analyzeTake, TECH } from '../src/analyze.mjs';
import { readSmf, writeSmf } from '../src/midi.mjs';
import { fingerprint, identify, likeness } from '../src/songs.mjs';
import { openStore } from '../src/store.mjs';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log(`  FAIL ${msg}`); } };
const section = (s) => console.log(`\n${s}`);
const CAT = (k) => (TECH.has(k) ? 'technique' : k === 'lick' || k === 'fragment' ? 'learning' : 'music');
/** seconds of each category in an analysed take */
function share(take) {
  const out = {}; let tot = 0;
  for (const p of analyzeTake(take)) for (const s of p.segs) { const c = CAT(s.kind); out[c] = (out[c] || 0) + s.t1 - s.t0; tot += s.t1 - s.t0; }
  for (const k in out) out[k] /= tot;
  return out;
}

section('1. what kind of practice (share of the time labelled right)');
const cases = [
  ['major scales, hands together', G.playScales(['C', 'G', 'D', 'Db', 'Ab', 'F#'.replace('F#', 'Gb')]), 'technique'],
  ['scales, right hand', G.playScales(['F', 'Bb', 'Eb'], { hands: 1, seed: 11 }), 'technique'],
  ['harmonic minor scales', G.playScales(['A', 'D'], { set: [0, 2, 3, 5, 7, 8, 11, 12], seed: 12 }), 'technique'],
  ['maj7 arpeggios', G.playArps(['C', 'F', 'Bb', 'Eb']), 'technique'],
  ['m7 arpeggios', G.playArps(['D', 'G', 'C'], { qual: 'm7', seed: 13 }), 'technique'],
  ['Hanon figure', G.playHanon(), 'technique'],
  ['a lick through the keys', G.playLickDrill({ transpose: true, seed: 14 }), 'technique'],
  ['a lick drilled in one key', G.playLickDrill({ seed: 15 }), 'learning'],
  ['a lick, faster, fewer stops', G.playLickDrill({ seed: 16, bpm0: 100, bpm1: 150, reps: 10 }), 'learning'],
  ['stop-start (with a video)', G.playFragments({ seconds: 120 }), 'learning'],
  ['tune, swing', G.playTune('leaves', { bpm: 150 }), 'music'],
  ['tune, ballad', G.playTune('leaves', { feel: 'ballad', bpm: 64, seed: 2 }), 'music'],
  ['tune, stride', G.playTune('leaves', { feel: 'stride', bpm: 168, seed: 3 }), 'music'],
  ['tune, up-tempo', G.playTune('allofme', { bpm: 210, seed: 4 }), 'music'],
  ['tune in Db, ballad', G.playTune('dflat', { feel: 'ballad', bpm: 70 }), 'music'],
];
let right = 0, all = 0;
for (const [name, take, want] of cases) {
  const s = share(take), got = s[want] || 0;
  right += got * take.end; all += take.end;
  console.log(`  ${name.padEnd(30)} ${want.padEnd(10)} ${(got * 100).toFixed(0).padStart(3)}%`);
  ok(got >= 0.8, `${name}: only ${(got * 100).toFixed(0)}% read as ${want} (${JSON.stringify(s)})`);
}
{ // warm-up scales played straight into a tune, no pause: the scales stay technique
  const sc = G.playScales(['C', 'G', 'D', 'A', 'E', 'B']), tn = G.playTune('allofme', { bpm: 130, start: sc.end - 1 });
  const s2 = share({ notes: [...sc.notes, ...tn.notes].sort((x, y) => x.t - y.t) });
  console.log(`  scales straight into a tune     technique ${(s2.technique * 100).toFixed(0)}% (want ~${Math.round(sc.end / tn.end * 100)}%)`);
  ok(Math.abs(s2.technique - sc.end / tn.end) < 0.08, 'scales played straight into a tune were swallowed by the tune');
}
console.log(`  overall ${(right / all * 100).toFixed(1)}% of the time labelled right`);
ok(right / all >= 0.9, 'overall below 90%');

section('2. which key, which drill');
const keysOf = (take) => analyzeTake(take).flatMap((p) => p.segs.flatMap((s) => (s.runs || []).map((r) => r.label)));
{
  const l = keysOf(G.playScales(['C', 'G', 'D', 'Db', 'Ab']));
  ok(['C major scale', 'G major scale', 'D major scale', 'Db major scale', 'Ab major scale'].every((x) => l.includes(x)), `scales named ${l}`);
  const a = keysOf(G.playArps(['C', 'F', 'Bb', 'Eb']));
  ok(['Cmaj7 arpeggio', 'Fmaj7 arpeggio', 'Bbmaj7 arpeggio', 'Ebmaj7 arpeggio'].every((x) => a.includes(x)), `arpeggios named ${a}`);
  const h = keysOf(G.playScales(['A'], { set: [0, 2, 3, 5, 7, 8, 11, 12], seed: 12 }));
  ok(h.includes('A harmonic minor scale'), `harmonic minor named ${h}`);
  const lk = analyzeTake(G.playLickDrill({ transpose: true, seed: 14 })).flatMap((p) => p.segs.flatMap((s) => s.keys || []));
  ok(new Set(lk).size >= 8, `lick through the keys found ${new Set(lk).size} keys`);
}
const tuneKey = (take) => { const ps = analyzeTake(take).sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0)); return ps[0].key; };
for (const [n, take, want] of [['leaves swing', G.playTune('leaves', { bpm: 150 }), 'Gm'], ['leaves ballad', G.playTune('leaves', { feel: 'ballad', bpm: 64, seed: 2 }), 'Gm'],
  ['all of me', G.playTune('allofme', { bpm: 130 }), 'C'], ['Db tune', G.playTune('dflat', { feel: 'ballad', bpm: 70 }), 'Db']]) {
  const k = tuneKey(take); console.log(`  ${n.padEnd(14)} key ${k}`); ok(k === want, `${n}: key ${k}, want ${want}`);
}

section('3. feel');
const feel = (take) => analyzeTake(take).sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0))[0].style;
for (const [n, take, want, not] of [['stride', G.playTune('leaves', { feel: 'stride', bpm: 168, seed: 3 }), 'Stride', 'Ballad'], ['ballad', G.playTune('leaves', { feel: 'ballad', bpm: 64, seed: 2 }), 'Ballad', 'Stride'],
  ['swing', G.playTune('leaves', { bpm: 150 }), 'Medium', 'Ballad'], ['up-tempo', G.playTune('allofme', { bpm: 210, seed: 4 }), 'Up-tempo', 'Ballad']]) {
  const s = feel(take); console.log(`  ${n.padEnd(10)} ${s.join(', ')}`);
  ok(s.includes(want) && !s.includes(not), `${n}: ${s}`);
}

section('4. which song');
const fpOf = (take) => { const p = analyzeTake(take).sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0))[0]; const ns = take.notes.filter((n) => n.t >= p.t0 && n.t < p.t1); return fingerprint(ns, p.t0, p.t1); };
{
  const lib = [
    { id: 'leaves', refs: [{ fp: fpOf(G.playTune('leaves', { feel: 'ballad', bpm: 64, seed: 2 })) }] },
    { id: 'allofme', refs: [{ fp: fpOf(G.playTune('allofme', { bpm: 130, seed: 5 })) }] },
    { id: 'bossa', refs: [{ fp: fpOf(G.playTune('bossa', { bpm: 140, seed: 6 })) }] },
  ];
  const tries = [
    ['leaves, swing', G.playTune('leaves', { bpm: 150, seed: 21 }), 'leaves'],
    ['leaves, stride (2.6x the tempo)', G.playTune('leaves', { feel: 'stride', bpm: 168, seed: 22 }), 'leaves'],
    ['leaves, head only', G.playTune('leaves', { bpm: 140, seed: 23, choruses: ['head'] }), 'leaves'],
    ['all of me, ballad', G.playTune('allofme', { feel: 'ballad', bpm: 72, seed: 24 }), 'allofme'],
    ['bossa, again', G.playTune('bossa', { bpm: 150, seed: 25, choruses: ['head', 'solo'] }), 'bossa'],
    ['Db tune (not in the library)', G.playTune('dflat', { bpm: 120, seed: 26 }), null],
  ];
  for (const [n, take, want] of tries) {
    const r = identify(fpOf(take), lib);
    const got = r && !r.unsure ? r.song : null;
    console.log(`  ${n.padEnd(32)} -> ${got || '(new song)'}${r ? ` ${r.score}` : ''}`);
    ok(got === want, `${n}: got ${got}, want ${want}`);
  }
}
const REAL = 'C:/Users/matte/Videos/Piano Studio/midi/2026-11-05';
if (fs.existsSync(REAL)) {
  // his session: the broken-off tries must match the song they were tries of, and nothing else
  const truth = { '143438@13': 'Yesterday', '143438@232': 'Blackbird', '143438@345': 'Blackbird', '143438@375': 'Blackbird', '144436@0': 'Let it Be', '144436@31': 'Let it Be' };
  const ps = [];
  for (const f of fs.readdirSync(REAL).filter((x) => x.endsWith('.mid'))) {
    const m = readSmf(fs.readFileSync(path.join(REAL, f)));
    for (const p of analyzeTake(m)) { const id = `${f.slice(5, 11)}@${Math.round(p.t0)}`; if (truth[id]) ps.push({ id, song: truth[id], key: p.key, kinds: p.segs.map((s) => s.kind), fp: fingerprint(m.notes.filter((n) => n.t >= p.t0 && n.t < p.t1), p.t0, p.t1) }); }
  }
  let worstTrue = 9, bestFalse = 0;
  for (const a of ps) for (const b of ps) if (a !== b) { const v = likeness(a.fp, b.fp); if (a.song === b.song) worstTrue = Math.min(worstTrue, v); else bestFalse = Math.max(bestFalse, v); }
  console.log(`  his Beatles session: weakest right match ${worstTrue.toFixed(3)}, strongest wrong ${bestFalse.toFixed(3)}`);
  ok(worstTrue > bestFalse * 2, 'real session: right and wrong matches too close');
  ok(ps.every((p) => p.kinds.every((k) => k === 'music')), 'real session: a song piece read as a drill');
  const keyOf = (s) => ps.filter((p) => p.song === s).sort((a, b) => b.fp.length - a.fp.length)[0].key;
  ok(keyOf('Blackbird') === 'G' && keyOf('Let it Be') === 'C' && keyOf('Yesterday') === 'F', `real session keys ${keyOf('Blackbird')} ${keyOf('Let it Be')} ${keyOf('Yesterday')}`);
}

section('5. the week: goals fill from what was played, corrections, Piano Studio sets');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'practice-verify-'));
  const save = (day, hhmmss, take) => {
    const dir = path.join(root, 'midi', day); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `take-${hhmmss}.mid`), writeSmf(take.notes));
    fs.writeFileSync(path.join(dir, `take-${hhmmss}.json`), JSON.stringify({ start_ms: new Date(`${day}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:00`).getTime() }));
  };
  const scales = G.playScales(['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'], { seed: 31 });
  save('2026-11-03', '190000', scales);
  save('2026-11-03', '191000', G.playLickDrill({ seed: 32 }));
  save('2026-11-04', '200000', G.playTune('leaves', { bpm: 150, seed: 33 }));
  save('2026-11-05', '200000', G.playTune('leaves', { feel: 'stride', bpm: 168, seed: 34 }));
  save('2026-11-05', '201000', G.playTune('allofme', { bpm: 130, seed: 35 }));
  // the All of Me take was filmed and named in Piano Studio
  fs.mkdirSync(path.join(root, 'sets', 's1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sets', 's1', 'set.json'), JSON.stringify({ title: 'Test set', segments: [{ take: '2026-11-05/take-201000', t0: 0, t1: 170, name: 'All of Me', include: true }] }));
  const st = openStore({ root, data: path.join(root, 'practice') });
  let w = st.week('2026-11-02');
  const goal = (id) => w.goals.find((g) => g.id === id).seconds;
  console.log(`  technique ${Math.round(goal('technique'))} s (scales ${Math.round(scales.end)} s), new material ${Math.round(goal('new-material'))} s, Red Grand Jazz ${Math.round(goal('red-grand-jazz'))} s`);
  ok(Math.abs(goal('technique') - scales.end) < 15, 'technique time off');
  ok(goal('new-material') > 40, 'lick drill not counted as new material');
  ok(goal('red-grand-jazz') > 150, 'filmed take not counted for Red Grand Jazz');
  ok(w.songs.some((s) => s.name === 'All of Me' && s.status === 'known'), 'song named in Piano Studio not imported');
  ok(w.inbox.length === 2, `inbox should hold the two Leaves takes, has ${w.inbox.length}`);
  ok(goal('new-standards') === 0, 'new standards counted before anything was named new');
  // he names one Leaves take as a new standard: the other is recognised by itself
  st.nameSong(w.inbox[0].id, 'Autumn Leaves', 'new');
  w = st.week('2026-11-02');
  console.log(`  after naming one take: new standards ${Math.round(goal('new-standards'))} s, inbox ${w.inbox.length}`);
  ok(w.inbox.length === 0, 'the second Leaves take was not recognised');
  ok(goal('new-standards') > 250, 'new standards bar did not fill from both takes');
  // a correction moves time, never adds it
  const before = w.total, lickPiece = w.pieces.find((p) => p.segs.some((s) => s.cat === 'learning'));
  st.setKind(lickPiece.id, 'technique');
  w = st.week('2026-11-02');
  ok(Math.abs(w.total - before) < 0.5 && goal('new-material') < 5, 'a correction changed the total or left the time in place');
  // goals for the week
  st.setGoals('2026-11-02', [{ name: 'Db tunes', minutes: 30, counts: 'key:1' }]);
  ok(st.week('2026-11-02').goals.length === 1 && st.goalsFor('2026-11-09')[0].name === 'Db tunes', 'goals not saved or not carried to the next week');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n${fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`}`);
process.exit(fails ? 1 : 0);
