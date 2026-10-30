import { Color, MathUtils } from 'three';
import type { Cloud } from './Cloud';

export interface LightningSettings {
  enabled: boolean;
  color: Color;
  /** peak brightness of a flash */
  intensity: number;
  /** average number of flashes per second */
  frequency: number;
  /** falloff radius of the light, in world units */
  radius: number;
  /** time scale of the strobe sequence (1 ≈ 0.3 s) */
  duration: number;
}

export function createLightningSettings(): LightningSettings {
  return {
    enabled: false,
    color: new Color(0.75, 0.8, 1),
    intensity: 20,
    frequency: 0.6,
    radius: 140,
    duration: 1,
  };
}

interface Pulse {
  t: number;
  amp: number;
}

/**
 * Drives the lightning uniforms of a Cloud: flashes appear at random times (Poisson process)
 * at random positions inside the cloud volume, each made of a few quick decaying strobes.
 */
export class Lightning {
  readonly settings = createLightningSettings();
  private time = 0;
  private next = 0;
  private end = 0;
  private pulses: Pulse[] = [];
  private readonly cloud: Cloud;

  constructor(cloud: Cloud) {
    this.cloud = cloud;
    this.scheduleNext();
  }

  trigger() {
    const { position, scale } = this.cloud;
    const pos = this.cloud.uniforms.uLightningPos.value;
    // keep flashes in the core / lower part of the cloud, where it is densest
    pos.set(
      position.x + MathUtils.randFloatSpread(scale.x * 0.5),
      position.y + MathUtils.randFloat(-0.35, 0.1) * scale.y,
      position.z + MathUtils.randFloatSpread(scale.z * 0.5),
    );

    const d = this.settings.duration;
    const count = 1 + Math.floor(Math.random() * 4);
    let t = this.time;
    this.pulses = [];
    for (let i = 0; i < count; i++) {
      this.pulses.push({ t, amp: i === 0 ? 1 : MathUtils.randFloat(0.35, 1) });
      t += MathUtils.randFloat(0.03, 0.12) * d;
    }
    this.end = t + this.decay() * 6;
    this.scheduleNext();
  }

  update(dt: number) {
    this.time += dt;
    const s = this.settings;
    if (s.enabled && this.time >= this.next) this.trigger();

    let k = 0;
    if (this.time > this.end) this.pulses = [];
    const decay = this.decay();
    for (const p of this.pulses) if (this.time >= p.t) k += p.amp * Math.exp(-(this.time - p.t) / decay);

    const u = this.cloud.uniforms;
    u.uLightningIntensity.value = k * s.intensity;
    u.uLightningColor.value.copy(s.color);
    u.uLightningRadius.value = s.radius;
  }

  private decay() {
    return 0.05 * this.settings.duration;
  }

  private scheduleNext() {
    const f = this.settings.frequency;
    const wait = f > 0 ? -Math.log(1 - Math.random()) / f : Infinity;
    this.next = Math.max(this.time, this.end) + wait;
  }
}
