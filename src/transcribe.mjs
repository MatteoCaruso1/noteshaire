// Sound -> notes, for acoustic instruments (a real piano, voice, guitar, horns) heard through the microphone.
// Spotify's Basic Pitch (Apache-2.0) on TensorFlow.js with the WebAssembly engine: runs on any laptop, nothing to compile,
// nothing leaves the computer. Input: mono Float32 audio at 22,050 Hz. Output: notes [{ t, dur, note, vel }] in seconds,
// the same shape the keyboard recorder's takes give, so the rest of the analysis is unchanged.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const SAMPLE_RATE = 22050;
let ready = null;

/** load TensorFlow.js, the WASM engine and the model once */
function init() {
  if (ready) return ready;
  ready = (async () => {
    const tf = require('@tensorflow/tfjs');
    const wasm = require('@tensorflow/tfjs-backend-wasm');
    // inside the packaged app the .wasm files sit outside the archive (asarUnpack)
    const dist = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm')).replace('app.asar', 'app.asar.unpacked');
    wasm.setWasmPaths(dist + path.sep);
    await tf.setBackend(process.env.TRANSCRIBE_BACKEND || 'wasm');
    await tf.ready();
    // tf.signal.frame asks for a Fill without a dtype; the CPU engine guesses float32, the WASM engine throws. Default it.
    const fill = tf.getKernel('Fill', 'wasm');
    if (fill && tf.getBackend() === 'wasm') {
      tf.unregisterKernel('Fill', 'wasm');
      tf.registerKernel({ ...fill, kernelFunc: (args) => fill.kernelFunc({ ...args, attrs: { ...args.attrs, dtype: args.attrs.dtype || 'float32' } }) });
    }
    const modelDir = path.dirname(require.resolve('@spotify/basic-pitch/model/model.json')).replace('app.asar', 'app.asar.unpacked');
    const json = JSON.parse(fs.readFileSync(path.join(modelDir, 'model.json'), 'utf8'));
    const weightSpecs = json.weightsManifest.flatMap((g) => g.weights);
    const weightData = Buffer.concat(json.weightsManifest.flatMap((g) => g.paths.map((p) => fs.readFileSync(path.join(modelDir, p)))));
    const { weightsManifest, ...rest } = json;
    const handler = { load: async () => ({ ...rest, weightSpecs, weightData: weightData.buffer.slice(weightData.byteOffset, weightData.byteOffset + weightData.byteLength) }) };
    const model = await tf.loadGraphModel(handler);
    const bp = require('@spotify/basic-pitch');
    return { tf, bp, basicPitch: new bp.BasicPitch(model) };
  })();
  return ready;
}

/** audio (Float32Array, 22,050 Hz mono) -> notes. `offset` shifts every note (seconds into the session). */
export async function transcribe(audio, { offset = 0, onsetThresh = 0.5, frameThresh = 0.3, minNoteFrames = 11 } = {}) {
  const { bp, basicPitch } = await init();
  const frames = [], onsets = [], contours = [];
  await basicPitch.evaluateModel(audio, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, () => {});
  const events = bp.noteFramesToTime(bp.addPitchBendsToNoteEvents(contours, bp.outputToNotesPoly(frames, onsets, onsetThresh, frameThresh, minNoteFrames)));
  return events
    .map((e) => ({ t: +(e.startTimeSeconds + offset).toFixed(3), dur: +e.durationSeconds.toFixed(3), note: e.pitchMidi, vel: Math.max(1, Math.min(127, Math.round(20 + e.amplitude * 107))) }))
    .filter((n) => n.note >= 21 && n.note <= 108)
    .sort((a, b) => a.t - b.t || a.note - b.note);
}
