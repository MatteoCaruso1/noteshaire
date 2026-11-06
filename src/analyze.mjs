// What was played: one take's notes -> pieces (playing between pauses) -> stretches of one kind of practice.
// Pure functions, no I/O. Every threshold is in OPT so a test or the config can tune it.
//
// Kinds of stretch:
//   scale     even, fast, stepwise runs (one hand or both in octaves)
//   arpeggio  even runs of thirds and fourths through one chord
//   pattern   an exercise figure moved up or down (Hanon-like) or the same figure taken to other keys
//   lick      a short phrase repeated at the same pitch, often with stops: learning new material
//   fragment  stop-start playing in short bursts (working something out, playing along with a video)
//   music     chords and lines: a song or free playing (named later by the song matcher)

export const VERSION = 5;

export const OPT = {
  piece_gap_s: 4,       // no key struck for this long starts a new piece
  win_s: 12,            // stretch analysis window and hop
  hop_s: 6,
  cluster_s: 0.04,      // notes this close together count as one event (a chord or both hands)
  min_piece_s: 3,       // shorter pieces are dropped (a stray key)
  min_piece_notes: 6,
};

export const MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MINOR = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pc = (n) => ((n % 12) + 12) % 12;

/** notes -> events: notes struck together (a chord, both hands) */
export function clusters(notes, win = OPT.cluster_s) {
  const out = [];
  for (const n of notes) {
    const c = out[out.length - 1];
    if (c && n.t - c.t <= win) { c.notes.push(n); c.top = Math.max(c.top, n.note); c.low = Math.min(c.low, n.note); }
    else out.push({ t: n.t, notes: [n], top: n.note, low: n.note });
  }
  return out;
}

/** a take -> pieces: a new piece starts after piece_gap_s with no key struck */
export function splitPieces(notes, o = OPT) {
  if (!notes.length) return [];
  const groups = [[notes[0]]];
  for (const n of notes.slice(1)) {
    const g = groups[groups.length - 1];
    const lastEnd = g[g.length - 1].t;
    if (n.t - lastEnd >= o.piece_gap_s) groups.push([n]); else g.push(n);
  }
  return groups
    .map((g) => ({ t0: g[0].t, t1: Math.max(...g.map((n) => n.t + Math.min(n.dur, 3))), notes: g }))
    .filter((p) => p.t1 - p.t0 >= o.min_piece_s && p.notes.length >= o.min_piece_notes);
}

/** pitch-class weights (duration capped at 1 s, by velocity) */
export function chroma(notes) {
  const h = new Array(12).fill(0);
  for (const n of notes) h[pc(n.note)] += Math.min(1, Math.max(0.08, n.dur)) * (n.vel || 64) / 64;
  return h;
}

function corr(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Krumhansl-Kessler key with a nudge toward the key whose tonic is the final bass note (songs end at home) */
export function detectKey(notes) {
  if (notes.length < 8) return null;
  const h = chroma(notes);
  // the last chord: its bass is the tonic of most tunes, and its third says major or minor
  const lastT = notes[notes.length - 1].t;
  const tail = notes.filter((n) => n.t >= lastT - 2 || (n.t >= lastT - 6 && n.t + n.dur >= lastT - 0.5)); // struck or still held at the end
  const endBass = tail.length ? pc(Math.min(...tail.map((n) => n.note))) : -1;
  const tailPcs = new Set(tail.map((n) => pc(n.note)));
  const endMode = tailPcs.has((endBass + 3) % 12) && !tailPcs.has((endBass + 4) % 12) ? 'minor' : 'major';
  let best = null;
  for (let r = 0; r < 12; r++) {
    for (const [mode, prof] of [['major', KK_MAJ], ['minor', KK_MIN]]) {
      const rot = prof.map((_, i) => prof[(i - r + 12) % 12]);
      const s = corr(h, rot) + (r === endBass ? (mode === endMode ? 0.3 : 0.1) : 0);
      if (!best || s > best.score) best = { root: r, mode, score: s };
    }
  }
  best.name = best.mode === 'major' ? MAJOR[best.root] : MINOR[best.root];
  return best;
}

const SCALES = [
  { name: 'major', set: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'harmonic minor', set: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'melodic minor', set: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'blues', set: [0, 3, 5, 6, 7, 10] },
  { name: 'pentatonic', set: [0, 2, 4, 7, 9] },
];
const MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
const CHORDS = [
  { name: 'maj7', set: [0, 4, 7, 11] }, { name: 'm7', set: [0, 3, 7, 10] }, { name: '7', set: [0, 4, 7, 10] },
  { name: 'm7b5', set: [0, 3, 6, 10] }, { name: 'dim7', set: [0, 3, 6, 9] }, { name: '', set: [0, 4, 7] }, { name: 'm', set: [0, 3, 7] },
];

/** best template fit: share of the weight inside the set, minus a little for each template note never played */
function fitSet(h, templates) {
  const tot = h.reduce((s, x) => s + x, 0) || 1;
  let best = null;
  for (const tp of templates) for (let r = 0; r < 12; r++) {
    const pcs = tp.set.map((x) => (x + r) % 12);
    const inside = pcs.reduce((s, p) => s + h[p], 0) / tot;
    const missing = pcs.filter((p) => h[p] < tot * 0.02).length;
    const score = inside - missing * 0.06 - (tp.set.length < 7 && templates === SCALES ? 0.04 : 0);
    if (!best || score > best.score) best = { tp, r, inside, score };
  }
  return best;
}

/** the scale a run of notes belongs to, named from where the runs turn at the bottom */
export function nameScale(notes, line) {
  const h = chroma(notes);
  const used = h.filter((x) => x > 0).length;
  if (used >= 11) {
    const steps1 = line.slice(1).filter((p, i) => Math.abs(p - line[i]) === 1).length / Math.max(1, line.length - 1);
    if (steps1 > 0.7) return { root: pc(line[0]), name: 'chromatic', label: 'Chromatic' };
  }
  const fit = fitSet(h, SCALES);
  const turns = [line[0]];
  for (let i = 1; i < line.length - 1; i++) if (line[i] < line[i - 1] && line[i] <= line[i + 1]) turns.push(line[i]);
  const votes = new Array(12).fill(0);
  turns.forEach((p) => { votes[pc(p)] += 1; });
  votes[pc(Math.min(...line))] += 0.5;
  const setPcs = fit.tp.set.map((x) => (x + fit.r) % 12);
  let root = setPcs.reduce((b, p) => (votes[p] > votes[b] ? p : b), setPcs[0]);
  if (!votes[root]) root = fit.r;
  let name = fit.tp.name;
  if (fit.tp.name === 'major') { const deg = fit.tp.set.indexOf((root - fit.r + 12) % 12); name = MODES[deg] || 'major'; }
  else if (root !== fit.r) root = fit.r;
  const keyName = name === 'minor' || name === 'harmonic minor' || name === 'melodic minor' || name === 'dorian' ? MINOR[root].replace('m', '') : MAJOR[root];
  return { root, name, label: `${keyName} ${name}`, fit: +fit.inside.toFixed(2) };
}

export function nameChord(notes) {
  const fit = fitSet(chroma(notes), CHORDS);
  return { root: fit.r, name: fit.tp.name, label: `${MAJOR[fit.r]}${fit.tp.name}`, fit: +fit.inside.toFixed(2) };
}

/** features of a stretch of notes */
export function features(notes, t0, t1) {
  const ev = clusters(notes);
  const dur = Math.max(0.5, t1 - t0);
  const chordFrac = ev.filter((c) => c.notes.length >= 3).length / Math.max(1, ev.length);
  const line = ev.map((c) => c.top);
  const d = line.slice(1).map((p, i) => p - line[i]);
  const steps = d.filter((x) => Math.abs(x) >= 1 && Math.abs(x) <= 2).length / Math.max(1, d.length);
  const leaps = d.filter((x) => Math.abs(x) >= 3 && Math.abs(x) <= 9).length / Math.max(1, d.length);
  const repeats = d.filter((x) => x === 0).length / Math.max(1, d.length);
  // monotonic runs (same direction, no repeated note)
  const runs = []; let run = 1, dir = 0;
  for (const x of d) { const s = Math.sign(x); if (s && s === dir) run++; else { if (run > 1) runs.push(run); run = s ? 2 : 1; dir = s; } }
  if (run > 1) runs.push(run);
  const meanRun = mean(runs);
  const ioi = ev.slice(1).map((c, i) => c.t - ev[i].t).filter((x) => x < 0.7);
  const cv = ioi.length > 4 ? sd(ioi) / mean(ioi) : 1;
  // a pause is a second with nothing sounding (a held ballad chord is not a pause)
  let sounding = -1, pauses = 0;
  for (const n of notes) { if (sounding >= 0 && n.t - sounding > 1.0) pauses++; sounding = Math.max(sounding, n.t + Math.min(n.dur, 4)); }
  // period of exact repetition in the top line: same pitches (a lick) or same intervals elsewhere (a figure moved)
  const rep = repetition(line, d);
  const hands = handBalance(ev);
  return {
    notes: notes.length, events: ev.length, rate: +(ev.length / dur).toFixed(2), chordFrac: +chordFrac.toFixed(2),
    steps: +steps.toFixed(2), leaps: +leaps.toFixed(2), repeats: +repeats.toFixed(2), meanRun: +meanRun.toFixed(2),
    cv: +cv.toFixed(2), pausesPerMin: +(pauses / (dur / 60)).toFixed(1), ...rep, ...hands, line,
  };
}

/** is the top line made of one figure played again and again? */
function repetition(line, d) {
  let bestSame = { p: 0, r: 0 }, bestShift = { p: 0, r: 0 };
  const n = line.length;
  if (n < 12) return { samePeriod: 0, sameRep: 0, shiftPeriod: 0, shiftRep: 0 };
  for (let p = 3; p <= Math.min(32, Math.floor(n / 2)); p++) {
    let same = 0, shift = 0, tot = 0;
    for (let k = 0; k + p < n - 1; k++) {
      tot++;
      if (line[k] === line[k + p]) same++;
      else if (d[k] === d[k + p] && line[k + p] - line[k] !== 0) shift++;
    }
    const rs = same / tot, rsh = (same + shift) / tot;
    if (rs > bestSame.r + 0.02) bestSame = { p, r: rs };
    if (rsh > bestShift.r + 0.02 && shift / tot > 0.25) bestShift = { p, r: rsh };
  }
  return { samePeriod: bestSame.p, sameRep: +bestSame.r.toFixed(2), shiftPeriod: bestShift.p, shiftRep: +bestShift.r.toFixed(2) };
}

/** left hand: bass notes alternating with mid-range chords is stride; one bass note a beat is walking */
function handBalance(ev) {
  const lh = ev.map((c) => ({ t: c.t, ns: c.notes.filter((n) => n.note < 60).map((n) => n.note) })).filter((c) => c.ns.length);
  if (lh.length < 8) return { stride: 0, walking: 0, lhRate: 0 };
  const kind = lh.map((c) => { const lo = Math.min(...c.ns); if (lo <= 47 && c.ns.length <= 2) return 'b'; if (lo >= 46 && c.ns.length >= 2) return 'c'; return '-'; });
  let alt = 0;
  // bass and chord on different beats (a rolled chord or a bass note under a chord is not stride)
  for (let i = 1; i < kind.length; i++) if (lh[i].t - lh[i - 1].t >= 0.15 && ((kind[i] === 'b' && kind[i - 1] === 'c') || (kind[i] === 'c' && kind[i - 1] === 'b'))) alt++;
  const singles = lh.filter((c) => c.ns.length === 1 && c.ns[0] < 57);
  const sd1 = singles.slice(1).map((c, i) => Math.abs(c.ns[0] - singles[i].ns[0]));
  const span = lh[lh.length - 1].t - lh[0].t || 1;
  return {
    stride: +(alt / (kind.length - 1)).toFixed(2),
    walking: +((singles.length / lh.length) * (sd1.filter((x) => x >= 1 && x <= 5).length / Math.max(1, sd1.length))).toFixed(2),
    lhRate: +(lh.length / span).toFixed(2),
  };
}

/** one window's features -> the kind of practice it sounds like */
export function classify(f) {
  if (f.events < 6) return 'fragment';
  const even = f.cv <= 0.38;
  const linear = f.chordFrac <= 0.18;
  if (linear && even && f.rate >= 3 && f.steps >= 0.75 && f.meanRun >= 4.5) return 'scale';
  if (linear && even && f.rate >= 3 && f.leaps >= 0.55 && f.meanRun >= 3) return 'arpeggio';
  if (linear && f.rate >= 3 && f.cv <= 0.45 && f.shiftRep >= 0.6 && f.shiftPeriod >= 3) return 'pattern';
  if (f.sameRep >= 0.55 && f.samePeriod >= 3 && f.samePeriod <= 24) return 'lick';
  if (f.pausesPerMin >= 5 && f.rate < 3) return 'fragment';
  return 'music';
}

/** beats per minute from the onset pattern; strength 0..1 says how steady the time is */
export function tempo(notes) {
  if (notes.length < 16) return { bpm: 0, steady: 0 };
  const t0 = notes[0].t, t1 = notes[notes.length - 1].t, bins = Math.ceil((t1 - t0) / 0.01) + 1;
  const env = new Float32Array(bins);
  for (const n of notes) env[Math.round((n.t - t0) / 0.01)] += (n.vel || 64) / 64;
  // smooth a little so a few ms of looseness still lines up
  const sm = new Float32Array(bins);
  for (let i = 0; i < bins; i++) for (let k = -2; k <= 2; k++) if (env[i + k]) sm[i] += env[i + k] * (1 - Math.abs(k) * 0.3);
  const m = mean(Array.from(sm));
  for (let i = 0; i < bins; i++) sm[i] -= m;
  let zero = 0; for (let i = 0; i < bins; i++) zero += sm[i] * sm[i];
  const ac = new Float32Array(151);
  for (let lag = 12; lag <= 150; lag++) { let s = 0; for (let i = 0; i + lag < bins; i++) s += sm[i] * sm[i + lag]; ac[lag] = s / zero; }
  let best = { lag: 0, s: -Infinity, raw: 0 };
  for (let lag = 25; lag <= 150; lag++) { // 0.25 s .. 1.5 s = 240 .. 40 bpm
    const raw = ac[lag];
    const prior = Math.exp(-((Math.log2(lag / 55)) ** 2) / (2 * 0.9 ** 2)); // a gentle lean toward ~110 bpm
    if (raw * prior > best.s) best = { lag, s: raw * prior, raw };
  }
  // half-time trap: when the beat at half the lag is nearly as strong, the music is twice as fast (swing at 150 reads as 75)
  let lag = best.lag;
  const half = Math.round(lag / 2);
  if (half >= 25 && Math.max(ac[half - 1], ac[half], ac[half + 1]) >= 0.6 * best.raw) lag = half;
  return { bpm: Math.round(6000 / lag), steady: +Math.max(0, best.raw).toFixed(2) };
}

/** a music piece -> its feel: Ballad / Medium / Up-tempo, plus stride or walking left hand */
export function style(notes, f, tp) {
  const tags = [];
  const loose = tp.steady < 0.12;
  if ((tp.bpm && tp.bpm < 84 && f.rate < 5) || (loose && f.rate < 4)) tags.push('Ballad');
  else if (tp.bpm >= 180 || f.rate >= 8) tags.push('Up-tempo');
  else tags.push('Medium');
  if (f.stride >= 0.45 && f.lhRate >= 1.2) tags.push('Stride');
  else if (f.walking >= 0.45) tags.push('Walking bass');
  return tags;
}

/** a pitch histogram of where on the keyboard the hands were (88 keys, A0 = 21) */
export function keyboardUse(notes) {
  const h = new Array(88).fill(0);
  for (const n of notes) if (n.note >= 21 && n.note <= 108) h[n.note - 21] += 1;
  return h;
}

export const TECH = new Set(['scale', 'arpeggio', 'pattern']);

/** a technique stretch -> runs in one key [{ t0, t1, kind, key, label, bpm, even }] (gaps of 0.8 s split runs) */
export function techniqueRuns(ns, kind) {
  const groups = [];
  for (const n of ns) {
    const g = groups[groups.length - 1];
    if (g && n.t - g.end < 0.8) { g.notes.push(n); g.end = Math.max(g.end, n.t + Math.min(n.dur, 0.5)); }
    else groups.push({ notes: [n], end: n.t + Math.min(n.dur, 0.5) });
  }
  const runs = [];
  for (const g of groups) {
    if (g.notes.length < 6) continue;
    const ev = clusters(g.notes), line = ev.map((c) => c.top);
    let k;
    if (kind === 'arpeggio') { const ch = nameChord(g.notes); k = { root: ch.root, label: `${ch.label} arpeggio` }; }
    else if (kind === 'pattern') {
      const parts = patternKeys(ev);
      if (parts.length > 1) { for (const pt of parts) pushRun(runs, { t0: +pt.t0.toFixed(2), t1: +pt.t1.toFixed(2), kind, key: pt.key, label: `${MAJOR[pt.key]} pattern`, nps: 0, even: 0 }, ev); continue; }
      k = { root: parts.length ? parts[0].key : pc(line[0]), label: `${MAJOR[parts.length ? parts[0].key : pc(line[0])]} pattern` };
    }
    else { const sc = nameScale(g.notes, line); k = { root: sc.root, label: `${sc.label} scale` }; }
    const ioi = ev.slice(1).map((c, i) => c.t - ev[i].t).filter((x) => x < 0.7);
    const per = mean(ioi) || 1;
    const run = { t0: +g.notes[0].t.toFixed(2), t1: +g.end.toFixed(2), kind, key: k.root, label: k.label,
      nps: +(1 / per).toFixed(2), even: +(1 - Math.min(1, sd(ioi) / per)).toFixed(2) };
    pushRun(runs, run);
  }
  return runs;
}

/** add a run, joining it to the last one when it is the same drill in the same key. With `ev`, speed and evenness are measured here. */
function pushRun(runs, run, ev) {
  if (ev) {
    const e = ev.filter((c) => c.t >= run.t0 && c.t <= run.t1), ioi = e.slice(1).map((c, i) => c.t - e[i].t).filter((x) => x < 0.7), per = mean(ioi) || 1;
    run.nps = +(1 / per).toFixed(2); run.even = +(1 - Math.min(1, sd(ioi) / per)).toFixed(2);
  }
  const last = runs[runs.length - 1];
  if (last && last.label === run.label && run.t0 - last.t1 < 4) { last.t1 = run.t1; last.nps = +((last.nps + run.nps) / 2).toFixed(2); last.even = +((last.even + run.even) / 2).toFixed(2); }
  else runs.push(run);
}

/** a figure played again and again, moved each time: through the keys (each repeat in its own key) or up a scale (one key, Hanon) */
function patternKeys(ev) {
  const line = ev.map((c) => c.top), d = line.slice(1).map((p, i) => p - line[i]);
  const { shiftPeriod: per } = repetition(line, d);
  if (!per || line.length < per * 2) return [{ t0: ev[0].t, t1: ev[ev.length - 1].t, key: pc(line[0]) }];
  const starts = [];
  for (let i = 0; i + per <= line.length; i += per) starts.push(i);
  const shifts = starts.slice(1).map((s, i) => line[s] - line[starts[i]]).filter((x) => x !== 0);
  const steps = shifts.filter((x) => Math.abs(x) <= 2);
  const diatonic = steps.length >= shifts.length * 0.7 && new Set(steps.map(Math.abs)).size === 2;
  if (diatonic || !shifts.length) {
    const sc = nameScale(ev.flatMap((c) => c.notes), line);
    return [{ t0: ev[0].t, t1: ev[ev.length - 1].t, key: sc.root }];
  }
  return starts.map((s, i) => ({ t0: ev[s].t, t1: ev[Math.min(line.length, (starts[i + 1] ?? line.length)) - 1].t + 0.2, key: pc(line[s]) }));
}

/** one take -> pieces with their stretches, key, tempo and feel. `fp` is the song fingerprint (songs.mjs). */
export function analyzeTake({ notes }, o = OPT) {
  const pieces = splitPieces(notes, o);
  return pieces.map((p) => {
    const segs = [];
    const span = p.t1 - p.t0;
    const starts = span <= o.win_s ? [p.t0] : [];
    for (let s = p.t0; s + o.win_s <= p.t1 + o.hop_s / 2; s += o.hop_s) starts.push(s);
    const wins = starts.map((s) => {
      const e = Math.min(p.t1, s + o.win_s);
      const ns = p.notes.filter((n) => n.t >= s && n.t < e);
      const f = features(ns, s, e);
      return { t0: s, t1: e, kind: ns.length ? classify(f) : 'fragment', f, ns };
    });
    // a lick drilled with stops, or a figure taken through the keys, shows over half a minute, not 12 s
    for (const w of wins) {
      if (!['music', 'fragment', 'lick'].includes(w.kind)) continue;
      const a = w.t0 - 9, b = w.t1 + 9, ctx = features(p.notes.filter((n) => n.t >= a && n.t < b), a, b);
      if (ctx.chordFrac <= 0.18 && ctx.shiftRep >= 0.8 && ctx.cv <= 0.35 && ctx.rate >= 2) w.kind = 'pattern';
      else if (w.kind !== 'lick' && ctx.sameRep >= 0.55 && ctx.samePeriod >= 3 && ctx.samePeriod <= 24) w.kind = 'lick';
    }
    // smooth: a lone window between two of another kind takes their kind
    for (let i = 1; i < wins.length - 1; i++) if (wins[i - 1].kind === wins[i + 1].kind && wins[i].kind !== wins[i - 1].kind) wins[i].kind = wins[i - 1].kind;
    // a piece that is mostly music is one song or one improvisation: fast runs inside it are fills, not scales
    const musicShare = wins.filter((w) => w.kind === 'music').length / wins.length;
    // (three or more windows in a row of drilling, about 24 s, stay: warm-up scales played straight into a tune)
    if (musicShare >= 0.6 && span >= 40) {
      for (let i = 0; i < wins.length;) {
        let j = i; while (j < wins.length && wins[j].kind === wins[i].kind) j++;
        if (wins[i].kind !== 'music' && !(TECH.has(wins[i].kind) && j - i >= 3)) for (let k = i; k < j; k++) wins[k].kind = 'music';
        i = j;
      }
    }
    // merge neighbours of the same kind into stretches (each window owns the time from its start to the next one's)
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i], a = i === 0 ? p.t0 : w.t0 + (o.win_s - o.hop_s) / 2, b = i === wins.length - 1 ? p.t1 : wins[i + 1].t0 + (o.win_s - o.hop_s) / 2;
      const last = segs[segs.length - 1];
      if (last && last.kind === w.kind) last.t1 = b; else segs.push({ t0: a, t1: b, kind: w.kind });
    }
    for (const s of segs) {
      const ns = p.notes.filter((n) => n.t >= s.t0 && n.t < s.t1);
      s.notes = ns.length;
      s.keys88 = keyboardUse(ns);
      if (TECH.has(s.kind)) {
        // one key at a time: a breath between keys splits the stretch into runs, each named on its own
        s.runs = techniqueRuns(ns, s.kind);
        s.keys = [...new Set(s.runs.map((r) => r.key))];
        s.label = [...new Set(s.runs.map((r) => r.label))].join(', ');
      } else { const k = detectKey(ns); if (k) { s.key = k.root; s.keyName = k.name; } }
      s.t0 = +s.t0.toFixed(2); s.t1 = +s.t1.toFixed(2);
    }
    const f = features(p.notes, p.t0, p.t1);
    const tp = tempo(p.notes);
    const key = detectKey(p.notes);
    const isMusic = segs.every((s) => s.kind === 'music');
    delete f.line;
    return {
      t0: +p.t0.toFixed(2), t1: +p.t1.toFixed(2), notes: p.notes.length,
      key: key ? key.name : null, keyRoot: key ? key.root : null, keyMode: key ? key.mode : null,
      bpm: tp.bpm, steady: tp.steady, style: isMusic ? style(p.notes, f, tp) : [],
      vel: Math.round(mean(p.notes.map((n) => n.vel))), segs, f, keys88: keyboardUse(p.notes),
    };
  });
}
