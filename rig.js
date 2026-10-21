/* Paaimaram rig, one per boat: the yard pivoting at its sling, the triangular paai cloth, the rolled lower
 * leech, the sheet and the ropes in the crew's hands. Boat frame: x forward, y up, z starboard.
 * From the 3D boat viewer; each boat now has its own cloth.  Needs THREE (r128). */
(function (root) {
  const THREE = root.THREE;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V3(0, 1, 0);
  const SLING = V3(1.544, 5.208, 0);
  const LAT = 0.14;
  const FOOT_A = -4.584;
  const TACK_A = -4.334, PEAK_A = 9.316;
  // raised for changing sides, the yard leans a little forward, parallel to the raked mast, so it can stand clear of it
const E_SAIL = 49 * Math.PI / 180, E_UP = 95 * Math.PI / 180;
  const CLEW_REST = V3(-4.25, 2.45, 0.35);
  const SX0 = -1.0, SX1 = 10.0, SZ0 = 1.2, SZ1 = 13.0;
  const NS = 30, NT = 22;
  const ROLL_J = Math.round(NT * 0.16);

  function yardAxis(e, lat, out) { return out.set(-Math.cos(e), Math.sin(e), lat / -FOOT_A).normalize(); }
  function aftDown(e, u, out) { out.set(-Math.sin(e), -Math.cos(e), 0); return out.addScaledVector(u, -out.dot(u)).normalize(); }
  const u0 = yardAxis(E_SAIL, LAT, V3()), Q0 = V3(SLING.x, SLING.y, LAT);
  const CLEW_A = CLEW_REST.clone().sub(Q0).dot(u0);
  const CLEW_R = CLEW_REST.clone().sub(Q0).addScaledVector(u0, -CLEW_A).length();
  const rigQ = new THREE.Quaternion();
  // the mast: a raked pole from (1.08, 0) to (1.73, 7.15), 0.11 thick at most. Nothing of the rig may pass through it:
  // the yard is pushed clear at the sling, and the cloth drapes round the mast on the yard's side.
  const MAST_X0 = 1.08, MAST_K = (1.73 - 1.08) / 7.15, MAST_Y0 = -0.3, MAST_Y1 = 7.45;
  const YARD_CLR = 0.2, CLOTH_CLR = 0.17;
  const mastX = y => MAST_X0 + MAST_K * y;
  function clearYard(Q, u) {
    for (let it = 0; it < 4; it++) {
      let dmin = 1e9, ox = 0, oz = 0;
      for (let t = TACK_A; t <= PEAK_A; t += 0.2) {
        const y = Q.y + t * u.y; if (y < MAST_Y0 || y > MAST_Y1) continue;
        const dx = Q.x + t * u.x - mastX(y), dz = Q.z + t * u.z, d = Math.hypot(dx, dz);
        if (d < dmin) { dmin = d; ox = dx; oz = dz; }
      }
      if (dmin >= YARD_CLR) return;
      const k = dmin > 1e-4 ? 1 / dmin : 0, push = YARD_CLR - dmin + 0.002;
      const fx = Math.max(ox, 0), L = Math.hypot(fx, oz);                       // never pushed aft through the mast
      if (L > 1e-4) { Q.x += fx / L * push; Q.z += oz / L * push; } else Q.x += push;
    }
  }
  // hoist: 0 = yard lowered to the deck before the start, 1 = up at the sling. The sling rides up the mast.
  const SLING_LOW = 2.75;           // lowered, the yard still clears the crew's heads (it rests on its lift)
  // the hull, as the crew sees it (crew.js): sheer and half-beam from the stern, the decks they stand on
  const _tab = (xs, ys) => x => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[ys.length - 1]; };
  const _sh = _tab([0, 1, 2, 3, 4.5, 6, 7, 8, 9, 9.6], [1.15, 0.98, 0.86, 0.80, 0.78, 0.80, 0.86, 0.98, 1.20, 1.45]);
  const _hb = _tab([0, 0.5, 1, 2, 3.8, 5, 6, 7, 8, 8.8, 9.3, 9.6], [0.55, 0.70, 0.80, 0.89, 0.95, 0.95, 0.92, 0.86, 0.72, 0.50, 0.25, 0.03]);
  const sheerY = x => _sh(x + 4.8), halfBeam = x => _hb(x + 4.8);
  const deckY = x => x > 3.56 ? sheerY(4.05) - 0.04 : x < -4.06 ? sheerY(-4.38) - 0.04 : sheerY(x) - 0.30;
  const HEAD_CLR = 1.78;            // the cloth stays above a standing man's head while she is going up
  const MAST_W = 0.75;              // the cloth wraps round the mast over this width either side: no sharp fold, no poke-through
  function rigPose(e, lat, delta, R, hoist) {
    const h = hoist === undefined ? 1 : Math.max(0, Math.min(1, hoist));
    const sy = SLING_LOW + (SLING.y - SLING_LOW) * h;
    // the sling goes round the mast on a circle: beside it when the yard leans to a side, in front of it when raised
    const phi = Math.max(-1, Math.min(1, lat / LAT)) * Math.PI / 2;
    R.Q.set(mastX(sy) + YARD_CLR * Math.cos(phi), sy, YARD_CLR * Math.sin(phi));
    yardAxis(e, lat, R.u);
    clearYard(R.Q, R.u);
    aftDown(e, R.u, R.w);
    R.A.copy(R.Q).addScaledVector(R.u, TACK_A);
    R.B.copy(R.Q).addScaledVector(R.u, PEAK_A);
    rigQ.setFromAxisAngle(R.u, delta);
    // a lowered paai is gathered along its yard; it opens out below the yard as she is hoisted
    const open = h >= 1 ? 1 : 0.035 + 0.965 * h * h * (3 - 2 * h);
    R.C.copy(R.w).applyQuaternion(rigQ).multiplyScalar(CLEW_R * open).add(R.Q).addScaledVector(R.u, CLEW_A * (0.55 + 0.45 * open));
    return R;
  }
  function bellyShape(s, t) { return Math.pow(s, 0.7) * Math.sqrt(Math.max(1.08 - s, 0)) * (1 - t) * Math.pow(0.25 + t, 0.7); }
  const BELLY_MAX = (() => { let m = 0; for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) m = Math.max(m, bellyShape(i / 40, j / 40)); return m; })();
  const BELLY = new Float32Array((NS + 1) * (NT + 1));
  for (let i = 0, k = 0; i <= NS; i++) for (let j = 0; j <= NT; j++, k++) BELLY[k] = bellyShape(i / NS, j / NT) / BELLY_MAX;
  const INDEX = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; INDEX.push(a, b, a + 1, a + 1, b, b + 1); }

  const _F = V3(), _H = V3(), _P = V3(), _n = V3(), _r = V3(), _e = V3(), _m = V3(), _tmp = V3();
  function shapeSail(pos, R, fill, flap, time, windTo, uv) {
    _n.subVectors(R.B, R.A).cross(_tmp.subVectors(R.C, R.A)).normalize();
    if (_n.dot(windTo) < 0) _n.negate();
    _e.subVectors(R.B, R.C).normalize();
    _m.addVectors(R.B, R.C).multiplyScalar(0.5).sub(R.A);
    _r.copy(_m).addScaledVector(_e, -_m.dot(_e)).normalize();
    let k = 0;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      _F.lerpVectors(R.A, R.C, s); _F.y -= 0.28 * 4 * s * (1 - s);
      _H.lerpVectors(R.A, R.B, s);
      for (let j = 0; j <= NT; j++, k++) {
        const t = j / NT;
        _P.lerpVectors(_F, _H, t);
        _P.addScaledVector(_r, 0.7 * 4 * t * (1 - t) * s * s * s);
        let d = 1.1 * fill * BELLY[k];
        if (flap > 0) d += flap * Math.sin(8.5 * s - 2.5 * t - 13 * time) * Math.pow(s, 1.2) * (1 - 0.75 * t) * (0.6 + 0.4 * Math.sin(5 * t + 9 * time));
        _P.addScaledVector(_n, d);
        pos[k * 3] = _P.x; pos[k * 3 + 1] = _P.y; pos[k * 3 + 2] = _P.z;
        if (uv) { uv[k * 2] = (_P.x + 4.8 - SX0) / (SX1 - SX0); uv[k * 2 + 1] = 1 - (_P.y - SZ0) / (SZ1 - SZ0); }
      }
    }
  }
  // texture coordinates from the rest shape, shared by every boat
  const UV = new Float32Array((NS + 1) * (NT + 1) * 2);
  {
    const R = { Q: V3(), u: V3(), w: V3(), A: V3(), B: V3(), C: V3() };
    const d = CLEW_REST.clone().sub(Q0); d.addScaledVector(u0, -d.dot(u0));
    const w = aftDown(E_SAIL, u0, V3());
    const delta0 = Math.atan2(d.dot(V3().crossVectors(u0, w)), d.dot(w));
    shapeSail(new Float32Array((NS + 1) * (NT + 1) * 3), rigPose(E_SAIL, LAT, delta0, R), 1, 0, 0, V3(0, 0, 1), UV);
  }

  function orient(mesh, p0, p1) {
    mesh.position.addVectors(p0, p1).multiplyScalar(0.5);
    _tmp.subVectors(p1, p0);
    mesh.scale.set(1, Math.max(1e-3, _tmp.length()), 1);
    mesh.quaternion.setFromUnitVectors(UP, _tmp.normalize());
  }

  const rollGeo = new THREE.CylinderGeometry(0.05, 0.075, 1, 10);
  const lineGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
  const ropeGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 5);

  class BoatRig {
    // boat: the boat's Object3D (frame as above); yard: the yard mesh in it; sailMat, ropeMat
    constructor(boat, yard, sailMat, ropeMat, opts = {}) {
      this.boat = boat;
      this.R = { Q: V3(), u: V3(), w: V3(), A: V3(), B: V3(), C: V3() };
      this.pos = new Float32Array((NS + 1) * (NT + 1) * 3);
      const g = this.geo = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      g.setIndex(INDEX);
      this.yardPivot = new THREE.Group();
      this.yardPivot.position.copy(Q0);
      boat.add(this.yardPivot);
      boat.updateMatrixWorld(true);
      if (yard) this.yardPivot.attach(yard);
      this.sail = new THREE.Mesh(g, sailMat);
      this.sail.castShadow = !!opts.shadows; this.sail.receiveShadow = !!opts.shadows; this.sail.frustumCulled = false;
      this.roll = new THREE.Mesh(rollGeo, sailMat); this.roll.castShadow = !!opts.shadows;
      this.sheet = new THREE.Mesh(lineGeo, ropeMat);
      boat.add(this.sail, this.roll, this.sheet);
      this.ropes = [];
      for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(ropeGeo, ropeMat); r.visible = false; boat.add(r); this.ropes.push(r); }
      this.clew = V3(); this.rollTop = V3(); this.quarter = V3(-4.45, 1.12, 0); this.yardFoot = V3();
      this.normalT = 0;
    }
    // e: yard elevation, lat: how far the yard sits to one side, delta: clew angle round the yard
    // (0 = over the stern, + toward starboard), fill/flap: cloth, windTo: where the wind blows, boat frame
    update(e, lat, delta, fill, flap, time, windTo, normals, hoist) {
      const R = rigPose(e, lat, delta, this.R, hoist);
      this.yardPivot.position.copy(R.Q);
      this.yardPivot.quaternion.setFromUnitVectors(u0, R.u);
      shapeSail(this.pos, R, fill, flap, time, windTo, null);
      // the cloth never passes through the boat: collisions, vertex by vertex, wide and smooth enough that the
      // triangles between the vertices stay clear too
      {
        const p = this.pos, n = p.length / 3;
        // 1. while she is going up, the gathered cloth hangs above the crew and the deck, never through them
        const h = hoist === undefined ? 1 : hoist;
        const kf = h >= 1 ? 0 : h < 0.82 ? 1 : (1 - h) / 0.18;
        if (kf > 0) {
          const ux = R.u.x, uy = R.u.y;
          for (let k = 0; k < n; k++) {
            const x = p[k * 3], z = p[k * 3 + 2];
            if (x < -4.4 || x > 4.1 || Math.abs(z) > halfBeam(x) + 0.25) continue;
            const yardY = Math.abs(ux) > 1e-3 ? R.Q.y + (x - R.Q.x) / ux * uy : R.Q.y;
            const floor = Math.min(deckY(x) + HEAD_CLR, yardY - 0.05);
            const y = p[k * 3 + 1];
            if (y < floor) p[k * 3 + 1] = y + (floor - y) * kf;
          }
        }
        // 1b. the crew: the cloth goes round a man, never through him. Each body is a sphere; the cloth near
        // it is pushed off along the sail's normal, all one way, so the sheet bends round him and never splits
        if (this.bodies && this.bodies.length) {
          const nx = _n.x, ny = _n.y, nz = _n.z;            // the sail's normal from shapeSail
          for (const bd of this.bodies) {
            const rr = bd.r + 0.26;
            // which side of the cloth is he on? the cloth goes to the other side
            const sd = (bd.x - R.A.x) * nx + (bd.y - R.A.y) * ny + (bd.z - R.A.z) * nz >= 0 ? -1 : 1;
            const mx = nx * sd, my = ny * sd, mz = nz * sd;
            for (let k = 0; k < n; k++) {
              const rx = p[k * 3] - bd.x, ry = p[k * 3 + 1] - bd.y, rz = p[k * 3 + 2] - bd.z;
              if (rx * rx + ry * ry + rz * rz > rr * rr * 4) continue;
              const al = rx * mx + ry * my + rz * mz;
              const lx = rx - al * mx, ly = ry - al * my, lz = rz - al * mz, l2 = lx * lx + ly * ly + lz * lz;
              if (l2 >= rr * rr) continue;
              const need = Math.sqrt(rr * rr - l2);
              if (al < need) { const dd = need - al; p[k * 3] += mx * dd; p[k * 3 + 1] += my * dd; p[k * 3 + 2] += mz * dd; }
            }
          }
        }
        // 2. nothing under the gunwale: the cloth lies over the boat's side, never inside the hull
        for (let k = 0; k < n; k++) {
          const x = p[k * 3], z = p[k * 3 + 2];
          if (x < -4.8 || x > 4.6 || Math.abs(z) > halfBeam(x) + 0.06) continue;
          const fl = sheerY(x) + 0.06;
          if (p[k * 3 + 1] < fl) p[k * 3 + 1] = fl;
        }
        // 3. the mast: the cloth is laid round it on the yard's side, with a broad smooth bulge
        // with the yard square in front of the mast either side would do: take the one away from the man at the mast
        let side = Math.abs(R.Q.z) > 0.05 ? Math.sign(R.Q.z) : 0;
        if (!side && this.bodies) { let best = 0.9; for (const bd of this.bodies) { const dx = Math.abs(bd.x - mastX(bd.y)); if (dx < best && Math.abs(bd.z) > 0.05) { best = dx; side = -Math.sign(bd.z); } } }
        side = side || Math.sign(R.C.z) || 1;
        for (let k = 0; k < n; k++) {
          const y = p[k * 3 + 1]; if (y < MAST_Y0 || y > MAST_Y1 + 0.45) continue;
          const dx = p[k * 3] - mastX(y); if (dx <= -MAST_W || dx >= MAST_W) continue;
          const f = 1 - (dx / MAST_W) * (dx / MAST_W), fy = y > MAST_Y1 ? 1 - (y - MAST_Y1) / 0.45 : 1;
          const zmin = 0.21 * f * f * fy;
          if (side * p[k * 3 + 2] < zmin) p[k * 3 + 2] = side * zmin;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
      if (normals) this.geo.computeVertexNormals();
      const kc = NS * (NT + 1), kt = kc + ROLL_J, p = this.pos;
      this.clew.set(p[kc * 3], p[kc * 3 + 1], p[kc * 3 + 2]);
      this.rollTop.set(p[kt * 3], p[kt * 3 + 1], p[kt * 3 + 2]);
      orient(this.roll, this.clew, this.rollTop);
      this.quarter.z = (this.clew.z >= 0 ? 1 : -1) * 0.55;
      this.yardFoot.copy(R.Q).addScaledVector(R.u, FOOT_A);
    }
    // the sheet and the lines in the crew's hands
    lines(director, Crew) {
      let ri = 0, held = false;
      for (const r of this.ropes) r.visible = false;
      const rope = (a, b) => { if (ri < this.ropes.length) { this.ropes[ri].visible = true; orient(this.ropes[ri++], a, b); } };
      if (director) for (const c of director.list) {
        const mid = _m.addVectors(c.hands.L, c.hands.R).multiplyScalar(0.5);
        if (c.holding === 'hand-line') rope(Crew.MASTHEAD, mid.clone());
        else if (c.holding === 'guy') {     // the yard's guy: from his fists up to the yard, just aft of him
          const R = this.R, t = Math.max(-4.3, Math.min(0, (c.pos.x - 1.1 - R.Q.x) / (R.u.x || -1)));
          rope(V3(R.Q.x + R.u.x * t, R.Q.y + R.u.y * t, R.Q.z + R.u.z * t), c.hands.R.y > c.hands.L.y ? c.hands.R.clone() : c.hands.L.clone());
        }
        else if (c.holding === 'halyard') rope(Crew.MASTHEAD, c.hands.L.y > c.hands.R.y ? c.hands.L : c.hands.R);
        else if (c.holding === 'tail') rope(Crew.TAIL_FROM, c.hands.L.distanceTo(Crew.TAIL_FROM) < c.hands.R.distanceTo(Crew.TAIL_FROM) ? c.hands.L : c.hands.R);
        else if (c.holding === 'sheet') {
          held = true;
          const mm = mid.clone();
          orient(this.sheet, this.clew, mm);
          rope(mm, V3(this.quarter.x, this.quarter.y, (mm.z >= 0 ? 1 : -1) * 0.55));
        }
      }
      if (!held) orient(this.sheet, this.clew, this.quarter);
    }
  }

  root.PaaiRig = { BoatRig, rigPose, E_SAIL, E_UP, LAT, FOOT_A, Q0, u0, NS, NT, SLING_LOW, mastX, deckY, sheerY, halfBeam };
})(typeof window !== 'undefined' ? window : globalThis);
