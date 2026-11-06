// Notes -> piano audio (Salamander samples, decoded with ffmpeg), for the microphone-path tests.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SAMPLE_RATE } from '../src/transcribe.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SR = SAMPLE_RATE;
// the piano: every sample decoded to mono Float32 at 22,050 Hz
const samples = [];
for (const f of fs.readdirSync(path.join(HERE, '..', 'ui', 'piano')).filter((x) => x.endsWith('.mp3'))) {
  const m = f.match(/^([A-Z])(s?)(\d)\.mp3$/); if (!m) continue;
  const pc = { C: 0, D: 2, F: 5, A: 9 }[m[1]] + (m[2] ? 1 : 0), note = 12 * (+m[3] + 1) + pc;
  const raw = execFileSync('ffmpeg', ['-v', 'quiet', '-i', path.join(HERE, '..', 'ui', 'piano', f), '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 64 * 1024 * 1024 });
  samples.push({ note, data: new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4) });
}
/** notes -> audio: each note is the nearest sample pitched by resampling, cut with a short release */
export function render(notes, end) {
  const out = new Float32Array(Math.ceil((end + 3) * SR));
  for (const n of notes) {
    let s = samples[0]; for (const x of samples) if (Math.abs(x.note - n.note) < Math.abs(s.note - n.note)) s = x;
    const rate = 2 ** ((n.note - s.note) / 12), gain = Math.pow((n.vel || 70) / 127, 1.6) * 0.5;
    const start = Math.max(0, Math.round(n.t * SR)), len = Math.round((Math.max(0.15, n.dur) + 0.3) * SR), rel = Math.round(0.3 * SR);
    for (let i = 0; i < len && start + i < out.length; i++) {
      const p = i * rate, k = Math.floor(p); if (k + 1 >= s.data.length) break;
      const env = i > len - rel ? (len - i) / rel : 1;
      out[start + i] += (s.data[k] * (1 - (p - k)) + s.data[k + 1] * (p - k)) * gain * env;
    }
  }
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < out.length; i++) out[i] += (rnd() - 0.5) * 0.004; // room noise (repeatable)
  return out;
}
