import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG, N, R, TAU, wrap} from '../model.mjs';
import {TEXTURE_SIZE, WORLD_PLANE_RATIO, createCloudPainter} from '../cloud.mjs';

// Original texture arithmetic, retained independently as the pixel reference.
function reference(q, gather) {
  const data = new Uint8ClampedArray(320 * 320 * 4), ref = CONFIG.initial / N * .5;
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    const dx = (x + .5 - 160) / 160, dy = (y + .5 - 160) / 160, r = Math.hypot(dx, dy);
    if (r <= WORLD_PLANE_RATIO || r >= 1) continue;
    const a = wrap(Math.atan2(dy, dx) + Math.PI / 2) / TAU * N, i = Math.floor(a), fx = a - i;
    const radial = (r - WORLD_PLANE_RATIO) / (1 - WORLD_PLANE_RATIO) * (R + 1) - 1, j = Math.floor(radial), fy = radial - j;
    const index = (row, col) => row < 0 || row >= R ? -1 : row * N + col % N;
    const [a0, b, c, d] = [index(j, i), index(j, i + 1), index(j + 1, i), index(j + 1, i + 1)];
    const lo = (a0 < 0 ? 0 : q[a0]) * (1 - fx) + (b < 0 ? 0 : q[b]) * fx;
    const hi = (c < 0 ? 0 : q[c]) * (1 - fx) + (d < 0 ? 0 : q[d]) * fx;
    const mass = lo * (1 - fy) + hi * fy, k = (y * 320 + x) * 4;
    data[k] = Math.round(100 + 137 * gather);
    data[k + 1] = Math.round(228 - 8 * gather);
    data[k + 2] = Math.round(176 - 34 * gather);
    data[k + 3] = Math.round(220 * (1 - Math.exp(-mass / ref * 1.4)));
  }
  return data;
}

test('optimized cloud pixels match the original byte for byte, including gathering and boundaries', () => {
  const patterns = [
    new Float64Array(N * R),
    Float64Array.from({length: N * R}, (_, k) => (k % 29) / 100),
    Float64Array.from({length: N * R}, (_, k) => k === 0 || k === N * R - 1 ? 135 : 0),
    Float64Array.from({length: N * R}, (_, k) => k % 2 ? 1000 : -1e-9),
  ];
  const actual = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const paint = createCloudPainter(actual);
  for (const q of patterns) for (const gather of [0, .01, .5, .999, 1]) {
    paint(q, gather);
    assert.deepEqual(actual, reference(q, gather));
  }
});
