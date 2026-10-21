/* Paaimaram sea: Gerstner waves shared by the ocean shader and the floating boat.
 * Coordinates are the boat model's: x forward, y up, z to starboard, metres.
 * Needs THREE (r128) on the page or as a global. */
(function (root) {
  const THREE = root.THREE;
  const G = 9.81, RHO = 1025;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- waves ----------
  // [direction offset from the wind (rad), wavelength (m), steepness]
  const BASE = [[0, 34, 0.10], [0.35, 22, 0.10], [-0.42, 15, 0.09], [0.8, 10, 0.08],
                [-0.9, 6.5, 0.07], [0.15, 4.5, 0.06], [1.3, 3.2, 0.05], [-1.2, 2.2, 0.04]];

  function makeWaves(seaState, windDeg) {
    const w = windDeg * Math.PI / 180;
    return BASE.map(([off, L, s]) => {
      const a = w + off;
      const k = 2 * Math.PI / L;
      return { dx: Math.cos(a), dz: Math.sin(a), steep: s * seaState, L, k, c: Math.sqrt(G / k) };
    });
  }

  // Displacement of the surface point that starts at (px, pz), and its velocity.
  function displace(waves, px, pz, t, camX, camZ, out) {
    let dx = 0, dy = 0, dz = 0, vx = 0, vy = 0, vz = 0;
    const dist = Math.hypot(px - camX, pz - camZ);
    for (const w of waves) {
      const fade = 1 - smooth(w.L * 25, w.L * 60, dist);
      if (fade <= 0) continue;
      const f = w.k * (w.dx * px + w.dz * pz - w.c * t);
      const a = w.steep / w.k * fade;
      const cf = Math.cos(f), sf = Math.sin(f);
      dx += w.dx * a * cf; dy += a * sf; dz += w.dz * a * cf;
      const kc = w.k * w.c;
      vx += w.dx * a * kc * sf; vy += -a * kc * cf; vz += w.dz * a * kc * sf;
    }
    out.dx = dx; out.dy = dy; out.dz = dz; out.vx = vx; out.vy = vy; out.vz = vz;
    return out;
  }

  // Water height and velocity at a fixed horizontal position (x, z): the surface moves sideways
  // as well as up, so find the point whose displaced position lands on (x, z).
  const tmpD = {}, waveOut = { y: 0, vx: 0, vy: 0, vz: 0 };
  // returns a shared object: copy what you need before the next call
  function waveAt(waves, x, z, t, camX, camZ, iters) {
    let px = x, pz = z;
    const n = iters === undefined ? 3 : iters;
    for (let i = 0; i < n; i++) {
      displace(waves, px, pz, t, camX, camZ, tmpD);
      px = x - tmpD.dx; pz = z - tmpD.dz;
    }
    displace(waves, px, pz, t, camX, camZ, tmpD);
    waveOut.y = tmpD.dy; waveOut.vx = tmpD.vx; waveOut.vy = tmpD.vy; waveOut.vz = tmpD.vz;
    if (extra) waveOut.y += extra(x, z, t);
    return waveOut;
  }
  // an extra surface shape on top of the waves (the whirlpool's funnel)
  let extra = null;
  function setExtra(fn) { extra = fn; }
  const _F = new THREE.Vector3(), _T = new THREE.Vector3(), _r = new THREE.Vector3(), _pv = new THREE.Vector3(), _f = new THREE.Vector3(),
        _c = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _Iw = new THREE.Vector3(),
        _R = new THREE.Matrix4(), _Rt = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qy2 = new THREE.Quaternion(),
        _up = new THREE.Vector3(0, 1, 0);

  // ---------- hull tables (from the drawings; x from the stern, 0 to 9.6) ----------
  function table(xs, ys) {
    return x => {
      if (x <= xs[0]) return ys[0];
      for (let i = 1; i < xs.length; i++) if (x <= xs[i]) {
        const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
      }
      return ys[ys.length - 1];
    };
  }
  const sheer = table([0, 1, 2, 3, 4.5, 6, 7, 8, 9, 9.6], [1.15, 0.98, 0.86, 0.80, 0.78, 0.80, 0.86, 0.98, 1.20, 1.45]);
  const half = table([0, 0.5, 1, 2, 3.8, 5, 6, 7, 8, 8.8, 9.3, 9.6], [0.55, 0.70, 0.80, 0.89, 0.95, 0.95, 0.92, 0.86, 0.72, 0.50, 0.25, 0.03]);
  const keel = table([0, 0.3, 1, 3, 7, 8.6, 9.05, 9.35, 9.55, 9.6], [-0.20, -0.30, -0.38, -0.45, -0.45, -0.38, -0.10, 0.40, 1.00, 1.40]);

  // ---------- the floating boat ----------
  class FloatingBoat {
    constructor(opts = {}) {
      this.mass = opts.mass || 2200;
      // buoyancy points: bottom of the hull (keel line and the turn of the bilge) and higher
      // up the sides, which only come into play when the boat heels or meets a wave
      const pts = [];
      for (const xd of [0.5, 1.4, 2.4, 3.4, 4.4, 5.4, 6.4, 7.4, 8.3, 8.9]) {
        const b = half(xd), s = sheer(xd), k = keel(xd);
        pts.push({ x: xd - 4.8, y: k, z: 0, w: 1.0 });
        for (const side of [-1, 1]) {
          pts.push({ x: xd - 4.8, y: s + (k - s) * 0.86, z: side * 0.74 * b, w: 0.85 });
          // the waterline itself: full beam, just in the water. These give the hull its
          // resistance to rolling, as the waterplane of a real hull does.
          pts.push({ x: xd - 4.8, y: Math.max(k + 0.05, -0.05), z: side * 0.97 * b, w: 0.5 });
          pts.push({ x: xd - 4.8, y: 0.3, z: side * 0.99 * b, w: 0.7 });
        }
      }
      // keep only points that are actually in the water at rest, plus the upper side points
      this.points = pts.filter(p => p.y < -0.02 || p.y > 0.2);
      const atRest = this.points.filter(p => p.y < 0);
      const vol = atRest.reduce((s, p) => s + p.w * -p.y, 0);
      this.areaUnit = this.mass / (RHO * vol);                    // so it floats exactly at the waterline
      const comX = atRest.reduce((s, p) => s + p.w * -p.y * p.x, 0) / vol;
      this.com = new THREE.Vector3(comX, 0.1, 0);                 // centre of mass over the centre of buoyancy, kept low by ballast and crew
      for (const p of this.points) p.local = new THREE.Vector3(p.x, p.y, p.z).sub(this.com);
      // inertia: a long, narrow hull with a tall rig
      const m = this.mass;
      this.I = new THREE.Vector3(m / 12 * (1.9 * 1.9 + 1.2 * 1.2) * 5.0, m / 12 * (9.6 * 9.6 + 1.9 * 1.9), m / 12 * (9.6 * 9.6 + 1.2 * 1.2));
      // damping from the hull's stiffness
      const sumW = atRest.reduce((s, p) => s + p.w, 0);
      const kHeave = RHO * G * this.areaUnit * sumW;
      this.cUnit = 2 * 0.28 * Math.sqrt(kHeave * m) / sumW;
      const kRoll = RHO * G * this.areaUnit * atRest.reduce((s, p) => s + p.w * p.z * p.z, 0);
      this.cRoll = 2 * 0.22 * Math.sqrt(kRoll * this.I.x);
      this.hUnit = m * 1.2 / sumW;
      this.reset();
    }
    reset() {
      this.pos = this.com.clone();                // centre of mass, world
      this.vel = new THREE.Vector3();
      this.quat = new THREE.Quaternion();
      this.omega = new THREE.Vector3();
      this.depths = this.points.map(() => 0);
      this.bowImpact = 0;
    }
    // world transform of the model origin
    modelPosition(out) { return out.copy(this.com).applyQuaternion(this.quat).negate().add(this.pos); }

    // env.follow = { x, z, vx, vz, yaw, yawRate }: the race simulation owns where the boat is and which
    // way it points; the sea only decides how she rises, falls, pitches and heels.
    step(dt, env) {
      const q = this.quat, m = this.mass, I = this.I, fo = env.follow;
      const F = _F.set(0, -m * G, 0), T = _T.set(0, 0, 0);
      const r = _r, pv = _pv, f = _f;
      const cvx = fo ? fo.vx : 0, cvz = fo ? fo.vz : 0;
      this.bowImpact = 0;
      const pts = this.points;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        r.copy(p.local).applyQuaternion(q);
        const wx = this.pos.x + r.x, wy = this.pos.y + r.y, wz = this.pos.z + r.z;
        const w = waveAt(env.waves, wx, wz, env.t, env.camX, env.camZ, env.iters);
        const depth = w.y - wy;
        this.depths[i] = depth;
        if (depth <= 0) continue;
        pv.copy(this.omega).cross(r).add(this.vel);       // velocity of this point
        const d = Math.min(depth, 1.0);
        const lift = RHO * G * this.areaUnit * p.w * d - this.cUnit * p.w * (pv.y - w.vy);
        f.set(-this.hUnit * p.w * (pv.x - cvx - w.vx), Math.max(lift, -RHO * G * this.areaUnit * p.w * 0.5), -this.hUnit * p.w * (pv.z - cvz - w.vz));
        F.add(f);
        T.add(_c.copy(r).cross(f));
        if (p.x > 3.2 && p.z === 0) this.bowImpact = Math.max(this.bowImpact, (w.vy - pv.y));
      }
      if (fo) return this.stepFollow(dt, env, F, T);
      // wind on the paai pushes the boat over to leeward, high up
      if (env.windOn && env.side) {
        const loc = new THREE.Vector3(0, 4.7, env.side * 1.2).sub(this.com).applyQuaternion(q);
        const dir = new THREE.Vector3(0, 0, env.side).applyQuaternion(q).multiplyScalar(env.windN);
        F.add(dir); T.add(loc.cross(dir));
      }
      // two balancers out on the windward end of the plank
      // the crew: each person's weight where he is
      if (env.crewLoads) for (const c of env.crewLoads) {
        const loc = c.p.clone().sub(this.com).applyQuaternion(q);
        const wgt = new THREE.Vector3(0, -c.m * G, 0);
        F.add(wgt); T.add(loc.cross(wgt));
      }
      const crewZ = env.crewZ !== undefined ? env.crewZ : -(env.side || 0) * 3.4;
      if (env.plankCrew && (env.crewPos || env.crewZ !== undefined || env.side)) {
        const loc = (env.crewPos ? env.crewPos.clone() : new THREE.Vector3(0.47, 0.95, crewZ)).sub(this.com).applyQuaternion(q);
        const wgt = new THREE.Vector3(0, -(env.crewMass || 140) * G, 0);
        F.add(wgt); T.add(loc.cross(wgt));
      }
      // keep the boat near its mooring and roughly head to the camera's chosen heading
      F.x += -m * 0.25 * this.pos.x - m * 0.8 * this.vel.x;
      F.z += -m * 0.25 * this.pos.z - m * 0.8 * this.vel.z;
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const yaw = Math.atan2(-fwd.z, fwd.x) - (env.heading || 0);
      T.y += -I.y * 0.5 * Math.atan2(Math.sin(yaw), Math.cos(yaw)) - I.y * 1.2 * this.omega.y;
      // roll damping from the hull, the plank and the sorugu palagai moving through the water
      const xAxis = fwd;
      T.addScaledVector(xAxis, -this.cRoll * this.omega.dot(xAxis));

      // integrate
      this.vel.addScaledVector(F, dt / m);
      this.pos.addScaledVector(this.vel, dt);
      const R = new THREE.Matrix4().makeRotationFromQuaternion(q);
      const Rt = R.clone().transpose();
      const tb = T.clone().applyMatrix4(Rt);                 // torque in body axes
      const wb = this.omega.clone().applyMatrix4(Rt);
      // Euler's equations (gyroscopic term) in body axes
      const Iw = new THREE.Vector3(I.x * wb.x, I.y * wb.y, I.z * wb.z);
      tb.sub(wb.clone().cross(Iw));
      wb.x += tb.x / I.x * dt; wb.y += tb.y / I.y * dt; wb.z += tb.z / I.z * dt;
      this.omega.copy(wb.applyMatrix4(R));
      const dq = new THREE.Quaternion(this.omega.x * dt / 2, this.omega.y * dt / 2, this.omega.z * dt / 2, 0).multiply(q);
      q.x += dq.x; q.y += dq.y; q.z += dq.z; q.w += dq.w;
      q.normalize();
    }

    stepFollow(dt, env, F, T) {
      const q = this.quat, m = this.mass, I = this.I, fo = env.follow;
      if (env.windOn && env.side) {
        const loc = _a.set(0, 4.7, env.side * 1.2).sub(this.com).applyQuaternion(q);
        const dir = _b.set(0, 0, env.side).applyQuaternion(q).multiplyScalar(env.windN);
        F.add(dir); T.add(loc.cross(dir));
      }
      if (env.crewLoads) for (const c of env.crewLoads) {
        const loc = _a.copy(c.p).sub(this.com).applyQuaternion(q);
        const wgt = _b.set(0, -c.m * G, 0);
        F.add(wgt); T.add(loc.cross(wgt));
      }
      const fwd = _a.set(1, 0, 0).applyQuaternion(q);
      T.addScaledVector(fwd, -this.cRoll * this.omega.dot(fwd));
      // the crew never lets her go over: past maxHeel they ease the sheet and throw their weight out
      if (env.maxHeel) {
        const sy = _d.set(0, 0, 1).applyQuaternion(q).y;
        const heel = Math.asin(Math.max(-1, Math.min(1, -sy)));
        const lim = env.maxHeel * Math.PI / 180, ex = Math.abs(heel) - lim;
        if (ex > 0) T.addScaledVector(fwd, -Math.sign(heel) * (60000 * ex + 1.5 * this.cRoll * Math.abs(this.omega.dot(fwd)) * (Math.sign(this.omega.dot(fwd)) === Math.sign(heel) ? 1 : 0)));
      }
      // vertical motion integrates; horizontal position and velocity come from the race
      this.vel.y += F.y * dt / m;
      this.pos.y += this.vel.y * dt;
      this.vel.x = fo.vx; this.vel.z = fo.vz;
      this.pos.x = fo.x; this.pos.z = fo.z;
      // pitch and roll integrate in body axes (yaw torque is ignored: the helmsman owns it)
      _R.makeRotationFromQuaternion(q); _Rt.copy(_R).transpose();
      const tb = _b.copy(T).applyMatrix4(_Rt);
      const wb = _c.copy(this.omega).applyMatrix4(_Rt);
      _Iw.set(I.x * wb.x, I.y * wb.y, I.z * wb.z);
      tb.sub(_d.copy(wb).cross(_Iw));
      wb.x += tb.x / I.x * dt; wb.z += tb.z / I.z * dt;
      this.omega.copy(wb.applyMatrix4(_R));
      this.omega.y = fo.yawRate || 0;
      const dq = _dq.set(this.omega.x * dt / 2, this.omega.y * dt / 2, this.omega.z * dt / 2, 0).multiply(q);
      q.x += dq.x; q.y += dq.y; q.z += dq.z; q.w += dq.w;
      q.normalize();
      // set the heading exactly, keeping the tilt
      const f2 = _a.set(1, 0, 0).applyQuaternion(q);
      const yawNow = Math.atan2(-f2.z, f2.x);
      _qy.setFromAxisAngle(_up, yawNow).invert().premultiply(_qy2.setFromAxisAngle(_up, fo.yaw));
      q.premultiply(_qy).normalize();
    }

    // heel (+ to starboard), pitch (+ bow up), in degrees; heave in metres
    attitude() {
      const s = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
      const f = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
      return { heel: Math.asin(Math.max(-1, Math.min(1, -s.y))) * 180 / Math.PI,
               pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) * 180 / Math.PI,
               heave: this.pos.y - this.com.y };
    }
  }

  root.PaaiSea = { makeWaves, waveAt, displace, setExtra, FloatingBoat, BASE };
})(typeof window !== 'undefined' ? window : globalThis);
