import type { Color, Vector3, WebGLRenderer } from 'three';
import type { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Water } from 'three/examples/jsm/objects/Water.js';
import { createCloudUniforms, type Cloud, type CloudUniforms } from './cloud/Cloud';
import { createLightningSettings, type Lightning, type LightningSettings } from './cloud/Lightning';
import type { SimParams } from './gui';

type Vec3 = [number, number, number];

/** Uniforms driven at runtime or by the "Render" quality settings: never touched by presets. */
const NON_PRESET_UNIFORMS = new Set<keyof CloudUniforms>([
  'uNoise', 'uBoxMin', 'uBoxMax', 'uGroundHeight', 'uTime', 'uSunDir',
  'uLightningPos', 'uLightningColor', 'uLightningIntensity', 'uLightningRadius',
  'uSteps', 'uLightSteps', 'uJitter',
]);

export interface Preset {
  /** cloud uniforms: numbers, or [r,g,b] / [x,y,z] (linear) for colors and vectors */
  cloud?: Partial<Record<keyof CloudUniforms, number | Vec3>>;
  volume?: { position?: Vec3; size?: Vec3 };
  sun?: { elevation?: number; azimuth?: number; autoSunColor?: boolean };
  sky?: { turbidity?: number; rayleigh?: number; mieCoefficient?: number; mieDirectionalG?: number; cloudCoverage?: number };
  ocean?: { distortionScale?: number; size?: number; waterColor?: number };
  lightning?: Partial<Omit<LightningSettings, 'color'> & { color: Vec3 }>;
  exposure?: number;
}

/** Values every preset starts from (the app's initial state), so switching presets is deterministic. */
const BASE = {
  volume: { position: [0, 230, 0] as Vec3, size: [480, 240, 340] as Vec3 },
  sun: { elevation: 18, azimuth: 55, autoSunColor: true },
  sky: { turbidity: 4, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.8, cloudCoverage: 0 },
  ocean: { distortionScale: 3.7, size: 1, waterColor: 0x001e0f },
  exposure: 0.5,
};

export const PRESETS = {
  Clear: {},

  Storm: {
    cloud: {
      uDensity: 2.5,
      uCoverage: 0.92,
      uShapeSize: 300,
      uDetailSize: 60,
      uDetailStrength: 0.25,
      uEdgeFalloff: 0.35,
      uBottomFlatness: 3,
      uTopRoundness: 0.9,
      uWind: [10, 0, 3],
      uEvolution: 0.008,
      uFlowStrength: 60,
      uFlowScale: 150,
      uFlowSpeed: 0.5,
      uFlowTurbulence: 0.8,
      uSunIntensity: 1.2,
      uAmbientTop: [0.22, 0.25, 0.3],
      uAmbientBottom: [0.05, 0.055, 0.065],
      uAmbientIntensity: 0.6,
      uCloudColor: [0.6, 0.62, 0.66],
      uAbsorption: 0.1,
      uLightAbsorption: 0.1,
      uPowder: 0.7,
      uMultiScatter: 0.35,
    },
    volume: { position: [0, 300, 0], size: [800, 420, 560] },
    sun: { elevation: 6, azimuth: 120 },
    sky: { turbidity: 14, rayleigh: 3.5, mieCoefficient: 0.03, mieDirectionalG: 0.7 },
    ocean: { distortionScale: 7, size: 2, waterColor: 0x04121a },
    lightning: { enabled: true, color: [0.7, 0.8, 1], intensity: 25, frequency: 0.7, radius: 160, duration: 1 },
    exposure: 0.35,
  },

  Toxic: {
    cloud: {
      uDensity: 1.6,
      uCoverage: 0.8,
      uDetailSize: 30,
      uDetailStrength: 0.55,
      uEvolution: 0.02,
      uFlowStrength: 90,
      uFlowScale: 70,
      uFlowSpeed: 0.9,
      uFlowTurbulence: 1.4,
      uFlowDetail: 2.5,
      uSunColor: [0.75, 1, 0.3],
      uSunIntensity: 3,
      uAmbientTop: [0.35, 0.85, 0.15],
      uAmbientBottom: [0.12, 0.25, 0.03],
      uAmbientIntensity: 0.9,
      uCloudColor: [0.55, 1, 0.35],
      uPhaseG1: 0.75,
      uPowder: 0.3,
      uMultiScatter: 0.8,
    },
    sun: { elevation: 12, azimuth: 70, autoSunColor: false },
    sky: { turbidity: 12, rayleigh: 0.9, mieCoefficient: 0.025, mieDirectionalG: 0.95 },
    ocean: { distortionScale: 2, waterColor: 0x1b2a02 },
    lightning: { enabled: true, color: [0.75, 0.2, 1], intensity: 18, frequency: 1.2, radius: 110, duration: 0.7 },
    exposure: 0.55,
  },

  Sunset: {
    cloud: {
      uCoverage: 0.7,
      uSunIntensity: 3.5,
      uAmbientTop: [0.5, 0.4, 0.55],
      uAmbientBottom: [0.25, 0.15, 0.15],
      uPhaseG1: 0.7,
    },
    sun: { elevation: 2.5, azimuth: 70 },
    sky: { turbidity: 8, rayleigh: 2.5 },
    exposure: 0.45,
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS;

export interface PresetTargets {
  renderer: WebGLRenderer;
  sky: Sky;
  water: Water;
  cloud: Cloud;
  lightning: Lightning;
  params: SimParams;
  /** recomputes sun direction (and automatic sun color) from params.sun */
  onSunChange: () => void;
}

function setUniform(target: { value: unknown }, v: number | Vec3 | Color | Vector3) {
  if (typeof target.value === 'number') target.value = v;
  else if (Array.isArray(v)) (target.value as Color | Vector3).fromArray(v);
  else (target.value as { copy(o: unknown): void }).copy(v);
}

export function applyPreset(name: PresetName, t: PresetTargets) {
  const p: Preset = PRESETS[name];

  const defaults = createCloudUniforms();
  for (const key of Object.keys(defaults) as (keyof CloudUniforms)[]) {
    if (NON_PRESET_UNIFORMS.has(key)) continue;
    setUniform(t.cloud.uniforms[key], p.cloud?.[key] ?? (defaults[key].value as number | Color | Vector3));
  }

  const volume = { ...BASE.volume, ...p.volume };
  t.cloud.position.fromArray(volume.position);
  t.cloud.size.fromArray(volume.size);

  const sky = { ...BASE.sky, ...p.sky };
  const skyU = t.sky.material.uniforms;
  for (const [k, v] of Object.entries(sky)) skyU[k].value = v;

  const ocean = { ...BASE.ocean, ...p.ocean };
  const waterU = t.water.material.uniforms;
  waterU.distortionScale.value = ocean.distortionScale;
  waterU.size.value = ocean.size;
  waterU.waterColor.value.setHex(ocean.waterColor);

  const { color, ...lightning } = { ...createLightningSettings(), ...p.lightning };
  Object.assign(t.lightning.settings, lightning);
  setUniform({ value: t.lightning.settings.color }, color);

  t.renderer.toneMappingExposure = p.exposure ?? BASE.exposure;

  const { autoSunColor, ...sun } = { ...BASE.sun, ...p.sun };
  Object.assign(t.params.sun, sun);
  t.params.autoSunColor = autoSunColor;
  t.onSunChange();
}
