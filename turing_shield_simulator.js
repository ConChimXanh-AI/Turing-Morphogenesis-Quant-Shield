/**
 * TURING MORPHOGENESIS QUANT SHIELD — GRAY-SCOTT REACTION-DIFFUSION SIMULATOR
 * Author: Con Chim Xanh (Bluebird AI) — https://github.com/ConChimXanh-AI
 *
 * Models a self-healing capital & volatility membrane using the Gray-Scott PDEs
 * in the Coral Growth Regime (F = 0.0545, k = 0.0620).
 * Demonstrates how localized black-swan ruptures trigger boundary catalysis (u * v^2)
 * and autonomously regenerate structural integrity.
 */

class GrayScottShield {
  constructor(size = 64, F = 0.0545, k = 0.0620, Du = 0.16, Dv = 0.08) {
    this.N = size;
    this.F = F;
    this.k = k;
    this.Du = Du;
    this.Dv = Dv;
    this.u = new Float64Array(size * size).fill(1.0);
    this.v = new Float64Array(size * size).fill(0.0);
    this.uNext = new Float64Array(size * size);
    this.vNext = new Float64Array(size * size);
    this.seedCenter();
  }

  idx(x, y) {
    const N = this.N;
    return ((y + N) % N) * N + ((x + N) % N);
  }

  seedCenter() {
    const mid = Math.floor(this.N / 2);
    for (let y = mid - 6; y <= mid + 6; y++) {
      for (let x = mid - 6; x <= mid + 6; x++) {
        const i = this.idx(x, y);
        this.u[i] = 0.50;
        this.v[i] = 0.25;
      }
    }
  }

  injectBlackSwanShock(cx, cy, radius = 5) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          const i = this.idx(x, y);
          this.u[i] = 1.0;
          this.v[i] = 0.0; // Membrane ruptured to zero
        }
      }
    }
  }

  step(dt = 1.0) {
    const { N, F, k, Du, Dv, u, v, uNext, vNext } = this;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const uVal = u[i];
        const vVal = v[i];

        const lapU =
          u[this.idx(x + 1, y)] +
          u[this.idx(x - 1, y)] +
          u[this.idx(x, y + 1)] +
          u[this.idx(x, y - 1)] -
          4.0 * uVal;

        const lapV =
          v[this.idx(x + 1, y)] +
          v[this.idx(x - 1, y)] +
          v[this.idx(x, y + 1)] +
          v[this.idx(x, y - 1)] -
          4.0 * vVal;

        const uvv = uVal * vVal * vVal;
        uNext[i] = Math.min(1, Math.max(0, uVal + dt * (Du * lapU - uvv + F * (1.0 - uVal))));
        vNext[i] = Math.min(1, Math.max(0, vVal + dt * (Dv * lapV + uvv - (F + k) * vVal)));
      }
    }
    this.u.set(uNext);
    this.v.set(vNext);
  }

  activeCatalystDensity() {
    let sum = 0;
    for (let i = 0; i < this.v.length; i++) sum += this.v[i];
    return sum / this.v.length;
  }
}

if (require.main === module) {
  const shield = new GrayScottShield(64);
  console.log('[Con Chim Xanh AI] Initializing Gray-Scott Coral Shield (F=0.0545, k=0.0620)...');
  for (let s = 0; s < 400; s++) shield.step();
  const preShock = shield.activeCatalystDensity();
  console.log('Pre-Shock Catalyst Density:', preShock.toFixed(6));

  console.log('Injecting Black-Swan Rupture at (32, 32)...');
  shield.injectBlackSwanShock(32, 32, 6);
  const postShock = shield.activeCatalystDensity();
  console.log('Immediate Post-Shock Density:', postShock.toFixed(6));

  for (let s = 0; s < 600; s++) shield.step();
  const healed = shield.activeCatalystDensity();
  console.log('Self-Healed Density after 600 steps:', healed.toFixed(6));
}

module.exports = { GrayScottShield };
