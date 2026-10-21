// Mandaadi shore for the game: built from the Mandaadi Shore viewer by make_shore.py. Do not edit by hand.
window.MandaadiShore = function buildShore(opts) {
const SHORE_ROOT = new THREE.Group(); SHORE_ROOT.name = 'shore';
const ANISO = opts.aniso || 4, EXTRA = opts.extra || 0;
const cl01 = v => Math.min(1, Math.max(0, v));
const seaDrop = d => 0.6 * cl01((d + 6) / 6) + 1.1 * cl01(d / 10) + 1.6 * cl01(d / 200) + 6 * cl01((d - 200) / 220);   // under the wave troughs within 10 m
// ---- weathered lime-plaster paint: procedural, in world space, works on instanced parts too
const WEATHER = { uWeather: { value: 1 } };
const NOISE_GLSL = `
varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vInst;
uniform float uWeather;
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*vn(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;
function weather(m, kind) {
  const metal = kind === 'metal';
  m.extensions = Object.assign(m.extensions || {}, { derivatives: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uWeather = WEATHER.uWeather;
    sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vInst;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wpW = vec4(transformed, 1.0); vec3 wnW = objectNormal; vec3 inW = vec3(0.0);
      #ifdef USE_INSTANCING
        wpW = instanceMatrix * wpW; wnW = mat3(instanceMatrix) * wnW; inW = instanceMatrix[3].xyz;
      #endif
      wpW = modelMatrix * wpW; vWPos = wpW.xyz; vWNrm = normalize(mat3(modelMatrix) * wnW); vInst = (modelMatrix * vec4(inW, 1.0)).xyz;`);
    sh.fragmentShader = NOISE_GLSL + 'float gGrain;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  gGrain = uWeather > 0.5 ? fbm(vWPos * 9.0) : 0.5;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uWeather > 0.5) {
        vec3 P = vWPos; vec3 N = normalize(vWNrm);
        float grain = gGrain;                              // plaster grain and brush unevenness
        float brush = vn(vec3(P.x * 1.5 + P.z * 1.5, P.y * 14.0, 0.0));
        float blot  = fbm(P * 0.45 + 3.1);                  // sun-faded and touched-up patches
        float streak = fbm(vec3((P.x + P.z) * 3.0, P.y * 0.22, 7.0));
        float vert = 1.0 - abs(N.y); float up = clamp(N.y, 0.0, 1.0);
        float inst = h31(floor(vInst * 7.0) + 0.5);         // each repeated figure painted a little differently
        vec3 c = diffuseColor.rgb;
        c *= 0.97 + 0.08 * (inst - 0.5) * ${metal ? '0.3' : '1.0'};
        c *= 0.9 + 0.13 * grain + 0.04 * (brush - 0.5);
        c = mix(c, c * 1.06, smoothstep(0.55, 0.78, blot) * ${metal ? '0.1' : '0.45'});
        c *= 1.0 - 0.16 * smoothstep(0.5, 0.85, streak) * vert * ${metal ? '0.3' : '1.0'};          // rain streaks
        float low = 1.0 - smoothstep(0.1, 2.2, P.y);
        c = mix(c, c * vec3(0.66, 0.64, 0.56), low * 0.5);                                         // splash grime at the foot
        c = mix(c, vec3(0.58, 0.5, 0.4) * (0.7 + 0.3 * grain), up * smoothstep(0.5, 0.8, fbm(P * 1.9)) * ${metal ? '0.08' : '0.12'});  // dust on ledges
        ${metal ? 'c = mix(c, c * vec3(0.75, 0.7, 0.55), smoothstep(0.5, 0.8, blot) * 0.35);' : ''}
        ${kind === 'ceiling' ? '' : 'c *= 1.0 - 0.28 * clamp(-N.y, 0.0, 1.0);'}                                              // cheap occlusion: undersides of cornices sit in shade
        diffuseColor.rgb = c;
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      if (uWeather > 0.5) roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * gGrain), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (uWeather > 0.5) {                                 // plaster relief as a bump
        float hb = gGrain;
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        vec3 wr1 = cross(sy, normal), wr2 = cross(normal, sx);
        float det = dot(sx, wr1);
        vec3 grad = sign(det) * (dFdx(hb) * wr1 + dFdy(hb) * wr2);
        normal = normalize(abs(det) * normal - grad * ${metal ? '0.003' : '0.009'});
      }`);
  };
  m.customProgramCacheKey = () => 'weather-' + kind;
  m.needsUpdate = true;
}

// ground: plaza sand and a stone apron in front of the gateway
const sandTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#cbb185'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 170 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v - 25},${v - 70},0.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(180, 180); t.encoding = THREE.sRGBEncoding; return t; })();
const groundShape = new THREE.Shape([new THREE.Vector2(-600, -600), new THREE.Vector2(600, -600), new THREE.Vector2(600, 600), new THREE.Vector2(-600, 600)]);
groundShape.holes.push(new THREE.Path([new THREE.Vector2(-84.4, -24.4), new THREE.Vector2(-84.4, 12.4), new THREE.Vector2(-47.6, 12.4), new THREE.Vector2(-47.6, -24.4)]));   // the sunken temple tank
const groundGeo = new THREE.ShapeGeometry(groundShape);
{ const p = groundGeo.attributes.position, uv = groundGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1200 + 0.5, p.getY(i) / 1200 + 0.5); }
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; SHORE_ROOT.add(ground);
// ---------------------------------------------------------------- the compound (three.js space: +Z toward the sea, metres)
// axis: gopuram at z +40 (on the front wall), bali peetam +14, flagstaff +10.5, mandapam centre -8, vimana centre -26
const WALL = { x: 34, front: 40, back: -46, h: 3.6, t: 0.6 };
// scale balance: gopuram brought down to 0.85 (29 m), mandapam up to 1.1, vimana up to 1.2
const SC = { gopuram: 0.85, mandapam: 1.1, vimana: 1.2 };
const POS = { gopuram: 40, mandapam: -8, vimana: -28.6 };
const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d');
  g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, 128, 16); g.fillStyle = '#c4452f'; g.fillRect(0, 0, 64, 16);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t; })();
const wallMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.95 });
const copeMat = new THREE.MeshStandardMaterial({ color: 0xefc540, roughness: 0.9 });
weather(wallMat, 'paint'); weather(copeMat, 'paint');
const coping = [];   // points along the coping for the serial lights
function wallSeg(x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
  const g = new THREE.BoxGeometry(L, WALL.h, WALL.t);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + L / 2) / 0.9 + (pos.getZ(i) !== 0 ? 0 : pos.getZ(i)), 0.5);   // vertical stripes every 0.45 m
  const m = new THREE.Mesh(g, wallMat); m.position.set((x0 + x1) / 2, WALL.h / 2, (z0 + z1) / 2); m.rotation.y = -ang; m.castShadow = m.receiveShadow = true; SHORE_ROOT.add(m);
  const c = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.25, WALL.t + 0.2), copeMat); c.position.set((x0 + x1) / 2, WALL.h + 0.125, (z0 + z1) / 2); c.rotation.y = -ang; c.castShadow = true; SHORE_ROOT.add(c);
  for (let s = 0.3; s < L; s += 0.6) coping.push(new THREE.Vector3(x0 + (x1 - x0) * s / L, WALL.h + 0.32, z0 + (z1 - z0) * s / L));
}
wallSeg(-WALL.x, WALL.front, -10.5 * SC.gopuram, WALL.front); wallSeg(10.5 * SC.gopuram, WALL.front, WALL.x, WALL.front);   // the wall meets the gopuram's sides
wallSeg(-WALL.x, WALL.front, -WALL.x, WALL.back); wallSeg(WALL.x, WALL.front, WALL.x, WALL.back);
wallSeg(-WALL.x, WALL.back, -4.6, WALL.back); wallSeg(4.6, WALL.back, WALL.x, WALL.back);
// paving inside the compound and a stone apron outside the gate
const paveMapTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#c9bea8'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { const v = 185 + Math.random() * 30 | 0; g.fillStyle = `rgb(${v},${v - 10},${v - 30})`; g.fillRect(x + ((y / 64) % 2) * 32 + 1, y + 1, 62, 62); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(16, 21); t.encoding = THREE.sRGBEncoding; return t; })();
const pave = new THREE.Mesh(new THREE.PlaneGeometry(2 * WALL.x - 0.6, WALL.front - WALL.back - 0.6), new THREE.MeshStandardMaterial({ map: paveMapTex, roughness: 0.95 }));
pave.rotation.x = -Math.PI / 2; pave.position.set(0, 0.015, (WALL.front + WALL.back) / 2); pave.receiveShadow = true; SHORE_ROOT.add(pave);
const apron = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 0.95 }));
apron.position.set(0, 0.02, 55); apron.receiveShadow = true; SHORE_ROOT.add(apron);

// sacred tree (sthala vriksham) on a raised, painted platform, wrapped with threads
(function sacredTree(x, z) {
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.9, 24), new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.95 }));
  plat.position.set(x, 0.45, z); plat.castShadow = plat.receiveShadow = true; SHORE_ROOT.add(plat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.42, 3.42, 0.22, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc4452f, roughness: 0.9 }));
  band.position.set(x, 0.55, z); SHORE_ROOT.add(band);
  const bark = new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 6, 9), bark); trunk.position.set(x, 3.9, z); trunk.castShadow = true; SHORE_ROOT.add(trunk);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.86, 0.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8b33a, roughness: 0.8 }));
  thread.position.set(x, 2.2, z); SHORE_ROOT.add(thread);
  for (const [dx, dy, dz, a] of [[1.6, 5.4, 0.5, -0.7], [-1.4, 5.8, -0.6, 0.8], [0.3, 6.2, 1.6, 0.4]]) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 3.2, 7), bark); br.position.set(x + dx * 0.6, dy, z + dz * 0.6); br.rotation.z = a; br.castShadow = true; SHORE_ROOT.add(br);
  }
  const leafM = new THREE.MeshStandardMaterial({ color: 0x4e7b3c, roughness: 0.9, flatShading: true });
  const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 16; i++) {
    const r = 2.2 + rng() * 1.6, a = rng() * Math.PI * 2, d = rng() * 4.2;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafM);
    blob.position.set(x + Math.cos(a) * d, 8 + rng() * 3.2, z + Math.sin(a) * d); blob.scale.y = 0.75; blob.castShadow = blob.receiveShadow = true; SHORE_ROOT.add(blob);
  }
})(-24, -36);

// coconut palms: the attached CC-BY model (00amza, Sketchfab), 320 triangles, instanced
const PALM_SPOTS = (() => {
  const spots = []; const rng = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const clear = (x, z) => (Math.abs(x) < WALL.x + 5 && z > WALL.back - 5 && z < WALL.front + 5)      // inside the walls
    || (Math.abs(x) < 26 && z > 36 && z < 110)                                                    // forecourt, ther and lamp pillar
    || (x < -42 && x > -90 && z > -18 && z < 30);                                                 // temple tank
  let tries = 0;
  while (spots.length < 90 && tries++ < 5000) {
    const x = (rng() - 0.5) * 260, z = (rng() - 0.5) * 240 - 10;
    if (clear(x, z)) continue;
    spots.push([x, z, 10 + rng() * 9, (rng() - 0.5) * 0.22, rng() * 6.28]);
  }
  for (const [x, z] of [[-30, 50], [30, 48], [-42, 42], [44, 40]]) spots.push([x, z, 13 + rng() * 4, (rng() - 0.5) * 0.15, rng() * 6.28]);
  return spots;
})();
function plantPalms(gltf) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root); const h0 = box.max.y - box.min.y;
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material; m.alphaTest = 0.4; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.9; m.metalness = 0;
    if (m.map) { m.map.anisotropy = ANISO; }
    const im = new THREE.InstancedMesh(o.geometry, m, PALM_SPOTS.length);
    PALM_SPOTS.forEach(([x, z, h, lean, rot], i) => {
      const k = h / h0;
      const place = new THREE.Matrix4().compose(new THREE.Vector3(x, -box.min.y * k + GH(x, z) - 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, rot, lean * 0.5, 'YXZ')), new THREE.Vector3(k, k, k));
      im.setMatrixAt(i, place.multiply(o.matrixWorld));
    });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; SHORE_ROOT.add(im);
    im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: 0.4 });   // leaf-shaped shadows
  });
}

// festival: paper buntings radiating from the flagstaff top, serial lights on the wall coping and along some strings
const FLAG_COLS = [0xd8442f, 0xf2c230, 0x2f8f5b, 0x2f6db3, 0xd94f9a, 0xe98a2e].map(c => new THREE.Color(c));
const flagPos = [], flagCol = [], bulbs = [];
function bunting(a, b, sag, withLights) {
  a = new THREE.Vector3(...a); b = new THREE.Vector3(...b); const L = a.distanceTo(b); const n = Math.max(6, Math.round(L / 0.35));
  const P = k => a.clone().lerp(b, k / n).add(new THREE.Vector3(0, -sag * 4 * (k / n) * (1 - k / n), 0));
  for (let k = 0; k < n; k++) {
    const p0 = P(k), p1 = P(k + 1), mid = p0.clone().add(p1).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.3, 0));
    const q0 = p0.clone().lerp(p1, 0.08), q1 = p1.clone().lerp(p0, 0.08);
    flagPos.push(q0.x, q0.y, q0.z, q1.x, q1.y, q1.z, mid.x, mid.y, mid.z);
    const c = FLAG_COLS[k % FLAG_COLS.length]; for (let j = 0; j < 3; j++) flagCol.push(c.r, c.g, c.b);
    if (withLights && k % 2 === 0) bulbs.push(p0.clone().add(new THREE.Vector3(0, -0.05, 0)));
  }
}
const FT = [0, 13.7 * SC.mandapam, POS.mandapam + 18.5 * SC.mandapam];   // flagstaff, just under the crossarm
for (const t of [[-WALL.x, WALL.h + 0.3, WALL.front], [WALL.x, WALL.h + 0.3, WALL.front], [-WALL.x, WALL.h + 0.3, -4], [WALL.x, WALL.h + 0.3, -4],
                 [-7.7, 10.4, 35.8], [7.7, 10.4, 35.8], [-8.8, 7.2, POS.mandapam + 11], [8.8, 7.2, POS.mandapam + 11]]) bunting(FT, t, 1.6, true);
for (const [x0, z0, x1, z1] of [[-WALL.x, WALL.front, WALL.x, 2], [WALL.x, WALL.front, -WALL.x, 2]]) bunting([x0, WALL.h + 0.3, z0], [x1, WALL.h + 0.3, z1], 3.5, false);
// ================================================================= village v2: rolling ground, painted soil/sand/grass, rural vegetation
const LAY = window.VILLAGE_LAYOUT;
const shoreZ = x => 370 - (82 + 7 * Math.sin(x / 140 + 0.5) + 3 * Math.sin(x / 47 + 1.3));
const roadZ = x => shoreZ(x) - (24 + 40 * Math.exp(-((x / 85) ** 2)) + 4 * Math.sin(x / 60));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rectDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
function flatMask(x, z) {
  let m = sstep(4, 40, roadZ(x) - 7 - z);
  m *= sstep(4, 34, rectDist(x, z, -96, 72, -92, 96));
  if (z > 80 && z < roadZ(x) + 2) m *= sstep(10, 28, Math.abs(x));
  return m;
}
function GH(x, z) {     // ground height, identical to village2.py
  const b = 1.25 * Math.sin(x / 41 + 0.7) * Math.sin(z / 33 + 1.1) + 0.75 * Math.sin(x / 19.3 - z / 27.1 + 2.0)
    + 0.45 * Math.sin((x + z) / 9.7 + 0.3) + 0.3 * Math.sin(x / 7.1) * Math.sin(z / 6.3) + 0.9 * Math.sin(x / 83 + z / 61);
  return flatMask(x, z) * (b + 1.8) * 1.05 - seaDrop(z - shoreZ(x) - EXTRA);
}
const grassF = (x, z) => Math.sin(x / 23 + 1.7) * Math.sin(z / 19 + 0.3) + 0.6 * Math.sin(x / 9.1 - z / 11.3) + 0.5 * Math.sin((x - 2 * z) / 31) - 0.15;

// ---- splat maps: R sand, G grass, B worn soil (lanes); second map R asphalt, G granite slabs
const GX0 = -700, GX1 = 700, GZ0 = -410, GZ1 = 300, GW = 2560, GHt = Math.round(GW * (GZ1 - GZ0) / (GX1 - GX0));
const gpx = x => (x - GX0) / (GX1 - GX0) * GW, gpy = z => (z - GZ0) / (GZ1 - GZ0) * GHt, gm = m => m / (GX1 - GX0) * GW;
const splatCanvas = document.createElement('canvas'); splatCanvas.width = GW; splatCanvas.height = GHt;
const paveCanvas = document.createElement('canvas'); paveCanvas.width = GW; paveCanvas.height = GHt;
(function paintSplat() {
  const g = splatCanvas.getContext('2d'); const img = g.createImageData(GW, GHt); const D = img.data;
  for (let j = 0; j < GHt; j++) {
    const z = GZ0 + (j + 0.5) / GHt * (GZ1 - GZ0);
    for (let i = 0; i < GW; i++) {
      const x = GX0 + (i + 0.5) / GW * (GX1 - GX0); const k = (j * GW + i) * 4;
      const inland = roadZ(x) - 7 - z;
      let sand = 1 - sstep(0, 26, inland);                                                 // dune sand behind the beach road
      sand = Math.max(sand, sstep(0.75, 1.1, Math.sin(x / 13 + 0.4) * Math.sin(z / 17 + 1.9) + 0.5 * Math.sin((x + z) / 7.3)) * 0.55 * (1 - sstep(30, 90, inland)));
      let grass = sstep(-0.45, 0.3, grassF(x, z)) * sstep(4, 22, inland);
      grass *= 1 - 0.5 * sand;
      if (z > roadZ(x) - 7) { sand = 1; grass = 0; }
      if (rectDist(x, z, -42, 42, -50, 86) < 1) { grass *= 0.2; }
      D[k] = sand * 255; D[k + 1] = grass * 255; D[k + 2] = 0; D[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.lineJoin = g.lineCap = 'round';
  const stroke = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = gm(w); g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(gpx(x), gpy(z)) : g.moveTo(gpx(x), gpy(z))); g.stroke(); };
  for (const y of LAY.yards) { g.fillStyle = y[3] ? 'rgba(150,0,90,0.42)' : 'rgba(80,0,110,0.38)'; g.beginPath(); g.arc(gpx(y[0]), gpy(y[1]), gm(y[2] - 1.0), 0, 7); g.fill(); }   // swept yards: bare sand and soil
  for (const r of LAY.roads) {
    if (r.kind === 'path') stroke(r.pts, r.w, 'rgb(230,20,40)');
    else if (r.kind === 'lane') { stroke(r.pts, r.w + 2.2, 'rgba(60,40,140,0.6)'); stroke(r.pts, r.w, 'rgb(40,0,235)'); }
    else stroke(r.pts, r.w + 3, 'rgb(90,0,200)');
  }
  const p = paveCanvas.getContext('2d'); p.fillStyle = '#000'; p.fillRect(0, 0, GW, GHt); p.lineJoin = p.lineCap = 'round';
  const pstroke = (pts, w, col) => { p.strokeStyle = col; p.lineWidth = gm(w); p.beginPath(); pts.forEach(([x, z], i) => i ? p.lineTo(gpx(x), gpy(z)) : p.moveTo(gpx(x), gpy(z))); p.stroke(); };
  for (const r of LAY.roads) if (r.kind === 'tar') pstroke(r.pts, r.w, 'rgb(230,0,0)');
  pstroke(LAY.road.map(([x, z]) => [x, z - LAY.roadW / 2]), LAY.roadW, 'rgb(255,0,0)');
  p.fillStyle = 'rgb(0,240,0)'; p.fillRect(gpx(-5.5), gpy(86), gm(11), gpy(LAY.kovil[0]) - gpy(86));                // temple street, granite
  p.fillRect(gpx(LAY.plaza[0]), gpy(LAY.plaza[2]), gm(LAY.plaza[1] - LAY.plaza[0]), gpy(LAY.plaza[3]) - gpy(LAY.plaza[2]));
})();
const splatTex = new THREE.CanvasTexture(splatCanvas), roadMaskTex = new THREE.CanvasTexture(paveCanvas);
for (const t of [splatTex, roadMaskTex]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; }

// ---- rolling ground mesh (5 m grid), textured once the vegetation pack arrives
const groundGeo2 = new THREE.PlaneGeometry(1400, 880, 280, 176); groundGeo2.rotateX(-Math.PI / 2); groundGeo2.translate(0, 0, 25);
{ const p = groundGeo2.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, GH(p.getX(i), p.getZ(i))); groundGeo2.computeVertexNormals(); }
const GROUND_U = { tGrass: { value: null }, tSand: { value: null }, tSoil: { value: null }, tEarth: { value: null }, tSplat: { value: splatTex }, tPave: { value: roadMaskTex } };
const landMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
landMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, GROUND_U);
  sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vGW = transformed;');
  sh.fragmentShader = `varying vec3 vGW; uniform sampler2D tGrass, tSand, tSoil, tEarth, tSplat, tPave;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 tri(sampler2D t, vec2 p, float s){ return lin(texture2D(t, p / s).rgb) * (0.75 + 0.5 * texture2D(t, p / (s * 6.3) + 0.37).g); }
float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
      if (vGW.x > -84.4 && vGW.x < -47.6 && vGW.z > -12.4 && vGW.z < 24.4) discard;            // the temple tank is cut out
      vec2 suv = vec2((vGW.x - ${GX0.toFixed(1)}) / ${(GX1 - GX0).toFixed(1)}, (vGW.z - ${GZ0.toFixed(1)}) / ${(GZ1 - GZ0).toFixed(1)});
      vec3 w = texture2D(tSplat, vec2(suv.x, 1.0 - suv.y)).rgb; vec2 pv = texture2D(tPave, vec2(suv.x, 1.0 - suv.y)).rg;
      vec2 p = vGW.xz;
      vec3 cE = tri(tEarth, p, 7.0) * vec3(0.8, 0.74, 0.62), cS = tri(tSand, p, 5.0), cG = tri(tGrass, p, 5.5), cL = tri(tSoil, p, 4.0);
      cE = mix(cE, cG * 0.85, 0.35 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(p.x / 11.0) * sin(p.y / 9.0 + 1.3)));   // weeds in the bare earth
      float yellow = 0.5 + 0.5 * sin(p.x / 29.0 + 1.0) * sin(p.y / 23.0);                   // sun-dried patches in the grass
      cG = mix(cG, cG * vec3(1.35, 1.15, 0.55), yellow * 0.55);
      float we = max(0.0, 1.0 - w.r - w.g - w.b);
      vec3 col = (cE * we + cS * w.r + cG * w.g + cL * w.b) / max(0.001, we + w.r + w.g + w.b);
      vec3 asphalt = vec3(0.075, 0.072, 0.068) * (0.85 + 0.3 * gh(floor(p * 7.0)));
      vec3 slab = vec3(0.42, 0.38, 0.31) * (0.9 + 0.2 * gh(floor(p / 1.6)));
      col = mix(col, asphalt, pv.r); col = mix(col, slab, pv.g);
      col *= 0.92 + 0.14 * gh(floor(p * 9.0));
      diffuseColor.rgb *= col;`);
};
SHORE_ROOT.remove(ground);
const land = new THREE.Mesh(groundGeo2, landMat); land.receiveShadow = true; land.visible = false; SHORE_ROOT.add(land);
// far land: the same rolling ground carried on, rising into low hills inland, in the grass texture
const FAR_RECT = { x: 690, z0: -405, z1: 470 };
function FH(x, z) {
  const inland = shoreZ(x) - z;
  if (inland < -EXTRA) return -3;
  const b = 1.25 * Math.sin(x / 41 + 0.7) * Math.sin(z / 33 + 1.1) + 0.75 * Math.sin(x / 19.3 - z / 27.1 + 2.0) + 0.9 * Math.sin(x / 83 + z / 61);
  let h = sstep(0, 70, inland) * (b + 1.8) * 1.05;
  h += sstep(300, 2400, inland) * (10 + 7 * Math.sin(x / 690 + 1.0) * Math.sin(z / 520 + 0.4) + 4 * Math.sin(x / 230 - z / 310));
  // under the village the far land must never show: follow the village ground, sunk well below it
  // (it is a coarse 50 m grid, so it sits 4 m down; vertices on the village edge just tuck under)
  if (Math.abs(x) < 700 && z > -415 && z < 465) return GH(x, z) - 4;
  if (Math.abs(x) <= 700 && z >= -450 && z <= 500) h = Math.min(h, GH(x, z) - 0.3);
  return h;
}
const farGeo = new THREE.PlaneGeometry(18000, 9000, 360, 180); farGeo.rotateX(-Math.PI / 2); farGeo.translate(0, 0, 400 - 4500);
{ const p = farGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, FH(p.getX(i), p.getZ(i))); farGeo.computeVertexNormals(); }
const farMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 });
farMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, GROUND_U);
  sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vGW = transformed;');
  sh.fragmentShader = `varying vec3 vGW; uniform sampler2D tGrass, tSand, tSoil, tEarth;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 tri(sampler2D t, vec2 p, float s){ return lin(texture2D(t, p / s).rgb) * (0.75 + 0.5 * texture2D(t, p / (s * 6.3) + 0.37).g); }
float fh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
float shoreZf(float x){ return 370.0 - (82.0 + 7.0 * sin(x / 140.0 + 0.5) + 3.0 * sin(x / 47.0 + 1.3)); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
      vec2 p = vGW.xz; float inland = shoreZf(p.x) - p.y;
      if (inland < -25.0 - ${EXTRA.toFixed(1)}) discard;
      vec3 cG = tri(tGrass, p, 5.5), cE = tri(tEarth, p, 8.0) * vec3(0.8, 0.74, 0.62), cS = tri(tSand, p, 5.0);
      float macro = fn(p / 260.0) * 0.6 + fn(p / 90.0) * 0.4;
      cG = mix(cG, cG * vec3(1.35, 1.15, 0.55), smoothstep(0.45, 0.8, fn(p / 140.0 + 3.0)) * 0.55);
      vec3 col = mix(cG, cE, smoothstep(0.6, 0.85, macro) * 0.75);
      col = mix(col, cS, 1.0 - smoothstep(14.0, 60.0, inland));
      col *= 0.85 + 0.3 * fn(p / 520.0 + 7.0);
      diffuseColor.rgb *= col;`);
};
const farLand = new THREE.Mesh(farGeo, farMat); farLand.receiveShadow = true; farLand.visible = false; SHORE_ROOT.add(farLand);

// ---- palms from the layout, standing on the ground
PALM_SPOTS.length = 0;
{ const rng = (() => { let s = 19; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (const [x, z] of LAY.palms) PALM_SPOTS.push([x, z, 8 + rng() * 11, (rng() - 0.5) * 0.3, rng() * 6.28]);
  for (const [x, z] of LAY.speakersPalm) PALM_SPOTS.push([x, z, 9.2, 0.02, rng() * 6.28]);
  for (const [x, z] of [[-30, 50], [30, 48], [-42, 42], [44, 40], [-50, 54], [51, 58]]) PALM_SPOTS.push([x, z, 13 + rng() * 4, (rng() - 0.5) * 0.15, rng() * 6.28]); }

// ---- vegetation pack: grass, sand, soil and earth textures; 2D tree cards, bush cards, low-poly trees, grass clumps
function plantVeg(gltf) {
  const M = {}; gltf.scene.traverse(o => { if (o.isMesh) M[o.name] = o; });
  for (const [u, n] of [['tGrass', 'ground_grass'], ['tSand', 'ground_sand'], ['tSoil', 'ground_soil'], ['tEarth', 'ground_earth']]) {
    const t = M[n].material.map; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.needsUpdate = true; GROUND_U[u].value = t;
  }
  land.visible = true;
  const rng = (() => { let s = 101; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const o = new THREE.Object3D();
  function scatter(meshName, list, place, shadow) {
    const src = M[meshName]; if (!src || !list.length) return;
    const m = src.material; m.side = THREE.DoubleSide; m.roughness = 0.95; m.metalness = 0;
    if (m.alphaTest) { m.transparent = false; }
    if (m.map) m.map.anisotropy = 4;
    const im = new THREE.InstancedMesh(src.geometry, m, list.length);
    list.forEach((e, i) => { place(e); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = shadow; im.receiveShadow = true;
    if (shadow && m.alphaTest) im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: m.alphaTest });
    im.frustumCulled = false; SHORE_ROOT.add(im); totals.draws++;
  }
  for (let k = 0; k < 4; k++) {
    if (k % 2 === 1) scatter('tree_card_' + k, LAY.cards.filter(c => (c[2] | 1) === k).concat(k === 3 ? LAY.lowp.map(([x, z, h]) => [x, z, 3, h + 1.5]) : []), ([x, z, , h]) => { o.position.set(x, GH(x, z) - 0.2, z); o.rotation.set(0, rng() * 6.28, (rng() - 0.5) * 0.06); o.scale.set(h * (0.85 + rng() * 0.3), h, h * (0.85 + rng() * 0.3)); }, true);
    scatter('bush_card_' + k, LAY.bushes.filter(c => c[2] === k), ([x, z, , s]) => { o.position.set(x, GH(x, z) - 0.15 * s, z); o.rotation.set(0, rng() * 6.28, 0); o.scale.set(s * (0.8 + rng() * 0.5), s, s * (0.8 + rng() * 0.5)); }, false);
  }
  if (false) scatter('lowp_tree', LAY.lowp, ([x, z, h]) => { o.position.set(x, GH(x, z) - 0.2, z); o.rotation.set(0, rng() * 6.28, 0); o.scale.set(h * (0.8 + rng() * 0.4), h, h * (0.8 + rng() * 0.4)); }, true);
  farLand.visible = true;
  // 2D tree patches across the far land, a coastal belt either side of the village, and a dense line on the horizon
  {
    const trng = (() => { let s = 777; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const gauss = () => (trng() + trng() + trng() - 1.5) / 1.5;
    const nearVillage = (x, z) => Math.abs(x) < FAR_RECT.x + 20 && z > FAR_RECT.z0 - 20 && z < FAR_RECT.z1;
    const lists = [[], [], [], []];
    const plant = (x, z, h) => { if (nearVillage(x, z)) return; const inl = shoreZ(x) - z; if (inl < 26) return; lists[trng() < 0.5 ? 1 : 3].push([x, z, h]); };
    for (let k = 0; k < 340; k++) {
      let cx, cz; do { cx = (trng() * 2 - 1) * 6500; cz = shoreZ(cx) - 50 - Math.pow(trng(), 0.7) * 3600; } while (nearVillage(cx, cz));
      const n = 6 + ((trng() * 46) | 0), r = 25 + trng() * 110;
      for (let i = 0; i < n; i++) plant(cx + gauss() * r, cz + gauss() * r * 0.7, 8 + trng() * 9);
    }
    for (let x = -7000; x < 7000; x += 9) {
      if (Math.abs(x) > FAR_RECT.x + 30 && trng() < 0.75) plant(x + gauss() * 4, shoreZ(x) - 30 - trng() * 130, 9 + trng() * 8);
      if (trng() < 0.8) plant(x + gauss() * 6, shoreZ(x) - 2400 - trng() * 900, 14 + trng() * 12);
    }
    lists.forEach((list, k) => {
      const src = M['tree_card_' + k]; if (!src || !list.length) return;
      const m = src.material.clone(); m.side = THREE.DoubleSide; m.emissive = new THREE.Color(0.32, 0.34, 0.3); m.emissiveMap = m.map;
      const im = new THREE.InstancedMesh(src.geometry, m, list.length);
      list.forEach(([x, z, h], i) => { o.position.set(x, FH(x, z) - 0.3, z); o.rotation.set(0, trng() * 6.28, 0); o.scale.set(h * (0.8 + trng() * 0.5), h, h * (0.8 + trng() * 0.5)); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.frustumCulled = false; SHORE_ROOT.add(im); totals.draws++;
    });
  }
  if (M.grass_clump) M.grass_clump.material.color.setRGB(0.42, 0.55, 0.26);
  scatter('grass_clump', LAY.clumps, ([x, z, s]) => { o.position.set(x, GH(x, z) - 0.05, z); o.rotation.set(0, rng() * 6.28, 0); o.scale.set(s * 0.3, s * 0.38, s * 0.3); }, false);
}

// ---- landmarks: the lighthouse left of the temple, and the festival giant wheel (raatinam) by the street
const TICK = [];                                                       // per-frame animation hooks
const RAAT = { x: 30, z: 199 };                                        // giant wheel, faces the sea
const LIGHT = { x: -128, z: 236 };                                     // lighthouse, just inland of the beach road
function rodBetween(a, b, r, mat, seg) {                               // a cylinder from point a to point b
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg || 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
function rodsInstanced(pairs, r, mat, seg) {                           // many thin rods in one draw call
  const g = new THREE.CylinderGeometry(r, r, 1, seg || 5); const im = new THREE.InstancedMesh(g, mat, pairs.length);
  const o = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  pairs.forEach(([a, b, c], i) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(up, d.clone().normalize()); o.scale.set(1, L, 1); o.updateMatrix();
    im.setMatrixAt(i, o.matrix); if (c) im.setColorAt(i, c);
  });
  im.castShadow = true; return im;
}

// ---------------- lighthouse: octagonal tower in red and white bands, two red galleries, lantern cage, radar on top
(function lighthouse() {
  const { x, z } = LIGHT, y0 = GH(x, z) - 0.6, root = new THREE.Group(); root.position.set(x, y0, z); root.rotation.y = 0.25; SHORE_ROOT.add(root);
  const RED = new THREE.MeshStandardMaterial({ color: 0xa8150f, roughness: 0.8 }), WHITE = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85 });
  const DARK = new THREE.MeshStandardMaterial({ color: 0x1d2226, roughness: 0.4 }), GREY = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.7 });
  weather(RED, 'paint'); weather(WHITE, 'paint');
  const add = (m, px, py, pz) => { m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; root.add(m); return m; };
  const oct = (rt, rb, h, mat) => new THREE.CylinderGeometry(rt, rb, h, 8).rotateY(Math.PI / 8);
  add(new THREE.Mesh(oct(4.4, 4.6, 1.2), GREY), 0, 0.6, 0);                                     // plinth
  const H = 25, N = 8, R0 = 3.3, R1 = 2.6, bh = H / N;
  for (let i = 0; i < N; i++) {
    const rb = R0 + (R1 - R0) * i / N, rt = R0 + (R1 - R0) * (i + 1) / N;
    add(new THREE.Mesh(oct(rt, rb, bh), i % 2 ? WHITE : RED), 0, 1.2 + bh * (i + 0.5), 0);
    if (i > 0) for (const a of [0, Math.PI]) {                                                   // a small window on two faces of each band
      const r = (rt + rb) / 2 * Math.cos(Math.PI / 8) + 0.02, w = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.12), DARK), Math.sin(a) * r, 1.2 + bh * (i + 0.45), Math.cos(a) * r);
      w.rotation.y = a; const f = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.3), i % 2 ? WHITE : RED), Math.sin(a) * (r + 0.08), 1.2 + bh * (i + 0.45) - 0.55, Math.cos(a) * (r + 0.08)); f.rotation.y = a;
    }
  }
  const top = 1.2 + H;
  add(new THREE.Mesh(oct(4.3, 3.0, 1.0), RED), 0, top + 0.5, 0);                                  // first gallery, flared
  add(new THREE.Mesh(oct(3.1, 3.1, 2.0), RED), 0, top + 2.0, 0);                                  // watch room
  add(new THREE.Mesh(oct(3.8, 3.4, 0.45), RED), 0, top + 3.2, 0);                                 // second gallery
  const rail = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.6 });
  for (const [ry, rr] of [[top + 1.0, 4.2], [top + 3.42, 3.7]]) {                                 // railings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.04, 4, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8), rail); add(ring, 0, ry + 1.0, 0);
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4), rail), Math.cos(a) * rr * 0.96, ry + 0.5, Math.sin(a) * rr * 0.96); }
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 16), new THREE.MeshStandardMaterial({ color: 0x2a3a40, roughness: 0.15, metalness: 0.3 })), 0, top + 4.55, 0);   // lantern glass
  const cage = [];                                                                                // white lattice cage round the lantern
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, b = (k + 1) / 10 * Math.PI * 2;
    const p = (ang, h, r) => new THREE.Vector3(Math.cos(ang) * r, top + 3.45 + h, Math.sin(ang) * r);
    cage.push([p(a, 0, 1.8), p(a, 2.6, 1.55)], [p(a, 0, 1.8), p(b, 1.3, 1.68)], [p(b, 1.3, 1.68), p(a, 2.6, 1.55)], [p(a, 2.6, 1.55), p(b, 2.6, 1.55)]); }
  root.add(rodsInstanced(cage, 0.05, rail));
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.65, 0.6, 16), WHITE), 0, top + 6.35, 0);   // roof
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.5, 6), rail), 0.7, top + 8.5, 0.4);  // antenna mast
  const radar = new THREE.Group(); radar.position.set(0, top + 7.3, 0); root.add(radar);           // the radar bar, turning slowly
  radar.add(add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8), GREY), 0, 0, 0));
  const bar = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.32, 0.55), WHITE); bar.position.y = 0.45; bar.castShadow = true; radar.add(bar);
  TICK.push(dt => { radar.rotation.y += dt * 0.6; });
  // compound: low white wall with square pillars, a gate gap toward the road, and a small keeper's hut
  const S = 11, wallM = new THREE.MeshStandardMaterial({ color: 0xeeebe4, roughness: 0.95 }); weather(wallM, 'paint');
  const cg = new THREE.Group(); cg.position.set(x, 0, z); cg.rotation.y = 0.25; SHORE_ROOT.add(cg);
  const seg = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6, 0.25), wallM); w.position.set(mx, 0, mz); w.rotation.y = -Math.atan2(bz - az, bx - ax);
    const wx = x + Math.cos(0.25) * mx + Math.sin(0.25) * mz, wz = z - Math.sin(0.25) * mx + Math.cos(0.25) * mz; w.position.y = GH(wx, wz) + 0.6; w.castShadow = w.receiveShadow = true; cg.add(w);
    for (let s = 0; s <= L; s += 3.2) { const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.0, 0.45), new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.9 })); p.position.set(px, w.position.y + 0.15, pz); p.castShadow = true; cg.add(p); } };
  seg(-S, -S, S, -S); seg(S, -S, S, S); seg(-S, -S, -S, S); seg(-S, S, -2.2, S); seg(2.2, S, S, S);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 3.4), new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.95 })); weather(hut.material, 'paint');
  hut.position.set(6.5, GH(x, z) + 1.2, 6.0); hut.castShadow = hut.receiveShadow = true; cg.add(hut);
  const hdoor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x6b4a2e })); hdoor.position.set(5.5, GH(x, z) + 0.75, 7.72); cg.add(hdoor);
})();

// ---------------- the giant wheel (raatinam): twin rims, LED spokes, lattice A-frames, 12 painted cabins that stay upright
(function giantWheel() {
  const { x, z } = RAAT, gy = GH(x, z), HUB = 13.6, R = 10.2, W = 2.4;
  const root = new THREE.Group(); root.position.set(x, gy, z); SHORE_ROOT.add(root);
  const STEEL = new THREE.MeshStandardMaterial({ color: 0xe9e8e4, roughness: 0.55, metalness: 0.2 });
  const REDS = new THREE.MeshStandardMaterial({ color: 0xc23a2b, roughness: 0.6, metalness: 0.2 });
  // A-frame towers either side of the wheel, with ladder rungs and cross braces
  const legs = [];
  for (const sz of [-1, 1]) {
    const hub = new THREE.Vector3(0, HUB, sz * (W / 2 + 0.9));
    for (const sx of [-1, 1]) for (const dz of [-0.35, 0.35]) {
      const foot = new THREE.Vector3(sx * 6.4, 0, sz * (W / 2 + 2.6) + dz), head = hub.clone().add(new THREE.Vector3(sx * 0.6, 0, dz));
      legs.push([foot, head]);
    }
    for (let k = 1; k < 13; k++) { const t = k / 13;                                              // rungs between the two legs of each side
      for (const sx of [-1, 1]) { const a = new THREE.Vector3(sx * 6.4 * (1 - t) + sx * 0.6 * t, HUB * t, sz * ((W / 2 + 2.6) * (1 - t) + (W / 2 + 0.9) * t));
        legs.push([a.clone().add(new THREE.Vector3(0, 0, -0.35)), a.clone().add(new THREE.Vector3(0, 0, 0.35))]);
        if (k % 2) legs.push([a.clone().add(new THREE.Vector3(0, 0, -0.35)), new THREE.Vector3(sx * 6.4 * (1 - t - 1 / 13) + sx * 0.6 * (t + 1 / 13), HUB * (t + 1 / 13), sz * ((W / 2 + 2.6) * (1 - t - 1 / 13) + (W / 2 + 0.9) * (t + 1 / 13)) + 0.35)]); }
      if (k === 4) legs.push([new THREE.Vector3(-6.4 * (1 - t) - 0.6 * t, HUB * t, sz * ((W / 2 + 2.6) * (1 - t) + (W / 2 + 0.9) * t)), new THREE.Vector3(6.4 * (1 - t) + 0.6 * t, HUB * t, sz * ((W / 2 + 2.6) * (1 - t) + (W / 2 + 0.9) * t))]);
    }
  }
  root.add(rodsInstanced(legs, 0.11, STEEL, 5));
  root.add(rodBetween(new THREE.Vector3(0, HUB, -(W / 2 + 1.2)), new THREE.Vector3(0, HUB, W / 2 + 1.2), 0.32, STEEL, 10));   // axle
  // the turning wheel
  const wheel = new THREE.Group(); wheel.position.y = HUB; root.add(wheel);
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, W + 0.6, 12).rotateX(Math.PI / 2), REDS); hubM.castShadow = true; wheel.add(hubM);
  const NS = 24, frame = [], leds = [];
  const LED = [0xff4fd8, 0x39ff7a, 0x4f7bff, 0xffd84a, 0xff6a3a, 0x4fe8ff].map(c => new THREE.Color(c));
  const P = (a, r, s) => new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, s * W / 2);
  for (let i = 0; i < NS; i++) {
    const a = i / NS * Math.PI * 2, b = (i + 1) / NS * Math.PI * 2;
    for (const s of [-1, 1]) {
      frame.push([P(a, 0.8, s), P(a, R, s)]);                                                     // spoke
      frame.push([P(a, R, s), P(b, R, s)], [P(a, R * 0.62, s), P(b, R * 0.62, s)]);              // outer and inner rims
      frame.push([P(a, R * 0.62, s), P(b, R, s)]);                                                // lattice between the rims
    }
    frame.push([P(a, R, -1), P(a, R, 1)], [P(a, R, -1), P(b, R, 1)]);                             // cross ties and braces between the faces
    const c = LED[Math.floor(i / 4) % LED.length];                                               // LED tubes in coloured sectors, like the photos
    for (const s of [-1, 1]) leds.push([P(a + 0.02, 1.2, s * 1.06), P(a + 0.02, R - 0.3, s * 1.06), c]);
    leds.push([P(a, R + 0.12, -1.06), P(b, R + 0.12, -1.06), new THREE.Color(0xfff6e0)], [P(a, R + 0.12, 1.06), P(b, R + 0.12, 1.06), new THREE.Color(0xfff6e0)]);
  }
  wheel.add(rodsInstanced(frame, 0.07, STEEL, 4));
  const ledMesh = rodsInstanced(leds, 0.06, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 4); ledMesh.castShadow = false; wheel.add(ledMesh);
  // cabins: hexagonal, painted in festival colours, hung from pins between the rims
  const NG = 12, cabins = [];
  const PAINT = [[0xe8352b, 0xf5c518], [0x2bb36a, 0xf5c518], [0x2f6db3, 0xf08a24], [0xd94f9a, 0xf5c518], [0xf5c518, 0xe8352b], [0x1fa5a0, 0xe8352b]];
  const cabinGeo = { body: new THREE.CylinderGeometry(1.0, 0.85, 0.9, 6), band: new THREE.CylinderGeometry(1.02, 1.0, 0.75, 6, 1, true), roof: new THREE.CylinderGeometry(0.35, 1.08, 0.5, 6) };
  const barsM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
  for (let i = 0; i < NG; i++) {
    const [c1, c2] = PAINT[i % PAINT.length], g = new THREE.Group();
    const m1 = new THREE.MeshStandardMaterial({ color: new THREE.Color(c1).multiplyScalar(0.8), roughness: 0.75 }), m2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(c2).multiplyScalar(0.8), roughness: 0.75 });
    const body = new THREE.Mesh(cabinGeo.body, m1); body.position.y = -1.95; const band = new THREE.Mesh(cabinGeo.band, barsM); band.position.y = -1.13;
    const roof = new THREE.Mesh(cabinGeo.roof, m2); roof.position.y = -0.5; const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 4), STEEL); hang.position.y = -0.2;
    for (const p of [body, roof, hang]) { p.castShadow = true; g.add(p); } g.add(band);
    root.add(g); cabins.push({ g, a: i / NG * Math.PI * 2 });
  }
  let rot = 0;
  const place = () => { wheel.rotation.z = rot; for (const c of cabins) { const a = c.a + rot; c.g.position.set(Math.cos(a) * R, HUB + Math.sin(a) * R, 0); c.g.rotation.z = 0.04 * Math.sin(rot * 3 + c.a); } };
  place(); TICK.push(dt => { rot += dt * 0.09; place(); });
  // boarding deck with steps, a railing round the base, and the ticket booth
  const deckM = new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 0.85 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.9, 4.2), deckM); deck.position.set(0, 0.45, 0); deck.castShadow = deck.receiveShadow = true; root.add(deck);
  for (let s = 0; s < 3; s++) { const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3 * (s + 1), 0.45), deckM); st.position.set(0, 0.15 * (s + 1), 2.1 + 0.45 * (3 - s) - 0.2); st.receiveShadow = true; root.add(st); }
  const fence = [], FX = 9.5, FZ = 6.0;
  const corners = [[-FX, -FZ], [FX, -FZ], [FX, FZ], [1.4, FZ], [-1.4, FZ], [-FX, FZ]];
  const fenceRun = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.6));
    for (const h of [0.55, 1.0]) fence.push([new THREE.Vector3(ax, h, az), new THREE.Vector3(bx, h, bz)]);
    for (let k = 0; k <= n; k++) { const t = k / n; fence.push([new THREE.Vector3(ax + (bx - ax) * t, 0, az + (bz - az) * t), new THREE.Vector3(ax + (bx - ax) * t, 1.05, az + (bz - az) * t)]); } };
  fenceRun(-FX, FZ, -FX, -FZ); fenceRun(-FX, -FZ, FX, -FZ); fenceRun(FX, -FZ, FX, FZ); fenceRun(FX, FZ, 1.4, FZ); fenceRun(-1.4, FZ, -FX, FZ);
  root.add(rodsInstanced(fence, 0.04, new THREE.MeshStandardMaterial({ color: 0xd8cf9a, roughness: 0.7 }), 4));
  const booth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.3, 1.6), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.8 })); booth.position.set(-4.2, 1.15, FZ + 1.6); booth.castShadow = true; root.add(booth);
  const broof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 2.2), new THREE.MeshStandardMaterial({ color: 0xc8261f, roughness: 0.8 })); broof.position.set(-4.2, 2.38, FZ + 1.6); broof.castShadow = true; root.add(broof);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222 })); win.position.set(-4.2, 1.45, FZ + 2.42); root.add(win);
})();

// ---- crowd: 12 low-poly body types, posed on the GPU by an 11-bone procedural skeleton, coloured per person
const CROWD_T = { value: 0 };
(function crowd() {
  const BODIES = window.CROWD_BODIES; if (!BODIES) return;
  const dec = (b64, T) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T(u.buffer); };
  const rng = (() => { let s = 4242; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const pick = a => a[(rng() * a.length) | 0];
  const C = h => new THREE.Color(h).convertSRGBToLinear();
  // ---------------- palettes
  const SKIN = ['#4a2e1f', '#5a3826', '#64402b', '#6e4730', '#7a5236', '#3f281b', '#865c3d'].map(C);
  const HAIR = ['#141110', '#1b1512', '#231a14'].map(C), GREY = ['#8a8580', '#b9b4ad', '#6a6560'].map(C);
  const SHIRT = ['#f4f2ec', '#f4f2ec', '#e9e4d6', '#9cc3e6', '#2f4f86', '#7a2630', '#5f7a3a', '#e8b4c4', '#e2c35a', '#c9d6df', '#d9773a'].map(C);
  const VESHTI = ['#f4f1e6', '#efe8d6', '#f7f4ec'].map(C), LUNGI = ['#2f4f9a', '#2d7a52', '#7a2638', '#5a3a8a', '#1f6f7a', '#a0522d', '#38404a'].map(C);
  const TROUS = ['#1f2533', '#2a2a2a', '#55524c', '#8a7a5a', '#4a3a2c', '#24344f'].map(C);
  const SARI = ['#c2185b', '#d32f2f', '#ef6c00', '#f9a825', '#2e7d32', '#1565c0', '#6a1b9a', '#00897b', '#880e4f', '#ad1457', '#e65100'].map(C);
  const BLOUSE = ['#1a237e', '#b71c1c', '#1b5e20', '#f9a825', '#4a148c', '#3e2723', '#004d40'].map(C);
  const NIGHTY = ['#f2b8c6', '#c9b6e4', '#f6c8a8', '#a9d3f0', '#b8e2cf', '#f0e0a0'].map(C);
  const SILK = ['#c62828', '#2e7d32', '#f9a825', '#ad1457', '#6a1b9a', '#1565c0'].map(C);
  const TOWEL = ['#f4f1e6', '#e07a2d', '#c4362f', '#f4f1e6', '#2f6db3'].map(C);
  function outfit(id) {
    const o = { skin: pick(SKIN), hair: pick(HAIR), top: pick(SHIRT), bot: pick(VESHTI), acc: pick(TOWEL), sleeveSkin: 0, shinSkin: 0 };
    if (id === 'man_lungi' || id === 'man_bare') o.bot = pick(LUNGI);
    if (id === 'man_lungi') o.top = rng() < 0.6 ? C('#f4f2ec') : C('#2a2a2a');
    if (id === 'man_trousers' || id === 'teen_boy' || id === 'boy') { o.bot = pick(TROUS); o.shinSkin = id === 'man_trousers' ? 0 : 1; }
    if (id === 'man_veshti' && rng() < 0.3) o.bot = pick(LUNGI);
    if (id === 'old_man') { o.grey = 0.7 + rng() * 0.3; o.bot = pick(VESHTI); }
    if (id === 'man_heavy' && rng() < 0.4) o.grey = 0.5;
    if (id.startsWith('woman_sari')) { o.bot = pick(SARI); o.top = pick(BLOUSE); }
    if (id === 'woman_nighty') { o.top = o.bot = pick(NIGHTY); }
    if (id === 'girl') { o.bot = pick(SILK); o.top = pick(SILK); }
    return o;
  }
  // ---------------- the shared skinning + pose shader
  const POSE_GLSL = `
    attribute vec2 aBones; attribute vec2 aWR;
    attribute vec4 aAnim; attribute vec4 aCol0; attribute vec4 aCol1; attribute vec4 aCol2; attribute vec3 aCol3;
    uniform float uTime; uniform vec3 uPiv[11];
    varying vec3 vCrowdCol;
    mat3 rotXYZ(vec3 e){ float cx=cos(e.x), sx=sin(e.x), cy=cos(e.y), sy=sin(e.y), cz=cos(e.z), sz=sin(e.z);
      mat3 X = mat3(1.,0.,0., 0.,cx,sx, 0.,-sx,cx); mat3 Y = mat3(cy,0.,-sy, 0.,1.,0., sy,0.,cy); mat3 Z = mat3(cz,sz,0., -sz,cz,0., 0.,0.,1.);
      return Z * Y * X; }
    float segW(float f, float a, float b){ return smoothstep(a - 0.03, a + 0.03, f) * (1.0 - smoothstep(b - 0.03, b + 0.03, f)); }
    float hop(float t, float ph){ return 0.3 * pow(max(0.0, sin(t * 5.2 + ph)), 1.3); }
    float watchF(float t, float ph){ return fract(t * 0.035 + ph * 0.16); }
    vec3 poseBase(int b, float clip, float t, float ph, float wph) {
      float s1 = sin(t * 0.6 + ph), s2 = sin(t * 0.37 + ph * 1.7), s3 = sin(t * 1.1 + ph * 0.3);
      vec3 e = vec3(0.0);
      // common idle life: weight shift, breathing, looking around
      if (b == 0) e = vec3(0.0, 0.05 * s2, 0.025 * s1);
      if (b == 1) e = vec3(0.04 + 0.02 * s3, 0.2 * s2, -0.03 * s1);
      if (b == 2) e = vec3(0.07 * sin(t * 1.3 + ph), 0.4 * sin(t * 0.45 + ph * 2.0), 0.0);
      if (b == 3) e = vec3(0.03 + 0.03 * s1, 0.0, 0.06 + 0.02 * s3); if (b == 5) e = vec3(0.03 - 0.03 * s2, 0.0, -0.06 - 0.02 * s3);
      if (b == 4) e = vec3(0.62 - 0.1 * s2, 0.0, 0.0); if (b == 6) e = vec3(0.62 - 0.1 * s1, 0.0, 0.0);
      if (b == 7) e = vec3(0.0, 0.0, 0.03 + 0.03 * s1); if (b == 9) e = vec3(-0.04, 0.0, -0.03 + 0.03 * s1);
      if (b == 8 || b == 10) e = vec3(0.04 + 0.04 * max(0.0, s1), 0.0, 0.0);
      if (clip < 0.5) {                                             // chatting: right hand gestures
        float g = max(0.0, sin(t * 0.9 + ph));
        if (b == 5) e = vec3(-0.08 - 0.18 * g * (0.6 + 0.4 * sin(t * 2.6)), 0.0, -0.08);
        if (b == 6) e = vec3(-0.3 - 0.55 * g, 0.0, 0.0);
      } else if (clip < 1.5) {                                      // clapping
        float c = 0.5 + 0.5 * sin(t * 8.5 + ph);
        if (b == 3) e = vec3(-0.22, -0.2 - 0.12 * c, 0.1 - 0.06 * c); if (b == 5) e = vec3(-0.22, 0.2 + 0.12 * c, -0.1 + 0.06 * c);
        if (b == 4 || b == 6) e = vec3(-1.3, 0.0, 0.0);
      } else if (clip < 2.5) {                                      // cheering with both arms up
        float c = sin(t * 4.0 + ph);
        if (b == 3) e = vec3(-0.35, 0.0, 2.55 + 0.25 * c); if (b == 5) e = vec3(-0.35, 0.0, -2.55 - 0.25 * sin(t * 4.0 + ph + 1.3));
        if (b == 4 || b == 6) e = vec3(0.45, 0.0, 0.0);
        if (b == 2) e.x = -0.2;
      } else if (clip < 3.5) {                                      // waving with the right hand
        if (b == 5) e = vec3(-0.45, 0.0, -2.25); if (b == 6) e = vec3(-0.2, 0.0, 0.55 * sin(t * 7.0 + ph));
      } else if (clip < 4.5) {                                      // shading the eyes, looking out to sea; left hand on the hip
        if (b == 5) e = vec3(-1.25, 0.25, -0.45); if (b == 6) e = vec3(-1.95, 0.0, 0.0);
        if (b == 3) e = vec3(0.25, 0.0, 0.55); if (b == 4) e = vec3(-1.6, 0.0, 0.0);
        if (b == 2) e = vec3(-0.08, 0.25 * sin(t * 0.3 + ph), 0.0);
      } else if (clip < 5.5) {                                      // walking
        float w = wph;
        if (b == 7) e = vec3(0.42 * sin(w), 0.0, 0.0); if (b == 9) e = vec3(-0.42 * sin(w), 0.0, 0.0);
        if (b == 8) e = vec3(0.65 * max(0.0, sin(w - 1.4)), 0.0, 0.0); if (b == 10) e = vec3(0.65 * max(0.0, sin(w + 1.74)), 0.0, 0.0);
        if (b == 3) e = vec3(-0.26 * sin(w), 0.0, 0.06); if (b == 5) e = vec3(0.26 * sin(w), 0.0, -0.06);
        if (b == 4) e = vec3(0.5 - 0.2 * max(0.0, -sin(w)), 0.0, 0.0); if (b == 6) e = vec3(0.5 - 0.2 * max(0.0, sin(w)), 0.0, 0.0);
        if (b == 0) e = vec3(0.0, 0.08 * sin(w), 0.0); if (b == 1) e = vec3(0.06, -0.1 * sin(w), 0.0);
        if (b == 2) e = vec3(0.04, 0.15 * sin(t * 0.3 + ph), 0.0);
      } else if (clip < 6.5) {                                      // sitting on the sand
        if (b == 7) e = vec3(-1.4, 0.0, 0.45); if (b == 9) e = vec3(-1.4, 0.0, -0.45);
        if (b == 8 || b == 10) e = vec3(2.1, 0.0, 0.0);
        if (b == 3) e = vec3(-0.65, 0.0, 0.1); if (b == 5) e = vec3(-0.65, 0.0, -0.1);
        if (b == 4 || b == 6) e = vec3(-0.5, 0.0, 0.0);
        if (b == 1) e.x = 0.18;
      } else if (clip < 7.5) {                                      // hands loosely together in front, watching
        if (b == 3) e = vec3(-0.05, -0.12, 0.02); if (b == 5) e = vec3(-0.05, 0.12, -0.02);
        if (b == 4 || b == 6) e = vec3(-0.1, 0.0, 0.0);
      } else if (clip < 8.5) {                                      // hands behind the back
        if (b == 3) e = vec3(0.35, 0.15, 0.05); if (b == 5) e = vec3(0.35, -0.15, -0.05);
        if (b == 4 || b == 6) e = vec3(-0.6, 0.0, 0.0);
      } else if (clip > 9.5 && clip < 10.5) {                       // cheering and jumping, both arms pumping
        float c = sin(t * 5.2 + ph);
        if (b == 3) e = vec3(-0.3, 0.0, 2.35 + 0.45 * c); if (b == 5) e = vec3(-0.3, 0.0, -2.35 - 0.45 * c);
        if (b == 4 || b == 6) e = vec3(0.55 - 0.35 * max(0.0, -c), 0.0, 0.0);
        if (b == 2) e.x = -0.25;
      } else if (clip > 10.5 && clip < 12.5) {                      // pointing out to sea, arm straight; then the hand comes down
        float k = clip < 11.5 ? segW(fract(t * 0.06 + ph * 0.3), 0.15, 0.7) : 1.0;
        vec3 p = e;
        if (b == 5) p = vec3(-1.5 + 0.06 * sin(t * 0.7), 0.12 * sin(t * 0.33 + ph), -0.22);
        if (b == 6) p = vec3(0.85, 0.0, 0.0);
        if (b == 1) p = vec3(0.03, -0.18 + 0.1 * sin(t * 0.33 + ph), 0.0);
        if (b == 2) p = vec3(-0.06, -0.1, 0.0);
        e = mix(e, p, k);
      }                                                             // clip 9: arms hanging relaxed (the idle above)
      return e;
    }
    vec3 poseE(int b, float clip, float t, float ph, float wph) {
      if (clip < 12.5) return poseBase(b, clip, t, ph, wph);
      float f = watchF(t, ph);                                      // clip 13, the watcher: easy, pointing, cheering, waving
      vec3 e = poseBase(b, 9.0, t, ph, wph);
      e = mix(e, poseBase(b, 12.0, t, ph, wph), segW(f, 0.22, 0.44));
      e = mix(e, poseBase(b, 10.0, t, ph, wph), segW(f, 0.6, 0.76));
      e = mix(e, poseBase(b, 3.0, t, ph, wph), segW(f, 0.86, 0.96));
      return e;
    }
    int parentOf(int b) { if (b == 0) return -1; if (b == 1 || b == 7 || b == 9) return 0; if (b == 2 || b == 3 || b == 5) return 1; if (b == 4) return 3; if (b == 6) return 5; if (b == 8) return 7; return 9; }
    void boneXf(int b, float clip, float t, float ph, float wph, out mat3 M, out vec3 T) {
      // collect the chain (max depth 4), then compose from the root down
      int c0 = b, c1 = -1, c2 = -1, c3 = -1;
      c1 = parentOf(c0); if (c1 >= 0) c2 = parentOf(c1); if (c2 >= 0) c3 = parentOf(c2);
      M = mat3(1.0); T = vec3(0.0);
      for (int k = 3; k >= 0; k--) {
        int j = k == 3 ? c3 : (k == 2 ? c2 : (k == 1 ? c1 : c0));
        if (j < 0) continue;
        vec3 p = uPiv[0]; for (int q = 0; q < 11; q++) if (q == j) p = uPiv[q];
        mat3 R = rotXYZ(poseE(j, clip, t, ph, wph));
        T = M * (p - R * p) + T; M = M * R;
      }
    }`;
  const VERT_MAIN = `
      float clip = aAnim.x, ph = aAnim.y, spd = aAnim.z, wlen = aAnim.w;
      float t = uTime * spd + ph * 10.0;
      float walked = clip > 4.5 && clip < 5.5 ? mod(uTime * spd * 1.25 + ph * 7.0, max(wlen, 0.01)) : 0.0;
      float wph = walked / 1.3 * 6.2832;
      mat3 Ma, Mb; vec3 Ta, Tb;
      boneXf(int(aBones.x + 0.5), clip, t, ph, wph, Ma, Ta); boneXf(int(aBones.y + 0.5), clip, t, ph, wph, Mb, Tb);
      float aW = aWR.x; vec3 aTop = aCol0.rgb, aBot = aCol1.rgb, aSkin = aCol2.rgb, aAcc = aCol3; vec2 aOpt = vec2(aCol0.w, aCol1.w);
      vec3 aHair = mix(vec3(0.006, 0.005, 0.004), vec3(0.3, 0.29, 0.27), aCol2.w);
      vec3 transformed = aW * (Ma * position + Ta) + (1.0 - aW) * (Mb * position + Tb);
      vec3 objectNormal = normalize(aW * (Ma * normal) + (1.0 - aW) * (Mb * normal));
      float hipY = uPiv[0].y;
      if (clip > 5.5 && clip < 6.5) transformed.y -= hipY - 0.17;
      if (clip > 1.5 && clip < 2.5) transformed.y += 0.05 * abs(sin(t * 4.0 + ph));
      if (clip > 9.5 && clip < 10.5) transformed.y += hop(t, ph);
      if (clip > 12.5) transformed.y += hop(t, ph) * segW(watchF(t, ph), 0.6, 0.76);
      if (clip > 4.5 && clip < 5.5) { transformed.z += walked - wlen * 0.5; transformed.y += 0.025 * abs(cos(wph)); }
      int r = int(aWR.y + 0.5);
      vec3 col = aSkin;
      if (r == 1) col = aTop; else if (r == 2 || r == 8) col = aBot; else if (r == 3) col = aHair; else if (r == 4) col = aAcc;
      else if (r == 5) col = aSkin * 0.45; else if (r == 6) col = aOpt.x > 0.5 ? aSkin : aTop; else if (r == 7) col = aOpt.y > 0.5 ? aSkin : aBot;
      else if (r == 9) col = vec3(0.92, 0.9, 0.82);
      vCrowdCol = col;`;
  function crowdMaterial(piv) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    const P = []; for (let i = 0; i < 11; i++) P.push(new THREE.Vector3(piv[i * 3], piv[i * 3 + 1], piv[i * 3 + 2]));
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = CROWD_T; sh.uniforms.uPiv = { value: P };
      sh.vertexShader = POSE_GLSL + '\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', VERT_MAIN)
        .replace('#include <begin_vertex>', '');
      sh.fragmentShader = 'varying vec3 vCrowdCol;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vCrowdCol;');
    };
    m.customProgramCacheKey = () => 'crowd';
    return m;
  }
  // ---------------- staging: who stands where, doing what
  const people = [];   // [type, x, z, facing, clip, speed, walkLen]
  const W_ADULT = [['man_veshti', 13], ['man_lungi', 11], ['man_heavy', 6], ['man_trousers', 10], ['man_bare', 7], ['old_man', 4], ['teen_boy', 6],
                   ['woman_sari', 15], ['woman_sari_old', 6], ['woman_nighty', 6], ['girl', 5], ['boy', 6]];
  const wpick = lst => { let t = 0; for (const [, w] of lst) t += w; let v = rng() * t; for (const [k, w] of lst) { v -= w; if (v <= 0) return k; } return lst[0][0]; };
  const skirted = id => BODIES[id] && (BODIES[id].legs === 'skirt' || BODIES[id].legs === 'nighty');
  const sea = x => shoreZ(x) + EXTRA - 6;      // the front line stands near the new waterline
  // 1. a line of people along the water's edge, facing the sea
  for (let x = -96; x <= 96; x += 0.9 + rng() * 1.4) {
    const rows = 1 + (Math.abs(x) < 60 ? (rng() < 0.6 ? 2 : 1) : (rng() < 0.4 ? 1 : 0));
    for (let r = 0; r < rows; r++) {
      const id = wpick(W_ADULT); const z = sea(x) - 2.5 - r * (1.1 + rng() * 0.6) - rng() * 0.8;
      const c = rng(); const clip = c < 0.3 ? 13 : c < 0.44 ? 9 : c < 0.54 ? 0 : c < 0.62 ? 10 : c < 0.69 ? 11 : c < 0.74 ? 4 : c < 0.8 ? 3 : c < 0.86 ? 2 : c < 0.9 ? 7 : c < 0.95 ? 1 : 8;
      people.push([id, x + (rng() - 0.5) * 0.6, z, (rng() - 0.5) * 0.7, clip, 0.8 + rng() * 0.5, 0]);
    }
  }
  // 2. family and friend groups on the beach, facing each other
  for (let g = 0; g < 70; g++) {
    const x = (rng() - 0.5) * 190, z = sea(x) - 7 - rng() * 24; if (z < roadZ(x) + 2) continue;
    const n = 2 + ((rng() * 6) | 0); const rad = 0.7 + n * 0.18; const sitGroup = rng() < 0.3;
    for (let k = 0; k < n; k++) {
      let id = wpick(W_ADULT); const a = k / n * 6.283 + rng() * 0.4; const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      let clip = rng() < 0.5 ? 0 : (rng() < 0.75 ? 9 : 8);
      if (sitGroup && !skirted(id)) clip = 6;
      people.push([id, px, pz, Math.atan2(x - px, z - pz), clip, 0.7 + rng() * 0.6, 0]);
    }
  }
  // 3. children and strollers walking along the beach
  for (let k = 0; k < 40; k++) {
    const id = rng() < 0.4 ? pick(['boy', 'girl', 'teen_boy']) : wpick(W_ADULT); const x = (rng() - 0.5) * 180, z = sea(x) - 5 - rng() * 22;
    people.push([id, x, z, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 5, 0.9 + rng() * 0.5, 14 + rng() * 26]);
  }
  // 4. the temple street: walkers both ways and people at the stalls
  const zTop = LAY.plazaEdgeZ + 2, zBot = LAY.beachRoadZ0 - 3;
  for (let k = 0; k < 110; k++) {
    const id = wpick(W_ADULT); const up = rng() < 0.55; const x = (rng() - 0.5) * 7.0;
    const L = zBot - zTop; people.push([id, x, (zTop + zBot) / 2, up ? Math.PI : 0, 5, 0.8 + rng() * 0.4, L]);
  }
  for (const z of LAY.stallsZ) if (rng() < 0.7) for (const sx of [-1, 1]) if (rng() < 0.6) {
    const id = wpick(W_ADULT); people.push([id, sx * (4.6 - rng() * 0.6), z + (rng() - 0.5) * 1.5, sx * Math.PI / 2, rng() < 0.6 ? 9 : 0, 0.8 + rng() * 0.4, 0]);
  }
  // 5. the plaza in front of the gopuram
  for (let k = 0; k < 120; k++) {
    const x = (rng() - 0.5) * 70, z = 48 + rng() * 34;
    if ((Math.abs(x - 17) < 7 && Math.abs(z - 62) < 9) || (Math.abs(x + 9) < 3 && Math.abs(z - 58) < 3)) continue;
    const id = wpick(W_ADULT); const walk = rng() < 0.35;
    people.push([id, x, z, walk ? Math.PI + (rng() - 0.5) * 0.6 : Math.atan2(-x, 40 - z) + (rng() - 0.5) * 0.8, walk ? 5 : (rng() < 0.55 ? 9 : rng() < 0.6 ? 0 : 8), 0.8 + rng() * 0.4, walk ? 10 + rng() * 14 : 0]);
  }
  // 6. at the giant wheel: a queue at the gate, families watching from round the fence, children running about
  { const wx = RAAT.x, wz = RAAT.z;
    for (let k = 0; k < 14; k++) { const id = wpick(W_ADULT); people.push([id, wx + 1.6 + k * 0.72 + (rng() - 0.5) * 0.2, wz + 7.0 + (rng() - 0.5) * 0.3, -Math.PI / 2 + (rng() - 0.5) * 0.3, rng() < 0.6 ? 9 : 0, 0.8 + rng() * 0.4, 0]); }
    let placed = 0, tries = 0;
    while (placed < 60 && tries++ < 2000) {
      const a = rng() * Math.PI * 2, r = 11.5 + rng() * 9, px = wx + Math.cos(a) * r * 1.15, pz = wz + Math.sin(a) * r * 0.75;
      if (pz > 207.5 || (Math.abs(px - wx) < 10.4 && Math.abs(pz - wz) < 6.9) || (px > wx - 6 && px < wx - 2.4 && pz > wz + 6 && pz < wz + 9.5) || (px > wx + 1 && px < wx + 12 && Math.abs(pz - wz - 7) < 0.9)) continue;
      const id = wpick(W_ADULT); const c = rng();
      people.push([id, px, pz, Math.atan2(wx - px, wz - pz) + (rng() - 0.5) * 0.5, c < 0.55 ? 9 : c < 0.75 ? 0 : c < 0.87 ? 7 : 8, 0.8 + rng() * 0.4, 0]); placed++;
    }
    for (let k = 0; k < 10; k++) { const id = pick(['boy', 'girl', 'teen_boy']); const px = wx + (rng() - 0.5) * 30, pz = wz + 8.5 + rng() * 1.5;
      people.push([id, px, pz, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 5, 1.0 + rng() * 0.4, 6 + rng() * 10]); }
  }
  // ---------------- build one instanced mesh per body type
  const byType = {}; for (const p of people) (byType[p[0]] = byType[p[0]] || []).push(p);
  const blob = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }), people.length);
  let si = 0; const o = new THREE.Object3D();
  for (const [id, list] of Object.entries(byType)) {
    const B = BODIES[id]; if (!B) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dec(B.pos, Float32Array), 3));
    g.setIndex(new THREE.BufferAttribute(dec(B.idx, Uint16Array), 1));
    const bn = dec(B.bones, Uint8Array); g.setAttribute('aBones', new THREE.BufferAttribute(new Float32Array(bn), 2));
    { const w = dec(B.w, Float32Array), rg = dec(B.reg, Uint8Array); const wr = new Float32Array(w.length * 2); for (let i = 0; i < w.length; i++) { wr[i * 2] = w[i]; wr[i * 2 + 1] = rg[i]; } g.setAttribute('aWR', new THREE.BufferAttribute(wr, 2)); }
    g.computeVertexNormals();
    const n = list.length;
    const A = { aAnim: new Float32Array(n * 4), aCol0: new Float32Array(n * 4), aCol1: new Float32Array(n * 4), aCol2: new Float32Array(n * 4), aCol3: new Float32Array(n * 3) };
    const im = new THREE.InstancedMesh(g, crowdMaterial(B.piv), n);
    list.forEach(([, x, z, face, clip, spd, wlen], i) => {
      const s = 0.94 + rng() * 0.12;
      o.position.set(x, GH(x, z), z); o.rotation.set(0, face, 0); o.scale.set(s, s, s); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      A.aAnim.set([clip, rng() * 6.283, spd, wlen], i * 4);
      const of = outfit(id);
      A.aCol0.set([of.top.r, of.top.g, of.top.b, of.sleeveSkin], i * 4); A.aCol1.set([of.bot.r, of.bot.g, of.bot.b, of.shinSkin], i * 4);
      A.aCol2.set([of.skin.r, of.skin.g, of.skin.b, of.grey || 0], i * 4); A.aCol3.set([of.acc.r, of.acc.g, of.acc.b], i * 3);
      if (clip !== 5) { o.position.y = GH(x, z) + 0.03; o.rotation.set(0, 0, 0); o.scale.set(0.9, 1, 0.9); o.updateMatrix(); shadows.setMatrixAt(si++, o.matrix); }
    });
    for (const [k, v] of Object.entries(A)) g.setAttribute(k, new THREE.InstancedBufferAttribute(v, k === 'aCol3' ? 3 : 4));
    im.frustumCulled = false; SHORE_ROOT.add(im);
  }
  shadows.count = si; shadows.frustumCulled = false; SHORE_ROOT.add(shadows);
  window.__crowdCount = people.length;
})();

// ---- fishing nets heaped on the sand
(function nets() {
  const g = new THREE.IcosahedronGeometry(1, 1); const n = LAY.nets.length;
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), n); const o = new THREE.Object3D();
  LAY.nets.forEach(([x, z, r, c], i) => { o.position.set(x, 0.1, z); o.scale.set(r, r * 0.28, r * 0.75); o.rotation.set(0, i * 1.7, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new THREE.Color(c).convertSRGBToLinear()); });
  im.receiveShadow = im.castShadow = true; im.frustumCulled = false; SHORE_ROOT.add(im);
})();

// ---- electric wires: three sagging conductors between neighbouring poles of each line
(function wires() {
  const pos = [];
  const span = (a, b, ha, hb, along) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 60 || L < 2) return;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    for (const off of [-0.75, 0, 0.75]) {
      const ox = -uz * off, oz = ux * off; let prev = null;
      for (let s = 0; s <= 12; s++) { const t = s / 12; const y = ha + (hb - ha) * t + 8.75 - 0.012 * L * L * t * (1 - t) / 4;
        const p = [a[0] + (b[0] - a[0]) * t + ox, y, a[1] + (b[1] - a[1]) * t + oz]; if (prev) pos.push(...prev, ...p); prev = p; }
    }
  };
  for (const line of LAY.poleLines) for (let i = 0; i < line.length - 1; i++) span([line[i][0], line[i][1]], [line[i + 1][0], line[i + 1][1]], line[i][2], line[i + 1][2]);
  const sp = LAY.streetPoles.slice().sort((a, b) => a[1] - b[1]); for (let i = 0; i < sp.length - 1; i++) span(sp[i], sp[i + 1], 0, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  SHORE_ROOT.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c2a28 })));
})();

// ---- speaker horns: street poles, festival-ground palms, shamianas
(function speakers() {
  const horn = new THREE.CylinderGeometry(0.28, 0.06, 0.65, 10, 1, true); horn.rotateX(Math.PI / 2); horn.translate(0, 0, 0.32);
  const spots = [];
  for (const [x, z] of LAY.streetPoles) spots.push([x, 7.2, z, Math.sign(-x) * Math.PI / 2 + 0.6], [x, 7.2, z, Math.sign(-x) * Math.PI / 2 - 0.6]);
  for (const [x, z] of LAY.speakersPalm) for (const a of [-0.5, 0, 0.5]) spots.push([x, 7.6, z, a]);
  for (const [x, z] of LAY.shamianas) for (const a of [-0.4, 0.4]) spots.push([x + 8, 5.2, z + 5, a]);
  const im = new THREE.InstancedMesh(horn, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }), spots.length);
  const o = new THREE.Object3D(); spots.forEach(([x, y, z, a], i) => { o.position.set(x, y, z); o.rotation.set(0.12, a, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new THREE.Color(i % 3 ? 0x9aa0a6 : 0x3e6fb3).convertSRGBToLinear()); });
  im.frustumCulled = false; SHORE_ROOT.add(im);
})();

// ---- festival strings over the temple street and along the beach road
{
  const zA = LAY.beachRoadZ0 - 2, zB = LAY.plazaEdgeZ + 1;
  for (let z = zA, i = 0; z > zB; z -= 8, i++) { bunting([i % 2 ? -5.4 : 5.4, 6.0, z], [i % 2 ? 5.4 : -5.4, 6.0, z - 8], 0.8, true); bunting([i % 2 ? 5.4 : -5.4, 6.4, z], [i % 2 ? -5.4 : 5.4, 6.4, z - 8], 0.8, false); }
  for (const sx of [-5.6, 5.6]) for (let z = zA; z > zB; z -= 12) bunting([sx, 5.4, z], [sx, 5.4, z - 12], 0.25, true);
  const fg = LAY.road.filter(([x]) => Math.abs(x) <= 100);
  for (let i = 0; i < fg.length - 1; i += 2) bunting([fg[i][0], 5.2, fg[i][1] + 2], [fg[Math.min(i + 2, fg.length - 1)][0], 5.2, fg[Math.min(i + 2, fg.length - 1)][1] + 2], 0.6, true);
  for (const [x, z] of LAY.speakersPalm) bunting([x, 8.0, z], [x + (x > 0 ? 26 : -26), 8.0, z + 2], 1.4, false);
}

coping.forEach(p => bulbs.push(p));
const flagGeo = new THREE.BufferGeometry(); flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(flagPos, 3)); flagGeo.setAttribute('color', new THREE.Float32BufferAttribute(flagCol, 3)); flagGeo.computeVertexNormals();
const flags = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 })); flags.castShadow = true; SHORE_ROOT.add(flags);
const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffd75e, emissive: 0xffc840, emissiveIntensity: 0.7 }), bulbs.length);
bulbs.forEach((p, i) => { const o = new THREE.Object3D(); o.position.copy(p); o.updateMatrix(); bulbMesh.setMatrixAt(i, o.matrix); }); SHORE_ROOT.add(bulbMesh);
// load the three buildings and turn repeated parts into instanced meshes
const PIECES = [
  { name: 'gopuram', file: 'gopuram_model.js', at: [0, 0, POS.gopuram], s: SC.gopuram },
  { name: 'mandapam and flagstaff', file: 'mandapam_model.js', at: [0, 0, POS.mandapam], s: SC.mandapam },
  { name: 'vimana', file: 'vimana_model.js', at: [0, 0, POS.vimana], s: SC.vimana },
  { name: 'shrines, ther and tank', file: 'complex_model.js', at: [0, 0, 0], s: 1 },
  { name: 'trees and grass', file: 'veg_model.js', veg: true },
  { name: 'palms', file: 'palm_model.js', palms: true },
  { name: 'village', file: 'village_model.js', at: [0, 0, 0], s: 1 },
];
const totals = { parts: 0, draws: 0, tris: 0, bytes: 0, loaded: 0 };

const WALL_TINT = { wall_white: '#f3f1ea', wall_pink: '#eab3bf', wall_blue: '#a9cbe8', wall_green: '#b6dcb4', wall_yellow: '#f1dc8e',
  wall_lavender: '#c9b9e3', wall_peach: '#f2c3a0', wall_cream: '#efe3c6', wall_mint: '#a8e0d2' };

function prepare(gltf, at, sc) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => { if (!o.isMesh || /wall_stubs|complex_anchor/.test(o.name + (o.parent ? o.parent.name : ''))) return; totals.parts++;
    const k = o.geometry.uuid + '|' + o.material.uuid; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); });
  const out = new THREE.Group(); out.position.set(...at); out.scale.setScalar(sc || 1); const singles = new Map();
  for (const list of groups.values()) {
    const src = list[0]; const m = src.material;
    if (m.map) m.map.anisotropy = ANISO;
    if (m.metalness > 0.5) { m.metalness = 0.35; m.roughness = 0.32; m.color.multiplyScalar(1.15); weather(m, 'metal'); }
    else if (/^ceil/.test(m.name)) { m.roughness = 0.95; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.22; weather(m, 'ceiling'); }
    else { m.roughness = Math.max(m.roughness, 0.9); if (WALL_TINT[m.name]) m.color.set(WALL_TINT[m.name]); weather(m, 'paint'); }
    const nt = (src.geometry.index ? src.geometry.index.count : src.geometry.attributes.position.count) / 3;
    totals.tris += nt * list.length; totals.draws++;
    if (list.length === 1) { const g = src.geometry, key = m.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + !!g.index; if (!singles.has(key)) singles.set(key, { m, geos: [] }); singles.get(key).geos.push(g.clone().applyMatrix4(src.matrixWorld)); continue; }
    const im = new THREE.InstancedMesh(src.geometry, m, list.length);
    list.forEach((o, i) => im.setMatrixAt(i, o.matrixWorld)); im.castShadow = im.receiveShadow = true; out.add(im);
  }
  const BGU = THREE.BufferGeometryUtils;
  for (const { m, geos } of singles.values()) {
    const merged = geos.length > 1 && BGU ? BGU.mergeBufferGeometries(geos) : null;
    if (merged) { out.add(new THREE.Mesh(merged, m)); totals.draws -= geos.length - 1; }
    else geos.forEach(g => out.add(new THREE.Mesh(g, m)));
  }
  SHORE_ROOT.add(out);
}
// ---- load the buildings in order, reporting progress; everything is shadow-free in the race
const base = opts.base || 'shore/';
async function loadAll(onProgress) {
  const done = new Array(PIECES.length).fill(0), size = new Array(PIECES.length).fill(0);
  const report = () => onProgress && onProgress(done.reduce((a, b) => a + b, 0) / Math.max(1, size.reduce((a, b) => a + b, 0) || PIECES.length * 2e6));
  const bufs = await Promise.all(PIECES.map(async (p, i) => {
    const r = await fetch(base + p.file); if (!r.ok) throw new Error(p.file + ' ' + r.status);
    size[i] = +r.headers.get('content-length') || 2e6;
    const rd = r.body.getReader(), chunks = [];
    for (;;) { const { done: d, value } = await rd.read(); if (d) break; chunks.push(value); done[i] = Math.min(done[i] + value.length, size[i]); report(); }
    // each model is a script holding the .glb as base64 (artifacts serve .js, not .glb)
    const t = await new Blob(chunks).text(), b64 = t.slice(t.indexOf('"') + 1, t.lastIndexOf('"'));
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return u.buffer;
  }));
  const saved = window.createImageBitmap;
  for (let i = 0; i < PIECES.length; i++) {
    const p = PIECES[i];
    try { window.createImageBitmap = undefined; } catch (e) {}
    const gltf = await new Promise((ok, no) => new THREE.GLTFLoader().parse(bufs[i], '', ok, no)).finally(() => { try { window.createImageBitmap = saved; } catch (e) {} });
    if (p.veg) plantVeg(gltf); else if (p.palms) plantPalms(gltf); else prepare(gltf, p.at, p.s);
    await new Promise(r => setTimeout(r, 0));
  }
  SHORE_ROOT.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  SHORE_ROOT.updateMatrixWorld(true);
}
const tick = dt => { CROWD_T.value += dt; for (const f of TICK) f(dt); };
return { root: SHORE_ROOT, tick, loadAll, shoreZ, GH };
};
