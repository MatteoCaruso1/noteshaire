// Which song is this? A piece's harmony over time (a chroma frame every 1.5 s) is lined up against every named song's
// earlier pieces with a local alignment. Frames are compared four at a time (about 7 s of chord changes), which is what
// tells two tunes in the same key apart; the query is also tried played slower and faster, so a ballad take of a tune
// still finds its medium-tempo take. Measured on his 2026-11-05 Beatles session: the weakest right match scored 6x the
// strongest wrong one (tests/verify.mjs keeps that case).

export const FP = { hop_s: 1.5, win_s: 3 };
export const MATCH = { stack: 4, gate: 0.7, hold: 0.08, speeds: [0.67, 0.8, 1, 1.25, 1.5], min_frames: 8, accept: 0.075, margin: 1.5 };

/** notes -> chroma frames [[12 numbers]], silent frames skipped. The lowest sounding note counts extra (the bass names the chord). */
export function fingerprint(notes, t0, t1) {
  const frames = [];
  for (let s = t0; s < t1 - FP.win_s / 2; s += FP.hop_s) {
    const e = s + FP.win_s, h = new Array(12).fill(0);
    let low = 999;
    for (const n of notes) {
      const a = Math.max(s, n.t), b = Math.min(e, n.t + Math.max(0.15, Math.min(n.dur, 2.5)));
      if (b <= a) continue;
      h[n.note % 12] += (b - a) * (n.vel || 64) / 64;
      if (n.note < low) low = n.note;
    }
    if (low < 999) h[low % 12] += 0.5 * Math.max(...h);
    const norm = Math.sqrt(h.reduce((x, v) => x + v * v, 0));
    if (norm > 0) frames.push(h.map((v) => +(v / norm).toFixed(3)));
  }
  return frames;
}

function resample(fp, speed) {
  if (speed === 1) return fp;
  const n = Math.max(1, Math.round(fp.length / speed)), out = [];
  for (let i = 0; i < n; i++) {
    const x = Math.min(fp.length - 1, i * speed), a = Math.floor(x), b = Math.min(fp.length - 1, a + 1), w = x - a;
    const v = fp[a].map((p, k) => p * (1 - w) + fp[b][k] * w);
    const nn = Math.sqrt(v.reduce((s, q) => s + q * q, 0)) || 1;
    out.push(v.map((q) => q / nn));
  }
  return out;
}

function stack(fp, k = MATCH.stack) {
  const out = [];
  for (let i = 0; i + k <= fp.length; i++) {
    const v = new Float32Array(12 * k);
    for (let j = 0; j < k; j++) for (let q = 0; q < 12; q++) v[j * 12 + q] = fp[i + j][q] / Math.sqrt(k);
    out.push(v);
  }
  return out;
}

/** local alignment score of a inside b, per frame of the shorter side; cover = share of a that lined up */
export function alignStacked(a, b) {
  const n = a.length, m = b.length, d = n ? a[0].length : 0;
  if (!n || !m) return { score: 0, cover: 0 };
  let prev = new Float32Array(m + 1), prevA = new Uint16Array(m + 1), best = 0, bestA = 0;
  for (let i = 1; i <= n; i++) {
    const H = new Float32Array(m + 1), A = new Uint16Array(m + 1), x = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const y = b[j - 1]; let s = 0; for (let k = 0; k < d; k++) s += x[k] * y[k];
      const g = s - MATCH.gate;
      let h = prev[j - 1] + g, al = prevA[j - 1] + 1;
      if (prev[j] + g - MATCH.hold > h) { h = prev[j] + g - MATCH.hold; al = prevA[j] + 1; }
      if (H[j - 1] + g - MATCH.hold > h) { h = H[j - 1] + g - MATCH.hold; al = A[j - 1]; }
      if (h <= 0) { h = 0; al = 0; }
      H[j] = h; A[j] = al;
      if (h > best) { best = h; bestA = al; }
    }
    prev = H; prevA = A;
  }
  return { score: best / Math.min(n, m), cover: bestA / n };
}

/** how much a sounds like b (0 = nothing in common), trying a at several speeds */
export function likeness(fpA, fpB) {
  if (!fpA || !fpB || fpA.length < MATCH.min_frames || fpB.length < MATCH.min_frames) return 0;
  const b = stack(fpB);
  let best = 0;
  for (const sp of MATCH.speeds) {
    const a = stack(resample(fpA, sp));
    if (!a.length) continue;
    const r = a.length <= b.length ? alignStacked(a, b) : alignStacked(b, a);
    if (r.score > best) best = r.score;
  }
  return +best.toFixed(3);
}

/** a piece's fingerprint against the library [{ id, refs: [{ fp }] }] -> { song, score, unsure?, runnerUp? } or null */
export function identify(fp, songs) {
  if (!fp || fp.length < MATCH.min_frames) return null;
  const scored = [];
  for (const song of songs) {
    let best = 0;
    for (const ref of song.refs || []) if (ref.fp && ref.fp !== fp) best = Math.max(best, likeness(fp, ref.fp));
    if (best > 0) scored.push({ song: song.id, score: best });
  }
  scored.sort((p, q) => q.score - p.score);
  const top = scored[0];
  if (!top || top.score < MATCH.accept) return null;
  const runner = scored[1];
  if (runner && top.score < runner.score * MATCH.margin) return { ...top, unsure: true, runnerUp: runner.song };
  return top;
}

/** where a song sits inside a longer piece: { score, t0, t1 } in take seconds, or null.
 *  Every frame here is timed (silent frames kept as zeros) so a match maps back to the clock. */
export function locate(songFp, notes, t0, t1) {
  if (!songFp || songFp.length < MATCH.min_frames) return null;
  const frames = [], times = [];
  for (let s = t0; s < t1 - FP.win_s / 2; s += FP.hop_s) {
    const f = fingerprint(notes.filter((n) => n.t < s + FP.win_s && n.t + Math.max(0.15, Math.min(n.dur, 2.5)) > s), s, s + FP.win_s + 0.001)[0];
    frames.push(f || new Array(12).fill(0)); times.push(s);
  }
  const b = stack(frames);
  let best = null;
  for (const sp of MATCH.speeds) {
    const a = stack(resample(songFp, sp));
    if (!a.length || a.length > b.length * 1.2) continue;
    // local alignment of the song (a) along the piece (b), remembering where in b the best path starts and ends
    const n = a.length, m = b.length, d = a[0].length;
    let prev = new Float32Array(m + 1), prevS = new Int32Array(m + 1).fill(-1), top = { h: 0 };
    for (let i = 1; i <= n; i++) {
      const H = new Float32Array(m + 1), S = new Int32Array(m + 1).fill(-1), x = a[i - 1];
      for (let j = 1; j <= m; j++) {
        const y = b[j - 1]; let s = 0; for (let k = 0; k < d; k++) s += x[k] * y[k];
        const gn = s - MATCH.gate;
        let h = prev[j - 1] + gn, st = prevS[j - 1] < 0 ? j - 1 : prevS[j - 1];
        if (prev[j] + gn - MATCH.hold > h) { h = prev[j] + gn - MATCH.hold; st = prevS[j] < 0 ? j - 1 : prevS[j]; }
        if (H[j - 1] + gn - MATCH.hold > h) { h = H[j - 1] + gn - MATCH.hold; st = S[j - 1] < 0 ? j - 1 : S[j - 1]; }
        if (h <= 0) { h = 0; st = -1; }
        H[j] = h; S[j] = st;
        if (h > top.h) top = { h, j0: st, j1: j };
      }
      prev = H; prevS = S;
    }
    if (top.h > 0) {
      const len = top.j1 - top.j0, score = top.h / Math.max(MATCH.min_frames, Math.min(n, len));
      if (!best || score > best.score) best = { score: +score.toFixed(3), t0: times[top.j0], t1: times[Math.min(times.length - 1, top.j1 + MATCH.stack - 1)] + FP.win_s };
    }
  }
  return best;
}
