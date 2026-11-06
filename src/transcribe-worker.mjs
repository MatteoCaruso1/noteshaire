// Runs Basic Pitch off the main thread, so the keyboard recorder's timestamps and the window never wait on it.
import { parentPort } from 'node:worker_threads';
import { transcribe } from './transcribe.mjs';

parentPort.on('message', async ({ id, audio, offset, keepFrom }) => {
  try {
    const notes = (await transcribe(new Float32Array(audio), { offset })).filter((n) => n.t >= keepFrom);
    parentPort.postMessage({ id, notes });
  } catch (e) { parentPort.postMessage({ id, error: e.message }); }
});
