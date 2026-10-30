import { PlaneGeometry, RepeatWrapping, TextureLoader, Vector3 } from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

export function createOcean(sunDirection: Vector3) {
  const waterNormals = new TextureLoader().load('/textures/waternormals.jpg', (t) => {
    t.wrapS = t.wrapT = RepeatWrapping;
  });
  const water = new Water(new PlaneGeometry(10000, 10000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals,
    sunDirection: sunDirection.clone(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
  });
  water.rotation.x = -Math.PI / 2;
  return water;
}
