import {CONFIG, N, R, TAU, wrap} from './model.mjs';

export const TEXTURE_SIZE = 320;
const half = TEXTURE_SIZE / 2;
const littleEndian = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4;

// One shared flat table replaces thousands of small arrays and per-draw iterators.
// Keep the original interpolation coordinates and operation order exactly.
const samples = (() => {
  const values = [];
  for (let y = 0; y < TEXTURE_SIZE; y++) for (let x = 0; x < TEXTURE_SIZE; x++) {
    const dx = (x + .5 - half) / half, dy = (y + .5 - half) / half, r = Math.hypot(dx, dy);
    if (r <= .65 || r >= 1) continue;
    const a = wrap(Math.atan2(dy, dx) + Math.PI / 2) / TAU * N, i = Math.floor(a), fx = a - i;
    const radial = (r - .65) / .35 * (R + 1) - 1, j = Math.floor(radial), fy = radial - j;
    const index = (row, col) => row < 0 || row >= R ? -1 : row * N + col % N;
    values.push(y * TEXTURE_SIZE + x, index(j, i), index(j, i + 1), index(j + 1, i), index(j + 1, i + 1), fx, fy);
  }
  return new Float64Array(values);
})();

export function createCloudPainter(data) {
  const pixels = new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
  const ref = CONFIG.initial / N * .5;
  return function paintCloud(q, gather) {
    const red = Math.round(100 + 137 * gather), green = Math.round(228 - 8 * gather), blue = Math.round(176 - 34 * gather);
    const color = littleEndian ? red | green << 8 | blue << 16 : red << 24 | green << 16 | blue << 8;
    for (let s = 0; s < samples.length; s += 7) {
      const k = samples[s], a = samples[s + 1], b = samples[s + 2], c = samples[s + 3], d = samples[s + 4], fx = samples[s + 5], fy = samples[s + 6];
      const lo = (a < 0 ? 0 : q[a]) * (1 - fx) + (b < 0 ? 0 : q[b]) * fx;
      const hi = (c < 0 ? 0 : q[c]) * (1 - fx) + (d < 0 ? 0 : q[d]) * fx;
      const mass = lo * (1 - fy) + hi * fy;
      const alpha = Math.max(0, Math.min(255, Math.round(220 * (1 - Math.exp(-mass / ref * 1.4)))));
      pixels[k] = littleEndian ? color | alpha << 24 : color | alpha;
    }
  };
}
