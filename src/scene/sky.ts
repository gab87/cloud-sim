import { MathUtils, Vector3 } from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SunParams {
  elevation: number;
  azimuth: number;
}

export function createSky() {
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.5;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;
  u.cloudCoverage.value = 0;
  return sky;
}

export function sunDirectionFrom({ elevation, azimuth }: SunParams, target = new Vector3()) {
  const phi = MathUtils.degToRad(90 - elevation);
  const theta = MathUtils.degToRad(azimuth);
  return target.setFromSphericalCoords(1, phi, theta);
}
