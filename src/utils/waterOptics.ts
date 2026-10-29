import * as THREE from 'three';

/** Authored inland-water absorption per metre, in linear RGB. */
export const WATER_ABSORPTION = [0.85, 0.38, 0.22] as const;
export const WATER_POLISH_GAIN = { value: 1 };
/** Same-frame isolation of the finer junction finish; no extra water clock. */
export const WATER_CRAFT_GAIN = { value: 1 };

/** Actual submerged thickness/view path, not UV colour pretending to be alpha.
 * Working if deeper/grazing water transmits less and foam is more opaque.
 */
export function waterTransmission(depthMetres: number, facing: number, foam = 0): number {
  const path = Math.max(0, depthMetres) / Math.max(0.2, Math.abs(facing));
  const t = WATER_ABSORPTION.map((k) => Math.exp(-k * path));
  return (
    Math.min(0.68, (0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]) * 0.72) *
    (1 - THREE.MathUtils.clamp(foam, 0, 1))
  );
}

/** Filtered world-space aeration, only evaluated inside the existing landing.
 * The jet bends into the east-going river; no foam stripes at segment ends.
 */
export const JUNCTION_FROTH_GLSL = /* glsl */ `
float millosJunctionFroth(vec2 world, vec4 impact, float time, float speed, float craft) {
  float footprint = max(fwidth(world.x),fwidth(world.y));
  float run = impact.y - world.y;
  if (run < -0.15 || run > impact.w * 2.4) return 0.0;
  float bend = smoothstep(0.6, impact.w * 2.0, run);
  float across = world.x - impact.x - max(run,0.0) * bend * 0.42;
  float width = impact.z + max(run,0.0) * 0.21;
  if (abs(across) > width + 0.7) return 0.0;
  float t = time * speed;
  vec2 flow = vec2(across + sin(run*.7-t*.65)*.26, run-t*1.15);
  // Opposite-signed swirls deform the flow, never a rotating solid disc.
  float curl = sin(flow.y*.85+sin(flow.x*.57)*1.7)*.6;
  flow.x += curl * smoothstep(.3,3.0,run);
  float macro = millosWaterNoise(flow*.65) * .62 + millosWaterNoise(flow*1.7+5.4)*.38;
  float detail = 1.0-smoothstep(.035,.14,footprint);
  float cells = millosWaterNoise(flow*10.0 + vec2(sin(flow.y*2.1),cos(flow.x*2.4))*.7);
  float lace = mix(.55,smoothstep(.29,.63,cells),detail);
  float margin = 1.0-smoothstep(width-.65,width+.5,abs(across));
  float life = 1.0-smoothstep(impact.w*.55,impact.w*2.4,run);
  float impactAir = (1.0-smoothstep(0.0,.9,abs(run)))*.83;
  float tongues = smoothstep(.30,.69,macro) * lace * .7;
  float previous = clamp((impactAir + tongues * smoothstep(.1,.8,run)) * margin * life,0.0,.95);
  if (craft <= 0.0) return previous;
  // Metre-space rafts leave open water between them. Small bubble rims break
  // their edges instead of covering the entire runout in equal-sized spots.
  vec2 raft = flow + vec2(sin(flow.y*.56)*.45, sin(flow.x*.8)*.25);
  float pockets = millosWaterNoise(raft*1.25 + 3.8);
  float raftBody = smoothstep(.38,.68,macro*.6+pockets*.4);
  float bubbleField = millosWaterNoise(raft*7.5);
  float rimWidth = max(.045,footprint*7.5);
  float rims = 1.0-smoothstep(rimWidth,rimWidth+.10,abs(bubbleField-.51));
  float bubbleFilter = 1.0-smoothstep(.025,.10,footprint);
  float laceRims = mix(.42,rims,bubbleFilter);
  float tornMargin = 1.0-smoothstep(width-.45,width+.3,
    abs(across)+(pockets-.5)*.9);
  float freshAir = impactAir * (.72+.28*laceRims);
  float trailing = raftBody * (.24+laceRims*.58) * smoothstep(.15,1.2,run);
  float refined = clamp((freshAir+trailing)*tornMargin*life,0.0,.94);
  return mix(previous,refined,craft);
}
`;
