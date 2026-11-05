// Practice that sounds like a person at the keyboard, with the right answer attached, for tests/verify.mjs.
// Human timing (+-15 ms, softer and louder notes, a little rubato), both hands, pauses between keys.
// Songs are tunes on standard-style changes (chords only; melodies are made up here): each has a fixed head melody,
// and a version plays head - improvised chorus - head in one feel (swing, ballad, stride).

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const ROOTS = { C: 0, Db: 1, 'C#': 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const QUAL = { maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], m7: [0, 3, 7, 10], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9] };
export function chord(sym) {
  const m = sym.match(/^([A-G][b#]?)(.*)$/);
  return { root: ROOTS[m[1]], iv: QUAL[m[2]] || QUAL.maj7 };
}

// chord changes, one or two chords a bar (written as standard-style progressions)
export const TUNES = {
  // minor ii-V-heavy tune in G minor (Autumn-Leaves-like changes)
  leaves: { key: 'Gm', bars: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm6', 'Gm6', 'Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm6', 'Gm6', 'Am7b5', 'D7', 'Gm6', 'Gm6', 'Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm7 C7', 'Fm7 Bb7', 'Am7b5', 'D7', 'Gm6', 'Gm6'] },
  // major tune in C (All-of-Me-like changes)
  allofme: { key: 'C', bars: ['C6', 'C6', 'E7', 'E7', 'A7', 'A7', 'Dm7', 'Dm7', 'E7', 'E7', 'Am7', 'Am7', 'D7', 'D7', 'Dm7', 'G7', 'C6', 'C6', 'E7', 'E7', 'A7', 'A7', 'Dm7', 'Dm7', 'Fmaj7', 'Fm6', 'Em7', 'A7', 'Dm7', 'G7', 'C6', 'C6'] },
  // minor tune in C minor (bossa-like changes)
  bossa: { key: 'Cm', bars: ['Cm7', 'Cm7', 'Fm7', 'Fm7', 'Dm7b5', 'G7', 'Cm7', 'Cm7', 'Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7', 'Dm7b5', 'G7', 'Cm7', 'Dm7b5 G7'] },
  // a tune in Db major (for "songs in Db")
  dflat: { key: 'Db', bars: ['Dbmaj7', 'Bbm7', 'Ebm7', 'Ab7', 'Fm7', 'Bb7', 'Ebm7', 'Ab7', 'Dbmaj7', 'Gbmaj7', 'Fm7', 'Bb7', 'Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7'] },
};

function human(r, t, j = 0.015) { return t + (r() - 0.5) * 2 * j; }

/** a fixed head melody for a tune: [{ bar, beat, dur, note }] */
function headMelody(tune, seed) {
  const r = rng(seed), out = [];
  const rhythms = [[[0, 1], [1, 1], [2, 1], [3, 1]], [[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 3], [3, 1]], [[0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1.5]], [[0, 2], [2, 2]]];
  let prev = 72;
  tune.bars.forEach((b, bar) => {
    const chords = b.split(' ').map(chord);
    const rh = rhythms[Math.floor(r() * rhythms.length)];
    for (const [beat, dur] of rh) {
      const c = chords[beat >= 2 && chords[1] ? 1 : 0];
      const tones = [];
      for (let o = 60; o <= 84; o += 12) for (const iv of c.iv) tones.push(o + ((c.root + iv) % 12));
      tones.sort((x, y) => Math.abs(x - prev) - Math.abs(y - prev));
      const note = tones[Math.floor(r() * 3)];
      prev = Math.min(82, Math.max(64, note));
      out.push({ bar, beat, dur, note: prev });
    }
  });
  return out;
}

/** an improvised chorus over the changes: eighth-note lines from chord and scale tones */
function improvMelody(tune, r) {
  const out = []; let prev = 72;
  tune.bars.forEach((b, bar) => {
    const chords = b.split(' ').map(chord);
    for (let e = 0; e < 8; e++) {
      if (r() < 0.18) continue;
      const c = chords[e >= 4 && chords[1] ? 1 : 0];
      const pcs = [...c.iv, 2, 5, 9].map((iv) => (c.root + iv) % 12);
      const cand = [];
      for (let p = prev - 4; p <= prev + 4; p++) if (pcs.includes(((p % 12) + 12) % 12) && p !== prev) cand.push(p);
      prev = Math.min(84, Math.max(62, cand[Math.floor(r() * cand.length)] || prev));
      out.push({ bar, beat: e / 2, dur: 0.5, note: prev });
    }
  });
  return out;
}

/** one performance of a tune -> notes. feel: swing | ballad | stride | up */
export function playTune(name, { feel = 'swing', bpm = 140, seed = 1, choruses = ['head', 'solo', 'head'], start = 0 } = {}) {
  const tune = TUNES[name], r = rng(seed * 7919 + name.length), head = headMelody(tune, name.length * 31 + 7);
  const spb = 60 / bpm, barLen = 4 * spb, notes = [];
  const warp = (x) => (feel === 'ballad' ? x + Math.sin(x / 7) * 0.6 : x); // rubato
  let t0 = start;
  for (const ch of choruses) {
    const mel = ch === 'head' ? head.map((n) => (r() < 0.15 ? { ...n, note: n.note + (r() < 0.5 ? 2 : -1) } : n)) : improvMelody(tune, r);
    for (const n of mel) {
      let beat = n.beat; if (feel !== 'ballad' && beat % 1 === 0.5) beat += 0.17; // swing the off-beats
      notes.push({ t: human(r, warp(t0 + n.bar * barLen + beat * spb)), dur: n.dur * spb * 0.9, note: n.note, vel: 70 + Math.floor(r() * 30) });
    }
    tune.bars.forEach((b, bar) => {
      const chords = b.split(' ').map(chord), bt = t0 + bar * barLen;
      chords.forEach((c, ci) => {
        const at = bt + ci * 2 * spb, len = (chords.length === 2 ? 2 : 4) * spb;
        const bass = 36 + c.root - (c.root > 9 ? 12 : 0); // Bb1..A2
        const shell = [c.iv[1], c.iv[3] ?? c.iv[2]].map((iv) => 52 + ((c.root + iv - 4 + 24) % 12));
        if (feel === 'stride') {
          const beats = len / spb;
          for (let k = 0; k < beats; k++) {
            const tk = warp(at + k * spb);
            if (k % 2 === 0) { notes.push({ t: human(r, tk), dur: spb * 0.6, note: bass, vel: 85 }); notes.push({ t: human(r, tk, 0.01), dur: spb * 0.6, note: bass + 12, vel: 75 }); }
            else for (const s of [...shell, 52 + ((c.root + c.iv[2] - 4 + 24) % 12)]) notes.push({ t: human(r, tk, 0.012), dur: spb * 0.5, note: s, vel: 65 });
          }
        } else if (feel === 'ballad') {
          notes.push({ t: human(r, warp(at)), dur: len * 0.95, note: bass, vel: 60 });
          for (const s of [...shell, 52 + ((c.root + 14 - 4 + 24) % 12)]) notes.push({ t: human(r, warp(at + 0.06)), dur: len * 0.9, note: s, vel: 52 });
        } else {
          notes.push({ t: human(r, at), dur: spb * 1.8, note: bass, vel: 72 });
          for (const s of shell) notes.push({ t: human(r, at + (r() < 0.5 ? 0 : 1.5 * spb)), dur: spb * 0.9, note: s, vel: 62 });
        }
      });
    });
    t0 += tune.bars.length * barLen;
  }
  notes.sort((a, b) => a.t - b.t);
  return { notes, end: t0 };
}

const MAJ = [0, 2, 4, 5, 7, 9, 11, 12];
/** scales through keys: two octaves up and down, hands an octave apart, sixteenths at bpm, a breath between keys */
export function playScales(keys, { bpm = 96, seed = 2, start = 0, set = MAJ, hands = 2 } = {}) {
  const r = rng(seed), notes = [], step = 60 / bpm / 4; let t = start;
  for (const k of keys) {
    const root = 60 + ROOTS[k];
    const up = []; for (let o = 0; o < 2; o++) for (let i = 0; i < 7; i++) up.push(root + o * 12 + set[i]);
    up.push(root + 24);
    const seq = [...up, ...up.slice(0, -1).reverse()];
    for (const p of seq) {
      const tt = human(r, t, 0.012), v = 60 + Math.floor(r() * 25);
      notes.push({ t: tt, dur: step * 0.9, note: p, vel: v });
      if (hands === 2) notes.push({ t: human(r, tt, 0.008), dur: step * 0.9, note: p - 12, vel: v - 5 });
      t += step;
    }
    t += 1.5 + r() * 2;
  }
  return { notes, end: t };
}

/** arpeggios of a chord quality through keys, two octaves up and down */
export function playArps(keys, { qual = 'maj7', bpm = 90, seed = 3, start = 0 } = {}) {
  const r = rng(seed), notes = [], step = 60 / bpm / 4; let t = start;
  for (const k of keys) {
    const root = 48 + ROOTS[k], up = [];
    for (let o = 0; o < 2; o++) for (const iv of QUAL[qual]) up.push(root + o * 12 + iv);
    up.push(root + 24);
    for (const rep of [0, 1]) for (const p of [...up, ...up.slice(0, -1).reverse()]) { notes.push({ t: human(r, t, 0.012), dur: step * 0.9, note: p + 12, vel: 70 + Math.floor(r() * 15) }); t += step; }
    t += 1.5 + r() * 1.5;
  }
  return { notes, end: t };
}

/** a Hanon-style figure walked up the scale and back */
export function playHanon({ bpm = 100, seed = 4, start = 0, root = 'C' } = {}) {
  const r = rng(seed), notes = [], step = 60 / bpm / 4; let t = start;
  const scale = []; for (let o = -1; o < 3; o++) for (const i of MAJ.slice(0, 7)) scale.push(60 + ROOTS[root] + o * 12 + i);
  const fig = [0, 2, 3, 4, 5, 4, 3, 2];
  for (let rep = 0; rep < 2; rep++) for (let s = 7; s < 21; s++) for (const f of fig) {
    const p = scale[s + f]; const tt = human(r, t, 0.012);
    notes.push({ t: tt, dur: step * 0.9, note: p, vel: 70 }); notes.push({ t: human(r, tt, 0.008), dur: step * 0.9, note: p - 12, vel: 65 }); t += step;
  }
  return { notes, end: t };
}

const LICK = [0, 2, 3, 5, 7, 10, 9, 7, 6, 5, 3, 2, 0]; // a bebop-ish line over a minor ii-V, offsets from the ii chord root
/** a lick learned: the same line again and again at one pitch, starting slow, with stops to check it */
export function playLickDrill({ root = 'D', reps = 12, seed = 5, start = 0, transpose = false, bpm0 = 70, bpm1 = 120 } = {}) {
  const r = rng(seed), notes = []; let t = start;
  for (let k = 0; k < reps; k++) {
    const shift = transpose ? (k * 5) % 12 : 0; // through the keys by fourths when transposing
    const bpm = bpm0 + (bpm1 - bpm0) * (k / (reps - 1)), step = 60 / bpm / 2;
    const base = 62 + ((ROOTS[root] + shift) % 12);
    // left hand: the ii chord shell under it, sometimes
    if (r() < 0.6) for (const iv of [3, 10]) notes.push({ t: human(r, t), dur: step * 6, note: base - 12 + iv, vel: 55 });
    for (const off of LICK) { notes.push({ t: human(r, t, 0.02), dur: step * 0.85, note: base + off, vel: 65 + Math.floor(r() * 20) }); t += step * (1 + (r() - 0.5) * 0.15); }
    t += transpose ? 0.6 + r() * 0.6 : 1 + r() * 2.5; // stops to think
  }
  return { notes, end: t };
}

/** stop-start: short bursts of a few notes, then a pause (working something out from a video) */
export function playFragments({ seconds = 60, seed = 6, start = 0 } = {}) {
  const r = rng(seed), notes = []; let t = start;
  while (t < start + seconds) {
    const n = 3 + Math.floor(r() * 5); let p = 60 + Math.floor(r() * 12);
    for (let i = 0; i < n; i++) { notes.push({ t, dur: 0.3, note: p, vel: 60 }); p += Math.floor(r() * 7) - 3; t += 0.25 + r() * 0.4; }
    if (r() < 0.5) for (const iv of [0, 4, 7]) notes.push({ t: t - 0.2, dur: 1, note: 48 + iv + Math.floor(r() * 5), vel: 50 });
    t += 1.5 + r() * 3;
  }
  return { notes, end: t };
}
