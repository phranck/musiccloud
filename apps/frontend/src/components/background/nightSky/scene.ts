import { packCatalogAttributes, STAR_CATALOG } from "./catalog";
import type { NightSkySettings } from "./settings";

/**
 * WebGL2 night-sky scene (plan MC-029 Phase 4) — the production port of the
 * user-approved `background-prototype.html`. Three passes per frame:
 *
 *   A) fullscreen quad: sky gradient (night↔day blend) + procedural faint
 *      fill stars rotating around Polaris;
 *   B) additive point sprites: the 67 real catalog stars (Big Dipper,
 *      Cassiopeia, Vega … — correct chirality, Polaris at the pivot);
 *   C) alpha-blended fullscreen quad: domain-warped, time-evolving fbm
 *      clouds with moon/sun rim light, vignette and dithering.
 *
 * The shader sources are a 1:1 port of the prototype (look parity is the
 * contract). The scene reads a LIVE settings object shared with the
 * `NightSkyDriver` and renders the current values each draw; runs unchanged
 * in the worker (OffscreenCanvas) and in the main-thread fallback.
 *
 * Zero-allocation contract (policy 7): `draw()` writes uniforms from cached
 * primitives and pre-parsed color arrays — no allocations per frame. Colors
 * are parsed once at creation (production settings are immutable at runtime).
 */

/** Minimal canvas surface the scene renders into (DOM canvas or OffscreenCanvas). */
export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Public surface of the night-sky scene. */
export interface NightSkyScene {
  /** Renders one frame at the given animation time (seconds). */
  draw(simTimeSeconds: number): void;
  /** Resizes the drawing buffer (CSS size × pixelScale) and the viewport. */
  resize(cssWidth: number, cssHeight: number, pixelScale: number): void;
  /** Releases the GL context and buffers (unmount/terminate). */
  dispose(): void;
}

/** Optional hooks of {@link createNightSkyScene}. */
export interface NightSkySceneOptions {
  /** Called when the WebGL context is lost (embedder falls back to the CSS layer). */
  onContextLost?: () => void;
}

/* ── Shared GLSL chunks (single source for quad + point shaders) ────────── */

const GLSL_HASH = `
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}`;

/** 3D value noise (xy = position, z = time → clouds EVOLVE, not just drift) + fbm. */
const GLSL_NOISE = `
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}
float fbm(vec3 p, float octaves) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 7; i++) {
    if (float(i) >= octaves) break;
    v += amp * vnoise(p);
    p = p * 2.03 + vec3(11.7, 5.3, 0.0);
    amp *= 0.5;
  }
  return v;
}`;

/** Cloud field — identical math in the cloud quad (per pixel) and the star pass (per vertex). */
const GLSL_CLOUD_FIELD = `
uniform float u_cloudScale;
uniform float u_cloudCoverage;
uniform float u_cloudSoftness;
uniform float u_cloudDetail;
uniform float u_clearZones;
uniform float u_warpStrength;
uniform float u_windSpeed;
uniform float u_windAngle;
uniform float u_evolveSpeed;

float cloudRaw(vec2 cuv, float t, out vec3 cpOut, out vec2 p2Out, out float tzOut) {
  float wa = radians(u_windAngle);
  vec2 wind = vec2(cos(wa), sin(wa)) * u_windSpeed * t;
  vec2 p2 = cuv * u_cloudScale + wind;
  float tz = t * u_evolveSpeed;
  vec2 warp = vec2(
    fbm(vec3(p2 * 0.9 + 13.1, tz * 0.7), 3.0),
    fbm(vec3(p2 * 0.9 + 41.7, tz * 0.7), 3.0)
  ) - 0.5;
  cpOut = vec3(p2 + warp * u_warpStrength, tz);
  p2Out = p2;
  tzOut = tz;
  return fbm(cpOut, u_cloudDetail);
}
float cloudMask(float n, vec2 p2, float tz) {
  float cloud = smoothstep(1.0 - u_cloudCoverage - u_cloudSoftness,
                           1.0 - u_cloudCoverage + u_cloudSoftness, n);
  // Macro zones carve CLEAR sky windows between the banks (unwarped domain,
  // 0.3× the formation frequency = large smooth regions).
  float macroN = fbm(vec3(p2 * 0.3 + 71.3, tz * 0.4), 3.0);
  return cloud * mix(1.0, smoothstep(0.36, 0.6, macroN), u_clearZones);
}`;

const GLSL_VIGNETTE = `
uniform float u_vignette;
float vignetteAt(vec2 cuv) {
  return 1.0 - u_vignette * smoothstep(0.45, 1.25, length(cuv) * 1.15);
}`;

/** Oversized triangle covers the viewport without a vertex buffer. */
const QUAD_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/** Pass A: sky gradient (night↔day) + procedural fill stars. */
const SKY_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_skyTop;
uniform vec3  u_skyBottom;
uniform vec3  u_skyTopDay;
uniform vec3  u_skyBottomDay;
uniform float u_dayness;
uniform vec2  u_polaris;
uniform float u_theta;
uniform float u_starDensity;
uniform float u_starSize;
uniform float u_starBrightness;
uniform float u_twinkleAmount;
uniform float u_twinkleSpeed;

#define TAU 6.28318530718
${GLSL_HASH}
${GLSL_VIGNETTE}

mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

float starLayer(vec2 uv, float density, float sizePx, float brightMul) {
  vec2 g = uv * density;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float h = hash21(id);
  float present = step(h, 0.22);
  vec2 pos = vec2(hash21(id + 7.1), hash21(id + 3.7)) * 0.6 + 0.2;
  float distPx = length(f - pos) * (u_resolution.y / density);
  float star = smoothstep(sizePx, sizePx * 0.15, distPx);
  float mag = pow(hash21(id + 13.3), 3.0);
  float tw = 1.0 + u_twinkleAmount * sin(u_time * u_twinkleSpeed * (0.5 + h * 2.0) + h * TAU);
  return star * present * mag * brightMul * tw;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);

  vec3 night = mix(u_skyBottom, u_skyTop, smoothstep(0.0, 1.0, uv.y));
  vec3 day   = mix(u_skyBottomDay, u_skyTopDay, smoothstep(0.0, 1.0, uv.y));
  vec3 col = mix(night, day, u_dayness);

  // Daylight washes the stars out EARLY in the transition (like real dawn).
  float starVis = 1.0 - smoothstep(0.05, 0.45, u_dayness);
  vec2 suv = rot2(u_theta) * (cuv - u_polaris);
  float stars = 0.0;
  stars += starLayer(suv,        u_starDensity,        u_starSize,       1.0);
  stars += starLayer(suv + 31.7, u_starDensity * 0.35, u_starSize * 1.5, 1.4);
  stars *= u_starBrightness * starVis;
  col += vec3(0.85, 0.92, 1.0) * stars;

  col *= vignetteAt(cuv);
  col += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

/** Pass B vertex: catalog star projection (angle = -RA keeps constellations unmirrored). */
const STAR_VERT = `#version 300 es
precision highp float;
in vec4 a_star; // x: polar dist (deg), y: -RA (rad), z: Vmag, w: colorClass

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_polaris;
uniform float u_theta;
uniform float u_skyFov;
uniform float u_catalogSize;
uniform float u_catalogBrightness;
uniform float u_twinkleAmount;
uniform float u_twinkleSpeed;
uniform float u_starOcclusion;
uniform float u_sizeScale;
uniform float u_dayness;

out float v_alpha;
out vec3  v_color;

#define TAU 6.28318530718
${GLSL_HASH}
${GLSL_NOISE}
${GLSL_CLOUD_FIELD}
${GLSL_VIGNETTE}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  float angle = a_star.y + u_theta;
  float r = a_star.x / u_skyFov;
  vec2 cuv = u_polaris + vec2(cos(angle), sin(angle)) * r;

  gl_Position = vec4(cuv.x * 2.0 / aspect, cuv.y * 2.0, 0.0, 1.0);

  float m = a_star.z;
  float sizeCss = u_catalogSize * (0.9 + (4.2 - m) * 0.55);
  gl_PointSize = max(sizeCss * u_sizeScale, 1.0);

  float seed = fract(a_star.y * 13.37 + a_star.x * 7.7);
  float tw = 1.0 + u_twinkleAmount * 0.6 * sin(u_time * u_twinkleSpeed * (0.6 + seed * 1.8) + seed * TAU);
  float bright = clamp(0.18 + (4.2 - m) * 0.26, 0.0, 1.3) * u_catalogBrightness * tw;

  // One cloud-field sample per star: bright stars fade behind the banks
  // even though the cloud layer itself is translucent.
  vec3 cp; vec2 p2; float tz;
  float n = cloudRaw(cuv, u_time, cp, p2, tz);
  float cloud = cloudMask(n, p2, tz);
  bright *= 1.0 - clamp(cloud * u_starOcclusion, 0.0, 1.0);
  bright *= 1.0 - smoothstep(0.05, 0.45, u_dayness);

  v_alpha = bright * vignetteAt(cuv);

  vec3 blueWhite = vec3(0.72, 0.82, 1.00);
  vec3 white     = vec3(0.95, 0.97, 1.00);
  vec3 warm      = vec3(1.00, 0.86, 0.68);
  v_color = (a_star.w < 0.5) ? blueWhite : (a_star.w < 1.5) ? white : warm;
}`;

/** Pass B fragment: soft round core + faint halo, additive. */
const STAR_FRAG = `#version 300 es
precision highp float;
in float v_alpha;
in vec3  v_color;
out vec4 outColor;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.15, d);
  float halo = smoothstep(1.0, 0.0, d) * 0.25;
  outColor = vec4(v_color * v_alpha * (core + halo), 1.0);
}`;

/** Pass C: clouds with moon/sun rim light, alpha-blended on top. */
const CLOUD_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_cloudColor;
uniform vec3  u_cloudColorDay;
uniform float u_cloudOpacity;
uniform float u_moonIntensity;
uniform float u_moonAngle;
uniform float u_sunIntensity;
uniform float u_sunAngle;
uniform float u_dayness;

${GLSL_HASH}
${GLSL_NOISE}
${GLSL_CLOUD_FIELD}
${GLSL_VIGNETTE}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);

  vec3 cp; vec2 p2; float tz;
  float n = cloudRaw(cuv, u_time, cp, p2, tz);
  float cloud = cloudMask(n, p2, tz);

  // Rim light: re-sample a small step toward the active light source
  // (moon by night, sun by day — the direction blends through the transition).
  float laM = radians(u_moonAngle);
  float laS = radians(u_sunAngle);
  vec2 ldir = normalize(mix(vec2(cos(laM), sin(laM)), vec2(cos(laS), sin(laS)), u_dayness));
  float nL = fbm(vec3(cp.xy + ldir * 0.18, cp.z), min(u_cloudDetail, 4.0));
  float rim = clamp((n - nL) * 4.5, 0.0, 1.0) * cloud;

  float coreShade = smoothstep(0.4, 1.0, n) * cloud;

  vec3 nightCol = u_cloudColor + u_moonIntensity * rim * vec3(0.50, 0.56, 0.62);
  nightCol *= 1.0 - 0.42 * coreShade;

  vec3 dayCol = u_cloudColorDay + u_sunIntensity * rim * vec3(1.00, 0.97, 0.88);
  dayCol = mix(dayCol, dayCol * vec3(0.72, 0.78, 0.86), coreShade * 0.55);

  vec3 cloudCol = mix(nightCol, dayCol, u_dayness);
  cloudCol *= vignetteAt(cuv);
  cloudCol += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;

  outColor = vec4(cloudCol, cloud * u_cloudOpacity);
}`;

/** Uniform names of the shared cloud-field chunk (set on star + cloud programs). */
const CLOUD_FIELD_UNIFORMS = [
  "u_cloudScale",
  "u_cloudCoverage",
  "u_cloudSoftness",
  "u_cloudDetail",
  "u_clearZones",
  "u_warpStrength",
  "u_windSpeed",
  "u_windAngle",
  "u_evolveSpeed",
] as const;

/** Compiles one shader stage; throws with the info log on failure. */
function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

/** Links a program from two stages; throws with the info log on failure. */
function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram failed");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
  }
  return program;
}

/** Collects uniform locations (missing names resolve to null and are skipped on set). */
function locations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly string[],
): Record<string, WebGLUniformLocation | null> {
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) out[name] = gl.getUniformLocation(program, name);
  return out;
}

/** '#rrggbb' → pre-allocated [r, g, b] in 0..1 (parsed once — colors are static). */
function hexToRgb(hex: string): Float32Array {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
}

const TAU = Math.PI * 2;

/**
 * Creates the night-sky scene on the given canvas.
 *
 * @param canvas - DOM canvas (fallback) or OffscreenCanvas (worker).
 * @param settings - LIVE settings shared with the driver (not copied).
 * @param options - Optional context-loss hook.
 * @returns The scene, or `null` when WebGL2 is unavailable (the embedder
 *   keeps the CSS gradient layer in that case).
 */
export function createNightSkyScene(
  canvas: RenderCanvas,
  settings: NightSkySettings,
  options: NightSkySceneOptions = {},
): NightSkyScene | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    options.onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  const progSky = link(gl, QUAD_VERT, SKY_FRAG);
  const locSky = locations(gl, progSky, [
    "u_resolution",
    "u_time",
    "u_skyTop",
    "u_skyBottom",
    "u_skyTopDay",
    "u_skyBottomDay",
    "u_dayness",
    "u_polaris",
    "u_theta",
    "u_starDensity",
    "u_starSize",
    "u_starBrightness",
    "u_twinkleAmount",
    "u_twinkleSpeed",
    "u_vignette",
  ]);

  const progStar = link(gl, STAR_VERT, STAR_FRAG);
  const locStar = locations(gl, progStar, [
    "u_resolution",
    "u_time",
    "u_polaris",
    "u_theta",
    "u_skyFov",
    "u_catalogSize",
    "u_catalogBrightness",
    "u_twinkleAmount",
    "u_twinkleSpeed",
    "u_starOcclusion",
    "u_sizeScale",
    "u_vignette",
    "u_dayness",
    ...CLOUD_FIELD_UNIFORMS,
  ]);

  const progCloud = link(gl, QUAD_VERT, CLOUD_FRAG);
  const locCloud = locations(gl, progCloud, [
    "u_resolution",
    "u_time",
    "u_cloudColor",
    "u_cloudColorDay",
    "u_cloudOpacity",
    "u_moonIntensity",
    "u_moonAngle",
    "u_sunIntensity",
    "u_sunAngle",
    "u_dayness",
    "u_vignette",
    ...CLOUD_FIELD_UNIFORMS,
  ]);

  // Star attribute buffer (static — the catalog never changes).
  const starVao = gl.createVertexArray();
  gl.bindVertexArray(starVao);
  const starBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, packCatalogAttributes(), gl.STATIC_DRAW);
  const aStar = gl.getAttribLocation(progStar, "a_star");
  gl.enableVertexAttribArray(aStar);
  gl.vertexAttribPointer(aStar, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Pre-parsed colors (zero allocations in draw; settings colors are static).
  const colSkyTop = hexToRgb(settings.skyTop);
  const colSkyBottom = hexToRgb(settings.skyBottom);
  const colSkyTopDay = hexToRgb(settings.skyTopDay);
  const colSkyBottomDay = hexToRgb(settings.skyBottomDay);
  const colCloud = hexToRgb(settings.cloudColor);
  const colCloudDay = hexToRgb(settings.cloudColorDay);

  let pixelScale = 1;

  /** Sets the cloud-field uniforms shared by the star and cloud programs. */
  function setCloudFieldUniforms(loc: Record<string, WebGLUniformLocation | null>): void {
    if (!gl) return;
    gl.uniform1f(loc.u_cloudScale, settings.cloudScale);
    gl.uniform1f(loc.u_cloudCoverage, settings.cloudCoverage);
    gl.uniform1f(loc.u_cloudSoftness, settings.cloudSoftness);
    gl.uniform1f(loc.u_cloudDetail, settings.cloudDetail);
    gl.uniform1f(loc.u_clearZones, settings.clearZones);
    gl.uniform1f(loc.u_warpStrength, settings.warpStrength);
    gl.uniform1f(loc.u_windSpeed, settings.windSpeed);
    gl.uniform1f(loc.u_windAngle, settings.windAngle);
    gl.uniform1f(loc.u_evolveSpeed, settings.evolveSpeed);
  }

  return {
    draw(simTimeSeconds: number): void {
      const width = canvas.width;
      const height = canvas.height;
      const aspect = width / height;
      const polX = (settings.polarisX - 0.5) * aspect;
      const polY = settings.polarisY - 0.5;
      // Counter-clockwise, like the real northern sky seen from inside.
      const theta = (simTimeSeconds / settings.rotationPeriod) * TAU;

      // Pass A — opaque sky + fill stars.
      gl.disable(gl.BLEND);
      // biome-ignore lint/correctness/useHookAtTopLevel: WebGL2RenderingContext.useProgram is not a React hook
      gl.useProgram(progSky);
      gl.uniform2f(locSky.u_resolution, width, height);
      gl.uniform1f(locSky.u_time, simTimeSeconds);
      gl.uniform3fv(locSky.u_skyTop, colSkyTop);
      gl.uniform3fv(locSky.u_skyBottom, colSkyBottom);
      gl.uniform3fv(locSky.u_skyTopDay, colSkyTopDay);
      gl.uniform3fv(locSky.u_skyBottomDay, colSkyBottomDay);
      gl.uniform1f(locSky.u_dayness, settings.dayness);
      gl.uniform2f(locSky.u_polaris, polX, polY);
      gl.uniform1f(locSky.u_theta, theta);
      gl.uniform1f(locSky.u_starDensity, settings.starDensity);
      gl.uniform1f(locSky.u_starSize, settings.starSize * pixelScale);
      gl.uniform1f(locSky.u_starBrightness, settings.starBrightness);
      gl.uniform1f(locSky.u_twinkleAmount, settings.twinkleAmount);
      gl.uniform1f(locSky.u_twinkleSpeed, settings.twinkleSpeed);
      gl.uniform1f(locSky.u_vignette, settings.vignette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Pass B — catalog stars, additive.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      // biome-ignore lint/correctness/useHookAtTopLevel: WebGL2RenderingContext.useProgram is not a React hook
      gl.useProgram(progStar);
      gl.uniform2f(locStar.u_resolution, width, height);
      gl.uniform1f(locStar.u_time, simTimeSeconds);
      gl.uniform2f(locStar.u_polaris, polX, polY);
      gl.uniform1f(locStar.u_theta, theta);
      gl.uniform1f(locStar.u_skyFov, settings.skyFov);
      gl.uniform1f(locStar.u_catalogSize, settings.catalogSize);
      gl.uniform1f(locStar.u_catalogBrightness, settings.catalogBrightness);
      gl.uniform1f(locStar.u_twinkleAmount, settings.twinkleAmount);
      gl.uniform1f(locStar.u_twinkleSpeed, settings.twinkleSpeed);
      gl.uniform1f(locStar.u_starOcclusion, settings.starOcclusion);
      gl.uniform1f(locStar.u_sizeScale, pixelScale);
      gl.uniform1f(locStar.u_vignette, settings.vignette);
      gl.uniform1f(locStar.u_dayness, settings.dayness);
      setCloudFieldUniforms(locStar);
      gl.bindVertexArray(starVao);
      gl.drawArrays(gl.POINTS, 0, STAR_CATALOG.length);
      gl.bindVertexArray(null);

      // Pass C — clouds over everything.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      // biome-ignore lint/correctness/useHookAtTopLevel: WebGL2RenderingContext.useProgram is not a React hook
      gl.useProgram(progCloud);
      gl.uniform2f(locCloud.u_resolution, width, height);
      gl.uniform1f(locCloud.u_time, simTimeSeconds);
      gl.uniform3fv(locCloud.u_cloudColor, colCloud);
      gl.uniform3fv(locCloud.u_cloudColorDay, colCloudDay);
      gl.uniform1f(locCloud.u_cloudOpacity, settings.cloudOpacity);
      gl.uniform1f(locCloud.u_moonIntensity, settings.moonIntensity);
      gl.uniform1f(locCloud.u_moonAngle, settings.moonAngle);
      gl.uniform1f(locCloud.u_sunIntensity, settings.sunIntensity);
      gl.uniform1f(locCloud.u_sunAngle, settings.sunAngle);
      gl.uniform1f(locCloud.u_dayness, settings.dayness);
      gl.uniform1f(locCloud.u_vignette, settings.vignette);
      setCloudFieldUniforms(locCloud);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    resize(cssWidth: number, cssHeight: number, scale: number): void {
      pixelScale = scale;
      canvas.width = Math.max(1, Math.round(cssWidth * scale));
      canvas.height = Math.max(1, Math.round(cssHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    dispose(): void {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.deleteBuffer(starBuffer);
      gl.deleteVertexArray(starVao);
      gl.deleteProgram(progSky);
      gl.deleteProgram(progStar);
      gl.deleteProgram(progCloud);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
