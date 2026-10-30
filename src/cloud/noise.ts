import { Data3DTexture, LinearFilter, RGFormat, RepeatWrapping, UnsignedByteType } from 'three';

function hash(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

const wrap = (i: number, p: number) => ((i % p) + p) % p;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const remap = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c);

const GRADS = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function gradDot(ix: number, iy: number, iz: number, p: number, seed: number, dx: number, dy: number, dz: number) {
  const g = GRADS[hash(wrap(ix, p), wrap(iy, p), wrap(iz, p), seed) % 12];
  return g[0] * dx + g[1] * dy + g[2] * dz;
}

/** Tileable gradient noise in [-1, 1] (approx.). x,y,z in [0,1), period = lattice frequency. */
function perlin(x: number, y: number, z: number, period: number, seed: number) {
  x *= period; y *= period; z *= period;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const n000 = gradDot(ix, iy, iz, period, seed, fx, fy, fz);
  const n100 = gradDot(ix + 1, iy, iz, period, seed, fx - 1, fy, fz);
  const n010 = gradDot(ix, iy + 1, iz, period, seed, fx, fy - 1, fz);
  const n110 = gradDot(ix + 1, iy + 1, iz, period, seed, fx - 1, fy - 1, fz);
  const n001 = gradDot(ix, iy, iz + 1, period, seed, fx, fy, fz - 1);
  const n101 = gradDot(ix + 1, iy, iz + 1, period, seed, fx - 1, fy, fz - 1);
  const n011 = gradDot(ix, iy + 1, iz + 1, period, seed, fx, fy - 1, fz - 1);
  const n111 = gradDot(ix + 1, iy + 1, iz + 1, period, seed, fx - 1, fy - 1, fz - 1);
  return lerp(
    lerp(lerp(n000, n100, u), lerp(n010, n110, u), v),
    lerp(lerp(n001, n101, u), lerp(n011, n111, u), v),
    w,
  );
}

/** Tileable inverted Worley (cellular) noise in [0, 1]. */
function worley(x: number, y: number, z: number, cells: number, seed: number) {
  x *= cells; y *= cells; z *= cells;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let minD = Infinity;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k;
        const h = hash(wrap(cx, cells), wrap(cy, cells), wrap(cz, cells), seed);
        const px = cx + (h & 1023) / 1023 - x;
        const py = cy + ((h >>> 10) & 1023) / 1023 - y;
        const pz = cz + ((h >>> 20) & 1023) / 1023 - z;
        const d = px * px + py * py + pz * pz;
        if (d < minD) minD = d;
      }
  return 1 - Math.min(Math.sqrt(minD), 1);
}

function worleyFbm(x: number, y: number, z: number, base: number, seed: number) {
  return worley(x, y, z, base, seed) * 0.625 + worley(x, y, z, base * 2, seed + 1) * 0.25 + worley(x, y, z, base * 4, seed + 2) * 0.125;
}

function perlinFbm(x: number, y: number, z: number, base: number, octaves: number, seed: number) {
  let sum = 0, amp = 0.5, norm = 0, freq = base;
  for (let o = 0; o < octaves; o++) {
    sum += perlin(x, y, z, freq, seed + o) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * RG 3D texture:
 *  R = Perlin-Worley (base cloud shape)
 *  G = high-frequency Worley FBM (erosion detail)
 */
export function generateCloudNoiseData(size = 128, seed = 1) {
  const n = size * size * size;
  const shape = new Float32Array(n);
  const detail = new Float32Array(n);
  let idx = 0;
  for (let z = 0; z < size; z++) {
    const fz = z / size;
    for (let y = 0; y < size; y++) {
      const fy = y / size;
      for (let x = 0; x < size; x++, idx++) {
        const fx = x / size;
        const p = Math.min(Math.max(perlinFbm(fx, fy, fz, 4, 4, seed) * 0.5 + 0.5, 0), 1);
        const wShape = worleyFbm(fx, fy, fz, 4, seed + 10);
        shape[idx] = Math.min(Math.max(remap(p, wShape - 1, 1, 0, 1), 0), 1);
        detail[idx] = worleyFbm(fx, fy, fz, 8, seed + 20);
      }
    }
  }
  const range = (a: Float32Array) => a.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity]);
  const [sLo, sHi] = range(shape);
  const [dLo, dHi] = range(detail);
  const data = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    data[i * 2] = ((shape[i] - sLo) / (sHi - sLo)) * 255;
    data[i * 2 + 1] = ((detail[i] - dLo) / (dHi - dLo)) * 255;
  }
  return data;
}

export function createCloudNoiseTexture(data: Uint8Array, size: number) {
  const tex = new Data3DTexture(data, size, size, size);
  tex.format = RGFormat;
  tex.type = UnsignedByteType;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
