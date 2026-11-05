import {
  BackSide,
  BoxGeometry,
  Color,
  Data3DTexture,
  GLSL3,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import vertexShader from './shaders/cloud.vert.glsl?raw';
import fragmentShader from './shaders/cloud.frag.glsl?raw';
import { createCloudNoiseTexture } from './noise';

export function createCloudUniforms() {
  return {
    uNoise: { value: null as Data3DTexture | null },
    uBoxMin: { value: new Vector3() },
    uBoxMax: { value: new Vector3() },
    uEnvMin: { value: new Vector3() },
    uEnvMax: { value: new Vector3() },
    uGroundHeight: { value: 0 },
    uTime: { value: 0 },

    uDensity: { value: 1.0 },
    uCoverage: { value: 0.75 },
    uShapeSize: { value: 220 },
    uDetailSize: { value: 45 },
    uDetailStrength: { value: 0.35 },
    uEdgeFalloff: { value: 0.45 },
    uBottomFlatness: { value: 2.2 },
    uTopRoundness: { value: 1.0 },

    uWind: { value: new Vector3(4, 0, 0) },
    uEvolution: { value: 0.003 },

    uFlowStrength: { value: 30 },
    uFlowScale: { value: 90 },
    uFlowSpeed: { value: 0.25 },
    uFlowTurbulence: { value: 0.5 },
    uFlowDetail: { value: 1.6 },
    uFlowEnvelope: { value: 0.4 },

    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color(1, 1, 1) },
    uSunIntensity: { value: 2.5 },
    uAmbientTop: { value: new Color(0.55, 0.65, 0.85) },
    uAmbientBottom: { value: new Color(0.25, 0.28, 0.35) },
    uAmbientIntensity: { value: 0.8 },
    uCloudColor: { value: new Color(1, 1, 1) },
    uAbsorption: { value: 0.06 },
    uLightAbsorption: { value: 0.04 },
    uPhaseG1: { value: 0.6 },
    uPhaseG2: { value: -0.3 },
    uPhaseBlend: { value: 0.3 },
    uPowder: { value: 0.5 },
    uMultiScatter: { value: 0.6 },

    uLightningPos: { value: new Vector3() },
    uLightningColor: { value: new Color(0.75, 0.8, 1) },
    uLightningIntensity: { value: 0 },
    uLightningRadius: { value: 140 },

    uSteps: { value: 96 },
    uLightSteps: { value: 6 },
    uJitter: { value: 1.0 },
  };
}

export type CloudUniforms = ReturnType<typeof createCloudUniforms>;

export class Cloud extends Mesh<BoxGeometry, ShaderMaterial> {
  readonly uniforms: CloudUniforms;
  /** Resolves when the first noise texture is ready and the cloud becomes visible. */
  readonly ready: Promise<void>;
  /**
   * Size of the cloud envelope (what the user tunes). The mesh scale — i.e. the raymarching
   * bounds — is derived from it in update(), padded so the cloud is never clipped by the box.
   */
  readonly size = new Vector3();

  constructor() {
    const uniforms = createCloudUniforms();
    super(
      new BoxGeometry(1, 1, 1),
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        side: BackSide,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        // occlusion by the sea is handled in the shader (uGroundHeight)
        depthTest: false,
      }),
    );
    this.uniforms = uniforms;
    this.position.set(0, 230, 0);
    this.size.set(480, 240, 340);
    this.visible = false;
    this.ready = this.loadNoise();
  }

  private loadNoise(size = 128, seed = 1) {
    return new Promise<void>((resolve) => {
      const worker = new Worker(new URL('./noise.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<Uint8Array>) => {
        this.uniforms.uNoise.value?.dispose();
        this.uniforms.uNoise.value = createCloudNoiseTexture(e.data, size);
        this.visible = true;
        worker.terminate();
        resolve();
      };
      worker.postMessage({ size, seed });
    });
  }

  regenerate(seed: number) {
    this.loadNoise(128, seed);
  }

  update(time: number, sunDir: Vector3) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uSunDir.value.copy(sunDir);

    const half = this.size.clone().multiplyScalar(0.5);
    u.uEnvMin.value.copy(this.position).sub(half);
    u.uEnvMax.value.copy(this.position).add(half);

    // Raymarching bounds = envelope + everything that can push density outside of it:
    // - the envelope is an ellipsoid stretched vertically by 1/topRoundness (top) and
    //   1/bottomFlatness (bottom), so it can exceed the nominal height
    // - the flow field displaces the envelope by up to |v| * flowStrength * envelopeWarp;
    //   each component of the curl field is <= ~0.99, so |v| <= sqrt(3) * 0.99 < 1.75
    // plus a small safety margin for the soft edge.
    const margin = 1.75 * Math.abs(u.uFlowStrength.value * u.uFlowEnvelope.value) + 0.05 * this.size.length();
    const yExtent = half.y / Math.min(u.uTopRoundness.value, u.uBottomFlatness.value, 1);
    this.scale.set(2 * (half.x + margin), 2 * (yExtent + margin), 2 * (half.z + margin));
    u.uBoxMin.value.copy(this.position).addScaledVector(this.scale, -0.5);
    u.uBoxMax.value.copy(this.position).addScaledVector(this.scale, 0.5);
  }
}
