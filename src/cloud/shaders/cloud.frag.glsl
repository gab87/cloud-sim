precision highp float;
precision highp sampler3D;

#define MAX_STEPS 256
#define MAX_LIGHT_STEPS 32
#define PI 3.14159265359

in vec3 vWorldPos;
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor

uniform sampler3D uNoise;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uGroundHeight;
uniform float uTime;

// shape
uniform float uDensity;
uniform float uCoverage;
uniform float uShapeSize;
uniform float uDetailSize;
uniform float uDetailStrength;
uniform float uEdgeFalloff;
uniform float uBottomFlatness;
uniform float uTopRoundness;

// motion
uniform vec3 uWind;
uniform float uEvolution;

// flow field
uniform float uFlowStrength;
uniform float uFlowScale;
uniform float uFlowSpeed;
uniform float uFlowTurbulence;
uniform float uFlowDetail;
uniform float uFlowEnvelope;

// lighting
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientTop;
uniform vec3 uAmbientBottom;
uniform float uAmbientIntensity;
uniform vec3 uCloudColor;
uniform float uAbsorption;
uniform float uLightAbsorption;
uniform float uPhaseG1;
uniform float uPhaseG2;
uniform float uPhaseBlend;
uniform float uPowder;
uniform float uMultiScatter;

// lightning (point light inside the volume)
uniform vec3 uLightningPos;
uniform vec3 uLightningColor;
uniform float uLightningIntensity;
uniform float uLightningRadius;

// quality
uniform int uSteps;
uniform int uLightSteps;
uniform float uJitter;

float remap(float v, float a, float b, float c, float d) {
  return c + (v - a) / (b - a) * (d - c);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  // clip the volume at the ground/sea level so nothing is marched underwater
  vec3 lo = vec3(uBoxMin.x, max(uBoxMin.y, uGroundHeight), uBoxMin.z);
  vec3 t0 = (lo - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

float hg(float cosT, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
}

// Envelope of the cloud inside the box: rounded top, flat-ish bottom.
float shapeMask(vec3 uvw) {
  vec3 c = uvw * 2.0 - 1.0;
  c.y = c.y < 0.0 ? c.y * uBottomFlatness : c.y * uTopRoundness;
  float d = length(c);
  float mask = 1.0 - smoothstep(1.0 - uEdgeFalloff, 1.0, d);
  mask *= smoothstep(0.0, 0.08, uvw.y);
  return mask;
}

// Analytic curl of the vector potential
// A = (sin(y+t) + cos(1.3z-0.7t), sin(z+1.1t) + cos(1.3x+0.5t), sin(x-0.9t) + cos(1.3y+0.6t)),
// so the field is divergence-free (swirls without sources/sinks).
vec3 curlField(vec3 p, float t) {
  return vec3(
    -1.3 * sin(1.3 * p.y + 0.6 * t) - cos(p.z + 1.1 * t),
    -1.3 * sin(1.3 * p.z - 0.7 * t) - cos(p.x - 0.9 * t),
    -1.3 * sin(1.3 * p.x + 0.5 * t) - cos(p.y + t)
  ) * 0.43;
}

const mat3 FLOW_ROT = mat3(
  0.00, 0.80, 0.60,
  -0.80, 0.36, -0.48,
  -0.60, -0.48, 0.64
);

// Two octaves; the second is rotated (and rotated back) so the sum stays divergence-free.
vec3 flowField(vec3 p) {
  float t = uTime * uFlowSpeed;
  vec3 q = p / uFlowScale;
  vec3 v = curlField(q, t);
  v += transpose(FLOW_ROT) * curlField(FLOW_ROT * q * 2.17 + 3.1, t * 1.7) * uFlowTurbulence;
  return v / (1.0 + uFlowTurbulence);
}

float sampleDensity(vec3 p, bool detail) {
  vec3 flow = uFlowStrength > 0.0 ? flowField(p) * uFlowStrength : vec3(0.0);

  vec3 size = uBoxMax - uBoxMin;
  vec3 uvw = (p + flow * uFlowEnvelope - uBoxMin) / size;
  float mask = shapeMask(uvw);
  if (mask <= 0.0) return 0.0;

  vec3 drift = uWind * uTime;
  vec3 evo = vec3(0.0, uTime * uEvolution, 0.0);
  float base = texture(uNoise, (p + flow - drift) / uShapeSize + evo).r;

  // coverage shrinks towards the edges of the envelope
  float cov = uCoverage * mask;
  float d = clamp(remap(base, 1.0 - cov, 1.0, 0.0, 1.0), 0.0, 1.0);
  d *= mask;
  if (d <= 0.0) return 0.0;

  if (detail) {
    float hf = texture(uNoise, (p + flow * uFlowDetail - drift * 1.5) / uDetailSize - evo * 2.0).g;
    // erode more at the bottom (wispy), less at the top (billowy)
    float er = mix(hf, 1.0 - hf, clamp(uvw.y * 2.0, 0.0, 1.0));
    d = clamp(remap(d, er * uDetailStrength, 1.0, 0.0, 1.0), 0.0, 1.0);
  }
  return d * uDensity;
}

float lightMarch(vec3 p) {
  vec2 t = boxHit(p, uSunDir);
  float len = max(t.y, 0.0);
  float stepSize = len / float(uLightSteps);
  float od = 0.0;
  for (int i = 0; i < MAX_LIGHT_STEPS; i++) {
    if (i >= uLightSteps) break;
    vec3 q = p + uSunDir * stepSize * (float(i) + 0.5);
    od += sampleDensity(q, i < 2) * stepSize;
  }
  return od;
}

// Short, cheap march (no detail noise) towards the lightning so the flash is occluded by dense cloud.
float lightningMarch(vec3 p) {
  vec3 d = uLightningPos - p;
  float len = length(d);
  vec3 dir = d / max(len, 1e-3);
  float stepSize = len / 3.0;
  float od = 0.0;
  for (int i = 0; i < 3; i++) {
    od += sampleDensity(p + dir * stepSize * (float(i) + 0.5), false) * stepSize;
  }
  return od;
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  vec2 t = boxHit(ro, rd);
  t.x = max(t.x, 0.0);
  if (t.x >= t.y) discard;

  vec3 size = uBoxMax - uBoxMin;
  float stepSize = length(size) / float(uSteps);
  float jitter = hash12(gl_FragCoord.xy + fract(uTime * 17.0) * 113.0) * uJitter;
  float tt = t.x + stepSize * jitter;

  float cosT = dot(rd, uSunDir);
  float phase = mix(hg(cosT, uPhaseG1), hg(cosT, uPhaseG2), uPhaseBlend) * 4.0 * PI;

  float T = 1.0;
  vec3 L = vec3(0.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uSteps || tt > t.y) break;
    vec3 p = ro + rd * tt;
    float d = sampleDensity(p, true);
    if (d > 0.0005) {
      float od = lightMarch(p) * uLightAbsorption;
      float beer = max(exp(-od), exp(-od * 0.25) * uMultiScatter);
      float powder = mix(1.0, 1.0 - exp(-d * 4.0), uPowder);
      float h = clamp((p.y - uBoxMin.y) / size.y, 0.0, 1.0);
      vec3 ambient = mix(uAmbientBottom, uAmbientTop, h) * uAmbientIntensity;
      vec3 light = uSunColor * uSunIntensity * beer * phase * powder + ambient;

      if (uLightningIntensity > 0.001) {
        vec3 dl = p - uLightningPos;
        float att = 1.0 / (1.0 + dot(dl, dl) / (uLightningRadius * uLightningRadius));
        if (att > 0.01) {
          float odL = lightningMarch(p) * uLightAbsorption;
          light += uLightningColor * uLightningIntensity * att * max(exp(-odL), exp(-odL * 0.25) * uMultiScatter);
        }
      }

      float sigmaE = max(d * uAbsorption, 1e-5);
      float sampleT = exp(-sigmaE * stepSize);
      vec3 S = light * uCloudColor * sigmaE;
      L += T * (S - S * sampleT) / sigmaE;
      T *= sampleT;
      if (T < 0.01) break;
    }
    tt += stepSize;
  }

  float alpha = 1.0 - T;
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(L, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
