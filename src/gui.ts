import GUI from 'lil-gui';
import { applyPreset, PRESETS, type PresetName, type PresetTargets } from './presets';
import type { SunParams } from './scene/sky';

export interface SimParams {
  sun: SunParams;
  autoSunColor: boolean;
  timeScale: number;
  paused: boolean;
  seed: number;
  pixelRatio: number;
}

interface GuiDeps extends PresetTargets {
  onPixelRatioChange: () => void;
}

export function createGui(deps: GuiDeps) {
  const { renderer, sky, water, cloud, lightning, params, onSunChange, onPixelRatioChange } = deps;
  const gui = new GUI({ title: 'Cloud Simulator' });
  const u = cloud.uniforms;

  const presetState = { preset: 'Clear' as PresetName };
  const presets = gui.addFolder('Presets');
  presets
    .add(presetState, 'preset', Object.keys(PRESETS))
    .name('preset')
    .onChange((name: PresetName) => {
      applyPreset(name, deps);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    });

  const shape = gui.addFolder('Cloud shape');
  shape.add(u.uDensity, 'value', 0, 4, 0.01).name('density');
  shape.add(u.uCoverage, 'value', 0, 1, 0.001).name('coverage');
  shape.add(u.uShapeSize, 'value', 20, 800, 1).name('shape size');
  shape.add(u.uDetailSize, 'value', 5, 200, 1).name('detail size');
  shape.add(u.uDetailStrength, 'value', 0, 1, 0.01).name('detail erosion');
  shape.add(u.uEdgeFalloff, 'value', 0.01, 1, 0.01).name('edge falloff');
  shape.add(u.uBottomFlatness, 'value', 1, 5, 0.01).name('bottom flatness');
  shape.add(u.uTopRoundness, 'value', 0.5, 2, 0.01).name('top roundness');
  shape.add(params, 'seed', 1, 999, 1).name('noise seed').onFinishChange((s: number) => cloud.regenerate(s));

  const box = gui.addFolder('Cloud volume').close();
  box.add(cloud.position, 'x', -1000, 1000, 1).name('pos x');
  box.add(cloud.position, 'y', 20, 1000, 1).name('pos y');
  box.add(cloud.position, 'z', -1000, 1000, 1).name('pos z');
  box.add(cloud.size, 'x', 10, 1500, 1).name('size x');
  box.add(cloud.size, 'y', 10, 800, 1).name('size y');
  box.add(cloud.size, 'z', 10, 1500, 1).name('size z');

  const light = gui.addFolder('Cloud lighting');
  light.addColor(u.uCloudColor, 'value').name('albedo');
  light.add(u.uAbsorption, 'value', 0.001, 0.5, 0.001).name('extinction');
  light.add(u.uLightAbsorption, 'value', 0.001, 0.5, 0.001).name('light absorption');
  light.add(u.uSunIntensity, 'value', 0, 20, 0.1).name('sun intensity');
  light.addColor(u.uSunColor, 'value').name('sun color').listen();
  light.add(params, 'autoSunColor').name('auto sun color').onChange(onSunChange);
  light.add(u.uAmbientIntensity, 'value', 0, 4, 0.01).name('ambient intensity');
  light.addColor(u.uAmbientTop, 'value').name('ambient top');
  light.addColor(u.uAmbientBottom, 'value').name('ambient bottom');
  light.add(u.uPhaseG1, 'value', -0.99, 0.99, 0.01).name('phase g forward');
  light.add(u.uPhaseG2, 'value', -0.99, 0.99, 0.01).name('phase g back');
  light.add(u.uPhaseBlend, 'value', 0, 1, 0.01).name('phase blend');
  light.add(u.uPowder, 'value', 0, 1, 0.01).name('powder');
  light.add(u.uMultiScatter, 'value', 0, 1, 0.01).name('multi scatter');

  const sim = gui.addFolder('Wind / simulation');
  sim.add(u.uWind.value, 'x', -50, 50, 0.1).name('wind x');
  sim.add(u.uWind.value, 'y', -20, 20, 0.1).name('wind y');
  sim.add(u.uWind.value, 'z', -50, 50, 0.1).name('wind z');
  sim.add(u.uEvolution, 'value', 0, 0.05, 0.0005).name('evolution');
  sim.add(params, 'timeScale', 0, 10, 0.1).name('time scale');
  sim.add(params, 'paused');

  const flow = gui.addFolder('Flow field');
  flow.add(u.uFlowStrength, 'value', 0, 150, 0.5).name('strength');
  flow.add(u.uFlowScale, 'value', 10, 500, 1).name('scale');
  flow.add(u.uFlowSpeed, 'value', 0, 2, 0.01).name('speed');
  flow.add(u.uFlowTurbulence, 'value', 0, 2, 0.01).name('turbulence');
  flow.add(u.uFlowDetail, 'value', 0, 4, 0.01).name('detail warp');
  flow.add(u.uFlowEnvelope, 'value', 0, 1, 0.01).name('envelope warp');

  const ls = lightning.settings;
  const bolt = gui.addFolder('Lightning');
  bolt.add(ls, 'enabled');
  bolt.addColor(ls, 'color');
  bolt.add(ls, 'intensity', 0, 100, 0.5);
  bolt.add(ls, 'frequency', 0, 5, 0.05).name('flashes / sec');
  bolt.add(ls, 'radius', 10, 600, 1).name('light radius');
  bolt.add(ls, 'duration', 0.2, 4, 0.05).name('strobe duration');
  bolt.add({ flash: () => lightning.trigger() }, 'flash').name('flash now');

  const skyU = sky.material.uniforms;
  const sun = gui.addFolder('Sun / sky').close();
  sun.add(params.sun, 'elevation', -5, 90, 0.1).onChange(onSunChange);
  sun.add(params.sun, 'azimuth', -180, 180, 0.1).onChange(onSunChange);
  sun.add(skyU.turbidity, 'value', 0, 20, 0.1).name('turbidity');
  sun.add(skyU.rayleigh, 'value', 0, 4, 0.001).name('rayleigh');
  sun.add(skyU.mieCoefficient, 'value', 0, 0.1, 0.001).name('mie coefficient');
  sun.add(skyU.mieDirectionalG, 'value', 0, 1, 0.001).name('mie directional G');
  sun.add(skyU.cloudCoverage, 'value', 0, 1, 0.01).name('sky clouds');

  const waterU = water.material.uniforms;
  const ocean = gui.addFolder('Ocean').close();
  ocean.add(waterU.distortionScale, 'value', 0, 8, 0.1).name('distortion');
  ocean.add(waterU.size, 'value', 0.1, 10, 0.1).name('wave size');
  ocean.addColor(waterU.waterColor, 'value').name('water color');
  ocean.add(water, 'visible').name('visible');

  const render = gui.addFolder('Render').close();
  render.add(renderer, 'toneMappingExposure', 0.05, 2, 0.01).name('exposure');
  render.add(params, 'pixelRatio', 0.25, 2, 0.05).name('pixel ratio').onChange(onPixelRatioChange);
  render.add(u.uSteps, 'value', 8, 256, 1).name('march steps');
  render.add(u.uLightSteps, 'value', 1, 32, 1).name('light steps');
  render.add(u.uJitter, 'value', 0, 1, 0.01).name('jitter');

  return gui;
}
