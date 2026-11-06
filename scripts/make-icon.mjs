// Draws the NoteshAIre icon (three rising keys and a red one) as PNG and ICO: build/icon.png 512, build/icon.ico, build/tray.png.
import fs from 'node:fs';
import zlib from 'node:zlib';
function draw(S) {
  const px = Buffer.alloc(S * S * 4), k = S / 64;
  const rect = (x0, y0, w, h, [r, g, b], rad = 0) => {
    [x0, y0, w, h, rad] = [x0, y0, w, h, rad].map((v) => v * k);
    for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      const cx = Math.min(Math.max(x + 0.5, x0 + rad), x0 + w - rad), cy = Math.min(Math.max(y + 0.5, y0 + rad), y0 + h - rad);
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rad;
      const a = Math.max(0, Math.min(1, 0.5 - d));
      if (!a) continue;
      const i = (y * S + x) * 4, ba = px[i + 3] / 255, oa = a + ba * (1 - a);
      px[i] = (r * a + px[i] * ba * (1 - a)) / oa; px[i + 1] = (g * a + px[i + 1] * ba * (1 - a)) / oa; px[i + 2] = (b * a + px[i + 2] * ba * (1 - a)) / oa; px[i + 3] = oa * 255;
    }
  };
  rect(0, 0, 64, 64, [20, 21, 24], 14);
  rect(12, 38, 8, 14, [216, 52, 60], 2); rect(24, 28, 8, 24, [232, 230, 227], 2); rect(36, 20, 8, 32, [232, 230, 227], 2); rect(48, 12, 6, 40, [70, 74, 82], 2);
  return px;
}
function png(S) {
  const px = draw(S), raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(S, 0); ih.writeUInt32BE(S, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function ico(sizes) {
  const imgs = sizes.map(png), head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((S, i) => { const o = 6 + i * 16; head[o] = S >= 256 ? 0 : S; head[o + 1] = S >= 256 ? 0 : S; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(imgs[i].length, o + 8); head.writeUInt32LE(off, o + 12); off += imgs[i].length; });
  return Buffer.concat([head, ...imgs]);
}
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon.png', png(512));
fs.writeFileSync('build/icon.ico', ico([16, 32, 48, 256]));
fs.writeFileSync('build/tray.png', png(32));
fs.writeFileSync('ui/icon.png', png(64));
console.log('icons written');
