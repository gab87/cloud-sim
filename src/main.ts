import './style.css';
import {
  ACESFilmicToneMapping,
  Color,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Cloud } from './cloud/Cloud';
import { Lightning } from './cloud/Lightning';
import { createGui, type SimParams } from './gui';
import { createOcean } from './scene/ocean';
import { createSky, sunDirectionFrom } from './scene/sky';

const container = document.querySelector<HTMLDivElement>('#app')!;

const params: SimParams = {
  sun: { elevation: 18, azimuth: 55 },
  autoSunColor: true,
  timeScale: 1,
  paused: false,
  seed: 1,
  pixelRatio: Math.min(window.devicePixelRatio, 1.5),
};

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(params.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
container.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
camera.position.set(0, 40, 750);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 200, 0);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 50;
controls.maxDistance = 5000;
controls.enableDamping = true;
controls.update();

const sunDir = new Vector3();
const sky = createSky();
const water = createOcean(sunDir);
const cloud = new Cloud();
const lightning = new Lightning(cloud);
scene.add(sky, water, cloud);

const warmSun = new Color(1.0, 0.55, 0.3);
const whiteSun = new Color(1.0, 0.97, 0.92);

function updateSun() {
  sunDirectionFrom(params.sun, sunDir);
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  water.material.uniforms.sunDirection.value.copy(sunDir).normalize();
  if (params.autoSunColor) {
    const t = MathUtils.smoothstep(sunDir.y, -0.05, 0.4);
    cloud.uniforms.uSunColor.value.lerpColors(warmSun, whiteSun, t);
  }
}
updateSun();

createGui({
  renderer,
  sky,
  water,
  cloud,
  lightning,
  params,
  onSunChange: updateSun,
  onPixelRatioChange: () => renderer.setPixelRatio(params.pixelRatio),
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const loader = document.querySelector<HTMLDivElement>('#loader');
let cloudReady = false;
cloud.ready.then(() => (cloudReady = true));

function hideLoader() {
  if (!loader) return;
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  loader.classList.add('hidden');
}

const timer = new Timer();
timer.connect(document);
let simTime = 0;

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1);
  const simDt = params.paused ? 0 : dt * params.timeScale;
  simTime += simDt;
  controls.update();
  cloud.update(simTime, sunDir);
  lightning.update(simDt);
  sky.material.uniforms.time.value = simTime;
  water.material.uniforms.time.value = simTime;
  renderer.render(scene, camera);
  // fade out only after the first frame that actually contains the cloud
  if (cloudReady) {
    cloudReady = false;
    requestAnimationFrame(hideLoader);
  }
});
