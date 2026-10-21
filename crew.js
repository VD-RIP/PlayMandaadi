/* Paaimaram crew: six people with roles, stations, routes, postures and their own balance.
 *
 * CrewMember  one body: motion-captured clips (idle, walk, run) for getting about, IK postures for
 *             work (hang out, haul, steer, hold the rope, hold the yard, sit, command), a balance
 *             spring driven by the boat's motion, and blending between them.
 * CrewDirector  the six roles: where each one should be and what he should be doing, from the
 *             boat's state (which side the wind is on, how hard it blows, the side change).
 *
 * Boat frame: x forward, y up, z starboard. Figure frame: +Z forward, +Y up, +X his left.
 */
(function (root) {
  const THREE = root.THREE;
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const UP = v3(0, 1, 0);
  const _a = v3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

  // ---------------------------------------------------------------- the boat, as the crew sees it
  const PLANK_X = 0.47, PLANK_TOP = 0.915, PLANK_END = 3.0;
  const MASTHEAD = v3(1.73, 7.15, 0), MAST = v3(1.08, 0, 0), MAST_FRONT_X = 1.0;
  const TAIL_FROM = v3(0.98, 0.62, 0);           // a block at the mast foot leads the halyard aft
  const SX = [0, 1, 2, 3, 4.5, 6, 7, 8, 9, 9.6], SY = [1.15, 0.98, 0.86, 0.80, 0.78, 0.80, 0.86, 0.98, 1.20, 1.45];
  const HX = [0, 0.5, 1, 2, 3.8, 5, 6, 7, 8, 8.8, 9.3, 9.6], HY = [0.55, 0.70, 0.80, 0.89, 0.95, 0.95, 0.92, 0.86, 0.72, 0.50, 0.25, 0.03];
  const table = (xs, ys) => x => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1])); return ys[ys.length - 1]; };
  const sheerD = table(SX, SY), halfD = table(HX, HY);
  const sheer = x => sheerD(x + 4.8), halfBeam = x => halfD(x + 4.8);
  // standing surfaces: the platform, the short bow and stern decks, and the plank across
  function deckY(x) {
    if (x > 3.56) return sheer(4.05) - 0.04;
    if (x < -4.06) return sheer(-4.38) - 0.04;
    return sheer(x) - 0.30;
  }
  function surfY(x, z, surf) {
    if (surf === 'plank') return PLANK_TOP;
    let y = deckY(x);
    if (Math.abs(x - PLANK_X) < 0.13 && Math.abs(z) < 0.9) y = Math.max(y, PLANK_TOP);   // stepping over the plank
    return y;
  }
  const deckHalf = x => Math.max(0.12, halfBeam(x) - 0.22);

  // ---------------------------------------------------------------- one crew member
  class CrewMember {
    constructor(id, scene, parent, clipsJSON, opts = {}) {
      this.id = id;
      this.mass = opts.mass || 65;
      this.root = new THREE.Group();
      this.root.add(scene);
      parent.add(this.root);
      this.parent = parent;
      scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      const B = this.b = {};
      scene.traverse(o => { if (o.isBone) B[o.name.replace(/^mixamorig:?/, '')] = o; });
      this.names = Object.keys(B);
      this.rest = {}; for (const n of this.names) this.rest[n] = B[n].quaternion.clone();
      this.hipsRest = B.Hips.position.clone();
      this.len = { thigh: B.LeftLeg.position.length(), shin: B.LeftFoot.position.length(),
                   upper: B.LeftForeArm.position.length(), fore: B.LeftHand.position.length() };
      this.fingers = [];
      for (const s of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3])
        if (B[s + 'Hand' + f + k]) this.fingers.push(B[s + 'Hand' + f + k]);
      this.mixer = new THREE.AnimationMixer(scene);
      this.act = {};
      this.clipHip0 = null;
      for (const cj of clipsJSON || []) {
        const clip = THREE.AnimationClip.parse(cj);
        const a = this.mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0);
        a.time = Math.random() * clip.duration;
        this.act[clip.name] = a;
        if (cj.hip0) this.clipHip0 = v3(...cj.hip0);
      }
      this.root.updateMatrixWorld(true);
      this.headRel = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(B.Head.getWorldQuaternion(new THREE.Quaternion()));

      this.pos = v3(); this.surf = 'deck'; this.path = []; this.speed = 0; this.dir = v3(1, 0, 0);
      this.facing = 0;
      this.upV = v3(0, 1, 0); this.upVel = v3();
      this.crouch = 0; this.crouchV = 0;
      this.runW = 0; this.walkW = 0; this.procW = 0;
      this.feet = { L: { p: v3(), from: v3(), to: v3(), t: 1, swing: false }, R: { p: v3(), from: v3(), to: v3(), t: 1, swing: false } };
      this.time = Math.random() * 10;
      this.com = v3();
      this.hands = { L: v3(), R: v3() };     // boat frame, where the hands are this frame
      this.holding = null;                    // 'hand-line' | 'halyard' | 'sheet' | 'tiller' | 'yard' | null
      this.goal = null;
      this.qA = {}; this.qB = {};
      for (const n of this.names) { this.qA[n] = new THREE.Quaternion(); this.qB[n] = new THREE.Quaternion(); }
    }

    // the boat is struck: she changes speed under him, he carries on as he was. dvx, dvz: the boat's sudden change
    // of velocity, boat frame, real m/s; sev: how hard (1 = enough to put a standing man down)
    jolt(dvx, dvz, sev) {
      const L = Math.hypot(dvx, dvz); if (L < 1e-4) return;
      const dir = { x: -dvx / L, z: -dvz / L };
      const pz = this.goal && this.goal.pose;
      const seated = !!(pz && pz.pelvis && this.procW > 0.5);
      const onPlank = this.surf === 'plank';
      let s = sev * (seated ? 0.42 : onPlank ? 0.75 : 1) * (0.8 + Math.random() * 0.45) * (this.speed > 0.6 ? 1.35 : 1);
      if (this.fall && !this.fall.down && this.fall.t < 0.8) s += this.fall.sev * 0.45;      // hit again while still staggering
      if (this.fall && this.fall.down) return;                                                  // already on the deck
      if (s < 0.3) return;
      const down = s > 1 && !onPlank && !seated;
      const T1 = 0.32, T2 = T1 + 0.9 + 0.5 * Math.min(1, s - 1), T3 = T2 + 1.35;
      this.fall = { t: -Math.random() * 0.05, sev: Math.min(s, 2), dir, down, T: down ? T3 : 0.75 + 0.35 * Math.min(1, s), T1, T2,
        x0: this.pos.x, z0: this.pos.z, slide: down ? 0.3 + 0.25 * Math.min(1, s - 1) : 0, fwd: Math.cos(this.facing) * dir.x + Math.sin(this.facing) * dir.z,
        side: (-Math.sin(this.facing) * dir.x + Math.cos(this.facing) * dir.z) >= 0 ? 1 : -1 };
      // the body is thrown: the lean spring kicks over, the knees give
      const kick = (down ? 2.4 + 2.6 * Math.min(s, 1.6) : 1.0 + 1.3 * Math.min(s, 1)) * (seated ? 0.35 : onPlank ? 0.6 : 1);
      this.upVel.x += dir.x * kick; this.upVel.z += dir.z * kick;
      this.crouchV += 1.1 + 1.7 * Math.min(s, 1.5);
      this.path = []; this.speed = 0;
    }
    // the posture while staggering, falling, down, and getting up again
    fallPose(dt) {
      const F = this.fall; F.t += dt;
      const t = Math.max(0, F.t), d = F.dir;
      const fx = Math.cos(this.facing), fz = Math.sin(this.facing), lx = fz, lz = -fx;    // left = UP x f
      const deckAt = (x, z) => surfY(x, z, this.surf);
      if (t >= F.T) { this.fall = null; if (this.goal) this.route(this.goal.at, this.goal.surf, this.goal.lane, this.goal.via); return null; }
      if (!F.down) {
        // a stagger: a catch step along the lurch, arms thrown out, back on balance
        const k = sstep(0, 0.12, t) * (1 - sstep(F.T * 0.55, F.T, t));
        const stepFoot = F.side > 0 ? 0 : 1, st = 0.3 * Math.min(1, F.sev) + 0.1;
        const base = this.pos;
        const ft = [0, 1].map(i => {
          const sg = i === 0 ? 1 : -1;
          const x = base.x + lx * sg * 0.18 + (i === stepFoot ? d.x * st * k : 0), z = base.z + lz * sg * 0.18 + (i === stepFoot ? d.z * st * k : 0);
          return v3(x, deckAt(x, z), z);
        });
        return { kind: 'brace', face: this.facing, feet: ft, crouch: 0.16 * k * (0.6 + F.sev), lean: -0.35 * F.fwd * k, dirB: d, k, grip: 'loose', elbowsOut: 0.9, look: null };
      }
      // down: slide with the lurch, then onto the deck
      const sl = F.slide * sstep(0, F.T1 + 0.15, t);
      let bx = F.x0 + d.x * sl, bz = F.z0 + d.z * sl;
      if (this.surf === 'deck') bz = clamp(bz, -deckHalf(bx) + 0.12, deckHalf(bx) - 0.12);
      this.pos.x = bx; this.pos.z = bz;
      const y0 = deckAt(bx, bz);
      const forward = F.fwd > 0.45;
      if (t < F.T2) {
        if (forward) {
          // pitched forward onto his hands and knees
          const pel = v3(bx, y0 + 0.5, bz);
          const kn = [1, -1].map(sg => v3(bx - fx * 0.38 + lx * sg * 0.13, y0, bz - fz * 0.38 + lz * sg * 0.13));
          const hands = [1, -1].map(sg => v3(bx + fx * 0.52 + lx * sg * 0.24, y0 + 0.03, bz + fz * 0.52 + lz * sg * 0.24));
          return { kind: 'onDeck', face: this.facing, pelvis: pel, feet: kn, bend: 1.5, lean: 0, handsAt: hands, kneesOut: 0.1, grip: 'loose', look: v3(bx + fx * 2, y0 + 0.4, bz + fz * 2) };
        }
        // thrown back (or sideways): sat down hard, legs out, hands behind to catch himself
        const pel = v3(bx, y0 + 0.13, bz);
        const feet = [1, -1].map(sg => v3(bx + fx * 0.55 + lx * sg * 0.17, y0, bz + fz * 0.55 + lz * sg * 0.17));
        const hands = [1, -1].map(sg => v3(bx - fx * 0.2 + lx * sg * 0.3, y0 + 0.03, bz - fz * 0.2 + lz * sg * 0.3));
        const shake = Math.sin(t * 2.3) * 0.05;
        return { kind: 'onDeck', face: this.facing, pelvis: pel, feet, bend: -0.1 + shake, lean: 0.3, handsAt: hands, kneesOut: 0.2, grip: 'loose', look: v3(bx + fx * 3 + d.x, y0 + 0.6, bz + fz * 3 + d.z) };
      }
      // getting up: knees under him, a hand on the deck, then up through a crouch
      const g = (t - F.T2) / (F.T - F.T2);
      if (g < 0.45) {
        const h = sstep(0, 0.45, g);
        const pel = v3(bx, y0 + lerp(forward ? 0.5 : 0.13, 0.42, h), bz);
        const feet = [1, -1].map(sg => v3(bx + fx * lerp(forward ? -0.38 : 0.55, 0.12, h) + lx * sg * 0.16, y0, bz + fz * lerp(forward ? -0.38 : 0.55, 0.12, h) + lz * sg * 0.16));
        const hands = [1, -1].map(sg => v3(bx + fx * 0.3 + lx * sg * 0.28, y0 + 0.03 + 0.25 * h * (sg > 0 ? 1 : 0), bz + fz * 0.3 + lz * sg * 0.28));
        return { kind: 'onDeck', face: this.facing, pelvis: pel, feet, bend: lerp(forward ? 1.5 : 0.3, 0.9, h), lean: 0, handsAt: hands, kneesOut: 0.18, grip: 'loose' };
      }
      const h = sstep(0.45, 1, g);
      return { kind: 'sit', face: this.facing, crouch: lerp(0.5, 0.02, h), bend: lerp(0.9, 0.05, h), stanceW: 0.17, grip: 'loose' };
    }

    place(p, surf) {
      this.pos.set(p.x, 0, p.z); this.surf = surf; this.path = [];
      this.pos.y = surfY(p.x, p.z, surf);
      for (const k of ['L', 'R']) this.feet[k].p.copy(this.pos);
    }

    // a route from here to a spot, along a lane (a fore-and-aft walkway at a set z), through any
    // via points the director gives, onto the plank only at the plank, and never through the mast
    route(to, surf, lane, via) {
      const pts = [];
      const laneAt = (x, z) => clamp(z, -deckHalf(x) + 0.05, deckHalf(x) - 0.05);
      const deckLeg = (fx, fz, tx, tz) => {
        if (via) for (const v of via) pts.push({ x: v.x, z: laneAt(v.x, v.z), surf: 'deck' });
        else if (lane !== undefined && Math.abs(tx - fx) > 0.6) {
          pts.push({ x: fx, z: laneAt(fx, lane), surf: 'deck' }, { x: tx, z: laneAt(tx, lane), surf: 'deck' });
        }
        pts.push({ x: tx, z: tz, surf: 'deck' });
      };
      const from = this.pos, fs = this.surf;
      if (fs === 'plank' && surf === 'plank') pts.push({ x: PLANK_X, z: to.z, surf: 'plank' });
      else if (fs === 'plank') {
        const zj = clamp(lane !== undefined ? lane : to.z, -0.45, 0.45);
        const d = to.x >= PLANK_X ? 0.3 : -0.3;
        pts.push({ x: PLANK_X, z: zj, surf: 'plank' }, { x: PLANK_X + d, z: zj, surf: 'deck' });
        deckLeg(PLANK_X + d, zj, to.x, to.z);
      } else if (surf === 'plank') {
        const zj = clamp(lane !== undefined ? lane : from.z, -0.45, 0.45);
        const d = from.x >= PLANK_X ? 0.3 : -0.3;
        deckLeg(from.x, from.z, PLANK_X + d, zj);
        pts.push({ x: PLANK_X, z: zj, surf: 'plank' }, { x: PLANK_X, z: to.z, surf: 'plank' });
      } else deckLeg(from.x, from.z, to.x, to.z);
      this.path = pts;
    }

    // goal: { at: {x,z}, surf, pose: { kind, ...params } }
    setGoal(g) {
      const same = this.goal && Math.abs(this.goal.at.x - g.at.x) < 0.03 && Math.abs(this.goal.at.z - g.at.z) < 0.03 && this.goal.surf === g.surf;
      this.goal = g;
      if (!same) this.route(g.at, g.surf, g.lane, g.via);
    }

    move(ctx, others) {
      const dt = Math.min(ctx.dt, 1 / 30);
      const g = this.goal;
      if (this.fall) { this.speed = 0; this.pos.y = surfY(this.pos.x, this.pos.z, this.surf); return; }

      // ---------- moving along the route
      let target = this.path[0];
      let moving = false;
      if (target) {
        const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        let remain = dist; let prev = target;
        for (let i = 1; i < this.path.length; i++) { remain += Math.hypot(this.path[i].x - prev.x, this.path[i].z - prev.z); prev = this.path[i]; }
        let vmax = remain > 1.4 ? 3.0 : 1.3;
        if (this.surf === 'plank' || (this.path[this.path.length - 1] || {}).surf === 'plank') vmax = remain > 1.0 ? 3.9 : vmax;   // a sprint out along the plank
        vmax = Math.min(vmax, Math.sqrt(2 * 8 * remain) + 0.25);
        this.nearGoal = remain;
        // keep clear of the others
        if (dist > 1e-4) this.dir.set(dx / dist, 0, dz / dist);
        const gap = this.blockedT > 1.5 ? 0.36 : 0.5;
        for (const o of others) {
          if (o === this) continue;
          const ob = o.bodyXZ(); const ox = ob.x - this.pos.x, oz = ob.z - this.pos.z, od = Math.hypot(ox, oz);
          if (od < 0.7 && (ox * this.dir.x + oz * this.dir.z) > od * 0.5 && (o.surf === this.surf || od < 0.45)) {
            vmax = Math.min(vmax, Math.max(0, (od - gap) * 3));
          }
        }
        this.blockedT = vmax < 0.05 ? (this.blockedT || 0) + dt : 0;
        this.speed += clamp(vmax - this.speed, -9 * dt, 6 * dt);
        const step = Math.min(dist, this.speed * dt);
        if (dist > 1e-4) { this.pos.x += dx / dist * step; this.pos.z += dz / dist * step; }
        if (dist - step < 0.03) { this.surf = target.surf; this.path.shift(); }
        moving = true;
        if (this.path.length === 0 && g && Math.hypot(g.at.x - this.pos.x, g.at.z - this.pos.z) < 0.04) this.speed = 0;
      } else {
        this.speed = Math.max(0, this.speed - 9 * dt);
      }
      this.pos.y = surfY(this.pos.x, this.pos.z, this.surf);
    }

    // where his body is, for keeping clear of the others (a seated man is where he sits)
    bodyXZ() {
      const p = this.goal && this.goal.pose && this.goal.pose.pelvis && this.procW > 0.5 ? this.goal.pose.pelvis : this.pos;
      return { x: p.x, z: p.z };
    }
    settled() { return !this.path.length && this.speed < 0.1; }

    update(ctx) {
      const dt = Math.min(ctx.dt, 1 / 30);
      this.time += dt;
      const B = this.b;
      const g = this.goal;
      const sp = this.speed;
      const arrived = !this.path.length && sp < 0.15;
      let pose = g && g.pose ? g.pose : { kind: 'stand' };
      let procPose = arrived && pose.kind !== 'stand';
      if (this.fall) { const fp = this.fallPose(dt); if (fp) { pose = fp; procPose = true; } }
      this.runW += (sstep(1.2, 2.2, sp) - this.runW) * Math.min(1, dt * 8);
      this.walkW += ((sp > 0.2 ? 1 - sstep(1.2, 2.2, sp) : 0) - this.walkW) * Math.min(1, dt * 8);
      this.procW += ((procPose ? 1 : 0) - this.procW) * Math.min(1, dt * (this.fall ? 9 : pose.kind === 'hang' || pose.quick ? 11 : 5));

      // ---------- facing
      let wantF = this.facing;
      let turnRate = 5;
      if (sp > 0.25 && !(this.path.length <= 1 && this.nearGoal < 0.5 && (pose.kind === 'hang' || pose.quick))) wantF = Math.atan2(this.dir.z, this.dir.x);
      else if (pose.face !== undefined) { wantF = pose.face; if (pose.kind === 'hang' || pose.quick) turnRate = 13; }
      const df = Math.atan2(Math.sin(wantF - this.facing), Math.cos(wantF - this.facing));
      this.facing += clamp(df, -dt * turnRate, dt * turnRate);
      const f = v3(Math.cos(this.facing), 0, Math.sin(this.facing));
      const left = v3().crossVectors(UP, f);

      // ---------- feet for postures (clips place their own while moving)
      const base = this.pos.clone();
      const stance = this.footholds(pose, base, f, left);
      for (const k of ['L', 'R']) {
        const ft = this.feet[k];
        if (this.runW + this.walkW > 0.5) { ft.swing = false; continue; }
        const home = stance[k];
        if (ft.swing) {
          ft.t = Math.min(1, ft.t + dt / (this.fall ? 0.13 : 0.24));
          const e = ft.t * ft.t * (3 - 2 * ft.t);
          ft.p.lerpVectors(ft.from, ft.to, e);
          ft.p.y = lerp(ft.from.y, ft.to.y, e) + Math.sin(Math.PI * ft.t) * 0.08;
          if (ft.t >= 1) ft.swing = false;
        } else {
          const other = this.feet[k === 'L' ? 'R' : 'L'];
          if ((!other.swing || this.fall) && home.distanceTo(ft.p) > 0.05) { ft.swing = true; ft.t = 0; ft.from.copy(ft.p); ft.to.copy(home); }
        }
      }

      // ---------- balance: lean toward the apparent up, through a spring
      const gv = ctx.gApp || v3(0, -9.81, 0);
      const gN = gv.length() || 9.81;
      const want = v3().copy(UP).lerp(v3().copy(gv).multiplyScalar(-1 / gN), 0.85).normalize();
      const lean = lerp((pose.lean || 0) * this.procW, -0.18, this.runW) + lerp(0, -0.06, this.walkW);
      want.addScaledVector(f, -Math.tan(lean)).normalize();
      if (pose.tiltIn) want.addScaledVector(left, pose.tiltIn).normalize();
      this.upVel.addScaledVector(v3().subVectors(want, this.upV), 38 * dt).multiplyScalar(1 - Math.min(1, 7.5 * dt));
      this.upV.addScaledVector(this.upVel, dt).normalize();
      const U = this.upV;
      const crouchWant = lerp((pose.crouch || 0) * this.procW, 0.075, this.runW) + clamp((gN / 9.81 - 1) * 0.08, -0.03, 0.06);
      this.crouchV += ((crouchWant - this.crouch) * 60 - this.crouchV * 11) * dt;
      this.crouch += this.crouchV * dt;

      const zAx = v3().copy(f).addScaledVector(U, -f.dot(U)).normalize();
      const xAx = v3().crossVectors(U, zAx);
      _m.makeBasis(xAx, U, zAx);
      this.root.quaternion.setFromRotationMatrix(_m);
      const feetMid = v3().addVectors(this.feet.L.p, this.feet.R.p).multiplyScalar(0.5);
      const anchor = v3().lerpVectors(base, feetMid, this.procW);
      this.root.position.copy(anchor);
      this.root.updateMatrixWorld(true);
      const leftW = this.wDir(xAx, v3()), fwdW = this.wDir(zAx, v3()), upBoatW = this.wDir(UP, v3());

      // ---------- A: clip pose (idle, walk, run), hips dropped while running, feet kept on the clip's footfalls
      this.resetPose();
      const { run, walk, idle } = this.act;
      if (run) { run.setEffectiveWeight(this.runW); run.setEffectiveTimeScale(0.8 + 0.5 * clamp(sp / 3, 0, 1)); }
      if (walk) { walk.setEffectiveWeight(this.walkW); walk.setEffectiveTimeScale(0.8 + 0.6 * clamp(sp / 1.3, 0, 1)); }
      if (idle) idle.setEffectiveWeight(Math.max(0, 1 - this.runW - this.walkW));
      this.mixer.update(dt);
      if (this.clipHip0) B.Hips.position.sub(this.clipHip0).add(this.hipsRest);
      this.root.updateMatrixWorld(true);
      const ank = {}, toe = {};
      for (const k of ['Left', 'Right']) { ank[k] = B[k + 'Foot'].getWorldPosition(v3()); toe[k] = B[k + 'ToeBase'].getWorldPosition(v3()); }
      const drop = this.hipsRest.y * this.crouch;
      this.root.position.copy(anchor).addScaledVector(U, -drop);
      this.root.updateMatrixWorld(true);
      if (this.runW > 0.01) { this.turnWorld(B.Spine, leftW, 0.14 * this.runW); this.turnWorld(B.Spine1, leftW, 0.12 * this.runW); }
      for (const k of ['Left', 'Right']) {
        const hip = B[k + 'UpLeg'].getWorldPosition(v3());
        this.twoBone(B[k + 'UpLeg'], B[k + 'Leg'], ank[k], v3().copy(hip).addScaledVector(fwdW, 0.8), this.len.thigh, this.len.shin);
        this.aim(B[k + 'Foot'], B[k + 'ToeBase'].position, toe[k]);
      }
      if (this.runW + this.walkW > 0.5) for (const [k, s] of [['L', 'Left'], ['R', 'Right']]) {
        const p = this.parent.worldToLocal(ank[s].clone()); p.y = surfY(p.x, p.z, this.surf); this.feet[k].p.copy(p);
      }
      for (const n of this.names) this.qA[n].copy(B[n].quaternion);
      const hipsA = B.Hips.position.clone();

      // ---------- B: work posture by IK
      this.holding = null;
      if (this.procW > 0.01) {
        this.resetPose();
        this.root.position.copy(anchor);
        if (pose.pelvis) {
          // sitting: the pelvis goes where the posture puts it
          this.root.position.copy(pose.pelvis).sub(_a.copy(this.hipsRest).applyQuaternion(this.root.quaternion));
        } else this.root.position.addScaledVector(U, -this.hipsRest.y * this.crouch);
        this.root.updateMatrixWorld(true);
        const bend = pose.bend || 0;
        this.turnWorld(B.Spine, leftW, bend * 0.4);
        this.turnWorld(B.Spine1, leftW, bend * 0.3);
        this.turnWorld(B.Spine2, leftW, bend * 0.3);
        if (pose.twist) { this.turnWorld(B.Spine1, upBoatW, pose.twist * 0.5); this.turnWorld(B.Spine2, upBoatW, pose.twist * 0.5); }
        for (const [k, s] of [['L', 'Left'], ['R', 'Right']]) {
          const sgn = k === 'L' ? 1 : -1;
          const fp = this.feet[k].p;
          const ankle = this.w(_a.copy(fp).addScaledVector(UP, 0.075), v3());
          const hip = B[s + 'UpLeg'].getWorldPosition(v3());
          const kneeOut = pose.kneesOut || 0.12;
          this.twoBone(B[s + 'UpLeg'], B[s + 'Leg'], ankle, v3().copy(hip).addScaledVector(fwdW, 0.8).addScaledVector(leftW, sgn * kneeOut).addScaledVector(upBoatW, pose.pelvis ? 0.4 : 0), this.len.thigh, this.len.shin);
          const toeDir = v3().copy(fwdW).addScaledVector(leftW, sgn * 0.18).addScaledVector(upBoatW, -fwdW.dot(upBoatW)).normalize();
          this.aim(B[s + 'Foot'], B[s + 'ToeBase'].position, v3().copy(ankle).addScaledVector(toeDir, 0.14).addScaledVector(upBoatW, -0.065));
        }
        const hands = this.handTargets(pose, ctx, U, fwdW, leftW, upBoatW);
        for (const [k, s] of [['L', 'Left'], ['R', 'Right']]) {
          const sgn = k === 'L' ? 1 : -1;
          const ht = hands[k];
          const sh = B[s + 'Arm'].getWorldPosition(v3());
          const tgt = v3().copy(ht).addScaledVector(v3().subVectors(sh, ht).normalize(), 0.07);
          const pole = v3().copy(sh).addScaledVector(upBoatW, -0.6).addScaledVector(fwdW, pose.elbowsBack ? -0.6 : -0.3).addScaledVector(leftW, sgn * (pose.elbowsOut || 0.45));
          this.twoBone(B[s + 'Arm'], B[s + 'ForeArm'], tgt, pole, this.len.upper, this.len.fore);
          this.aim(B[s + 'Hand'], B[s + 'HandMiddle1'].position, ht);
          this.hands[k].copy(this.parent.worldToLocal(ht.clone()));
        }
        this.holding = pose.holds || null;
        for (const n of this.names) this.qB[n].copy(B[n].quaternion);
      }

      // ---------- blend
      const k = this.procW;
      for (const n of this.names) B[n].quaternion.copy(this.qA[n]).slerp(this.qB[n], k);
      B.Hips.position.copy(hipsA).lerp(this.hipsRest, k);
      if (k > 0.01 && pose.grip !== false) {
        for (const fb of this.fingers) fb.quaternion.multiply(_q.setFromAxisAngle(_a.set(1, 0, 0), 1.1 * k * (pose.grip === 'loose' ? 0.45 : 1)));
      }
      if (pose.pelvis && k > 0.01) {
        const sitPos = v3().copy(pose.pelvis).sub(_a.copy(this.hipsRest).applyQuaternion(this.root.quaternion));
        this.root.position.lerp(sitPos, k);
      } else if (k > 0.01) {
        this.root.position.lerp(v3().copy(anchor).addScaledVector(U, -this.hipsRest.y * this.crouch), k);
      }
      this.root.updateMatrixWorld(true);

      // ---------- head: level with the horizon, on the work or ahead
      const head = B.Head;
      const headW = head.getWorldPosition(v3());
      const look = v3();
      if (sp > 0.25) look.copy(fwdW).addScaledVector(upBoatW, -0.25);
      else if (pose.look) look.copy(this.w(pose.look, v3())).sub(headW);
      else look.copy(fwdW);
      const upW = this.wDir(U, v3()).lerp(v3(0, 1, 0), 0.7).normalize();
      const zH = look.addScaledVector(upW, -look.dot(upW)).normalize();
      _m.makeBasis(v3().crossVectors(upW, zH), upW, zH);
      _q.setFromRotationMatrix(_m).multiply(this.headRel);
      const cur = head.getWorldQuaternion(new THREE.Quaternion()).slerp(_q, 0.75);
      head.quaternion.copy(head.parent.getWorldQuaternion(_q2).invert().multiply(cur));
      this.root.updateMatrixWorld(true);
      this.com.copy(this.parent.worldToLocal(B.Spine.getWorldPosition(v3())));
      if (k < 0.5) { this.hands.L.copy(this.parent.worldToLocal(B.LeftHand.getWorldPosition(v3()))); this.hands.R.copy(this.parent.worldToLocal(B.RightHand.getWorldPosition(v3()))); }
    }

    footholds(pose, base, f, left) {
      const out = {};
      if (pose.feet) { out.L = pose.feet[0]; out.R = pose.feet[1]; return out; }
      const along = this.surf === 'plank' && Math.abs(f.z) > 0.7;
      const w = pose.stanceW || (along ? 0.1 : 0.15);
      for (const [k, s] of [['L', 1], ['R', -1]]) {
        const p = v3().copy(base).addScaledVector(left, s * w);
        if (pose.stagger) p.addScaledVector(f, s * pose.stagger);
        if (this.surf === 'plank') p.x = clamp(p.x, PLANK_X - 0.12, PLANK_X + 0.12);
        p.y = surfY(p.x, p.z, this.surf);
        out[k] = p;
      }
      return out;
    }

    handTargets(pose, ctx, U, fwdW, leftW, upW) {
      const B = this.b, out = {};
      const chest = B.Spine2.getWorldPosition(v3());
      const hip = B.Hips.getWorldPosition(v3());
      const relaxed = s => B[(s === 'L' ? 'Left' : 'Right') + 'Arm'].getWorldPosition(v3()).addScaledVector(upW, -0.52).addScaledVector(leftW, (s === 'L' ? 1 : -1) * 0.1).addScaledVector(fwdW, 0.06);
      const onHip = s => v3().copy(hip).addScaledVector(leftW, (s === 'L' ? 1 : -1) * 0.2).addScaledVector(upW, 0.08).addScaledVector(fwdW, -0.02);
      const onKnee = s => v3().copy(hip).addScaledVector(fwdW, 0.42).addScaledVector(leftW, (s === 'L' ? 1 : -1) * 0.16).addScaledVector(upW, 0.18);
      switch (pose.kind) {
        case 'hang': {
          const gripB = this.parent.worldToLocal(v3().copy(chest).addScaledVector(fwdW, 0.42).addScaledVector(this.wDir(U, v3()), 0.12));
          const rd = v3().subVectors(MASTHEAD, gripB).normalize();
          out.L = this.w(_a.copy(gripB).addScaledVector(rd, 0.14), v3());
          out.R = this.w(_a.copy(gripB).addScaledVector(rd, -0.02), v3());
          break;
        }
        case 'haul': {
          for (const s of ['L', 'R']) {
            const ph = ((pose.cyc !== undefined ? pose.cyc : this.time * 0.86) + (s === 'L' ? 0 : 0.5) + (pose.phase || 0)) % 1;
            const y = ph < 0.6 ? lerp(2.2, 1.35, ph / 0.6) : lerp(1.35, 2.2, (ph - 0.6) / 0.4);
            const away = ph < 0.6 ? 0 : Math.sin(Math.PI * (ph - 0.6) / 0.4) * 0.12;
            out[s] = this.w(_a.set(MAST_FRONT_X - 0.04 - away, y + (pose.hy || 0), this.pos.z * 0.35 + (s === 'L' ? -1 : 1) * 0.03), v3());
          }
          break;
        }
        case 'tail': {
          // tailing the rope led aft from the mast foot: hand over hand toward the belly
          const tp = this.w(pose.from, v3());
          const dir = v3().subVectors(tp, chest).normalize();
          const base = v3().copy(chest).addScaledVector(upW, -0.12);
          for (const s of ['L', 'R']) {
            const ph = ((pose.cyc !== undefined ? pose.cyc + 0.15 : this.time * 0.9) + (s === 'L' ? 0 : 0.5)) % 1;
            const reach = ph < 0.6 ? lerp(0.58, 0.18, ph / 0.6) : lerp(0.18, 0.58, (ph - 0.6) / 0.4);
            const lift = ph < 0.6 ? 0 : Math.sin(Math.PI * (ph - 0.6) / 0.4) * 0.08;
            out[s] = v3().copy(base).addScaledVector(dir, reach).addScaledVector(upW, lift).addScaledVector(leftW, (s === 'L' ? 1 : -1) * 0.04);
          }
          break;
        }
        case 'tiller': {
          out[pose.tillerHand] = this.w(ctx.tillerEnd, v3());
          const o = pose.tillerHand === 'L' ? 'R' : 'L';
          out[o] = onKnee(o);
          break;
        }
        case 'sheet': {
          const c = v3().copy(chest).addScaledVector(fwdW, 0.38).addScaledVector(upW, -0.12);
          out.L = v3().copy(c).addScaledVector(leftW, 0.08); out.R = v3().copy(c).addScaledVector(leftW, -0.08).addScaledVector(fwdW, -0.12);
          break;
        }
        case 'yard': {
          const yf = this.w(ctx.yardFoot, v3());
          out.L = v3().copy(yf).addScaledVector(leftW, 0.07); out.R = v3().copy(yf).addScaledVector(leftW, -0.07).addScaledVector(upW, 0.12);
          break;
        }
        case 'command': {
          out.L = onHip('L');
          out.R = pose.point ? v3().copy(B.RightArm.getWorldPosition(v3())).addScaledVector(v3().subVectors(this.w(pose.point, v3()), chest).normalize(), 0.62) : onHip('R');
          break;
        }
        case 'sit':
          out.L = onKnee('L'); out.R = onKnee('R'); break;
        case 'brace': {        // arms thrown out for balance, toward the way he is being thrown
          const dW = this.wDir(v3(pose.dirB.x, 0, pose.dirB.z), v3());
          for (const s of ['L', 'R']) {
            const sh = B[(s === 'L' ? 'Left' : 'Right') + 'Arm'].getWorldPosition(v3());
            out[s] = sh.addScaledVector(leftW, (s === 'L' ? 1 : -1) * 0.5 * pose.k + (s === 'L' ? 0.1 : -0.1) * (1 - pose.k)).addScaledVector(upW, lerp(-0.5, 0.02, pose.k)).addScaledVector(dW, 0.28 * pose.k).addScaledVector(fwdW, 0.1);
          }
          break;
        }
        case 'guy': {
          const c = v3().copy(chest).addScaledVector(fwdW, 0.3).addScaledVector(upW, -0.02);
          out.R = v3().copy(c).addScaledVector(upW, 0.07).addScaledVector(fwdW, 0.06).addScaledVector(leftW, -0.02);
          out.L = v3().copy(c).addScaledVector(upW, -0.06).addScaledVector(leftW, 0.02);
          break;
        }
        case 'onDeck':
          out.L = this.w(pose.handsAt[0], v3()); out.R = this.w(pose.handsAt[1], v3()); break;
        case 'squat': {
          const knee = s => v3().copy(hip).addScaledVector(fwdW, 0.4).addScaledVector(leftW, (s === 'L' ? 1 : -1) * 0.2).addScaledVector(upW, 0.2);
          out.L = knee('L').addScaledVector(fwdW, 0.12).addScaledVector(upW, -0.1).addScaledVector(leftW, -0.08);
          out.R = knee('R').addScaledVector(fwdW, 0.12).addScaledVector(upW, -0.1).addScaledVector(leftW, 0.08);
          break;
        }
        default:
          out.L = relaxed('L'); out.R = relaxed('R');
      }
      return out;
    }

    resetPose() { for (const n of this.names) this.b[n].quaternion.copy(this.rest[n]); this.b.Hips.position.copy(this.hipsRest); }
    w(p, out) { return out.copy(p).applyMatrix4(this.parent.matrixWorld); }
    wDir(d, out) { return out.copy(d).transformDirection(this.parent.matrixWorld); }
    turnWorld(bone, axisW, ang) {
      if (!ang) return;
      const wq = bone.getWorldQuaternion(new THREE.Quaternion());
      _q.setFromAxisAngle(axisW, ang).multiply(wq);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(_q2).invert().multiply(_q));
      bone.updateMatrixWorld(true);
    }
    aim(bone, tipLocal, targetW) {
      bone.updateMatrixWorld(true);
      const o = bone.getWorldPosition(v3());
      const cur = v3().copy(tipLocal).applyMatrix4(bone.matrixWorld).sub(o).normalize();
      const want = v3().copy(targetW).sub(o).normalize();
      _q.setFromUnitVectors(cur, want).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(_q2).invert().multiply(_q));
      bone.updateMatrixWorld(true);
    }
    twoBone(upper, lower, targetW, poleW, l1, l2) {
      const A = upper.getWorldPosition(v3());
      const toT = v3().subVectors(targetW, A);
      const d = clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
      const dir = toT.normalize();
      const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
      const pp = v3().subVectors(poleW, A); pp.addScaledVector(dir, -pp.dot(dir));
      if (pp.lengthSq() < 1e-8) pp.set(0, 1, 0).addScaledVector(dir, -dir.y);
      pp.normalize();
      const mid = v3().copy(A).addScaledVector(dir, l1 * ca).addScaledVector(pp, l1 * Math.sqrt(1 - ca * ca));
      this.aim(upper, lower.position, mid);
      this.aim(lower, this.childPos(lower), v3().copy(A).addScaledVector(dir, d));
    }
    childPos(bone) { for (const c of bone.children) if (c.isBone) return c.position; return v3(0, 0.15, 0); }
  }
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

  // ---------------------------------------------------------------- the six roles
  const ROLES = ['mandaadi', 'helmsman', 'sheet', 'mast', 'bow', 'balancer'];
  const MASS = { mandaadi: 74, helmsman: 64, sheet: 58, mast: 78, bow: 63, balancer: 62 };

  class CrewDirector {
    constructor(members) {
      this.m = {}; for (const c of members) this.m[c.id] = c;
      this.list = members;
      this.t = 0; this.pointT = 0; this.lastPhase = 0; this.sincePhase = 0;
      this.plankCrowd = 0;
    }
    // st: { dt, side (wind from port = +1), phase 0..3, prog [p1,p2,p3], s0, s1, need (0..1 how hard to hang out), yardFoot, tillerEnd, clew, quarter, gApp(fn) }
    update(st) {
      const dt = st.dt; this.t += dt;
      if (st.phase !== this.lastPhase) { this.lastPhase = st.phase; this.sincePhase = 0; } else this.sincePhase += dt;
      const side = st.side, w = -side, l = side;            // windward and leeward z signs
      const M = this.m;
      const head = (x, z) => Math.atan2(z, x);
      const deck = (x, z) => ({ x, z: clamp(z, -deckHalf(x), deckHalf(x)) });
      const set = (id, at, surf, pose) => M[id] && M[id].setGoal({ at, surf, pose });
      const hangAt = z => ({ kind: 'hang', face: z < 0 ? Math.PI / 2 : -Math.PI / 2, lean: clamp(0.12 + 0.5 * st.need, 0.08, 0.62), bend: 0.16 + 0.25 * st.need, crouch: 0.07, look: v3(9, 1.6, 2.5 * side), holds: 'hand-line' });
      const haulAt = (ph, hy) => ({ kind: 'haul', face: 0, lean: 0.12, bend: 0.3, crouch: 0.1, phase: ph, hy, look: v3(MAST_FRONT_X, 2.6, 0), elbowsOut: 0.3, holds: 'halyard', stanceW: 0.15, cyc: st.cyc });
      const need = st.need;
      const ph = st.phase;
      const s0 = st.s0 || side, s1 = st.s1 || -side;
      const w0 = -s0, l0 = s0;                       // windward / leeward before the change
      const sq = (x, z, face, look) => ({ kind: 'squat', face, pelvis: v3(x - 0.1 * Math.cos(face), deckY(x) + 0.33, z - 0.1 * Math.sin(face)),
        feet: [v3(x + 0.06 * Math.cos(face) - 0.15 * Math.sin(face), deckY(x), z + 0.06 * Math.sin(face) + 0.15 * Math.cos(face)),
               v3(x + 0.06 * Math.cos(face) + 0.15 * Math.sin(face), deckY(x), z + 0.06 * Math.sin(face) - 0.15 * Math.cos(face))],
        bend: 0.5, kneesOut: 0.32, look: look || v3(x + 6, 1.2, z), grip: 'loose' });
      // feet: [left, right]. Facing angle a: his left is (sin a, 0, -cos a)
      const fixFeet = pz => pz;
      const bal = M.balancer, mst = M.mast;
      const out = (c, z) => !c || (c.surf === 'plank' && Math.abs(c.pos.z - z) < 0.2 && c.settled());
      const balOut = out(bal, w * PLANK_END);
      const mastOut = out(mst, w * 2.3);
      const changing = ph === 1 || ph === 2 || ph === 3;
      // decisions to go out on the plank or come in are held for a while, so nobody runs back and forth
      const hold = (key, want) => {
        const tk = key + 'T';
        if (this[key] === undefined || st.snap) { this[key] = want; this[tk] = this.t; return; }
        if (want !== this[key] && this.t - this[tk] > 9) { this[key] = want; this[tk] = this.t; }
      };
      if (st.hike === true || st.hike === false) { this.mastWants = st.hike; this.mandWants = st.hike; this.mastWantsT = this.mandWantsT = this.t; }
      else {
        hold('mastWants', need > 0.62 ? true : need < 0.4 ? false : !!this.mastWants);
        hold('mandWants', need > 0.9 ? true : need < 0.72 ? false : !!this.mandWants);
      }

      // --- mast hand: squats forward of the mast; hauls the yard from the deck behind the mast; out on the plank in a breeze
      const mside = Math.sign(mst && mst.pos.z || l0);
      if (ph === 1 || ph === 2 || ph === 4) mst && mst.setGoal({ at: deck(1.0, mside * 0.34), surf: 'deck', pose: Object.assign(haulAt(0.0, 0.05), { face: Math.atan2(-mside * 0.35, 1) }) });
      else if (this.mastWants && !st.noPlank && balOut && ph === 0) set('mast', { x: PLANK_X, z: w * 2.3 }, 'plank', hangAt(w * 2.3));
      else mst && mst.setGoal({ at: deck(1.55, mside * 0.36), surf: 'deck', pose: sq(1.55, mside * 0.36, 0, v3(12, 1.4, 0)) });

      // --- balancer: windward plank end; hauls from the plank beside the mast; runs out to the new end
      if (ph === 4) set('balancer', deck(0.62, -mside * 0.32), 'deck', Object.assign(haulAt(0.04, 0.0), { face: Math.atan2(mside * 0.3, 1) }));
      else if (ph === 1 || ph === 2) set('balancer', { x: PLANK_X, z: w0 * 0.8 }, 'plank', haulAt(0.66, 0.0));
      else if (st.noPlank) set('balancer', deck(-0.7, w * 0.45), 'deck', sq(-0.7, w * 0.45, 0));
      else set('balancer', { x: PLANK_X, z: w * PLANK_END }, 'plank', hangAt(w * PLANK_END));

      // --- mandaadi: commands from aft; comes forward on the windward walkway to haul; points the balancer out;
      //     goes out on the plank himself in a blow, inboard of the mast hand
      const mand = M.mandaadi;
      if (ph === 1 || ph === 2 || ph === 4) M.mandaadi && M.mandaadi.setGoal({ at: deck(-0.08, w0 * 0.28), surf: 'deck', lane: w0 * 0.3, pose: { kind: 'tail', face: Math.atan2(-w0 * 0.28, 1.1), from: TAIL_FROM, lean: 0.22, bend: 0.25, crouch: 0.12, stanceW: 0.17, stagger: 0.14, holds: 'tail', look: v3(1.0, 3.0, 0), cyc: st.cyc } });
      else if (ph === 3) M.mandaadi && M.mandaadi.setGoal({ at: deck(-0.08, w0 * 0.28), surf: 'deck', lane: w0 * 0.3,
        pose: { kind: 'command', face: Math.atan2(-w0 * 1.0, 0.3), point: v3(PLANK_X, 1.5, -w0 * 3.2), look: v3(PLANK_X, 1.3, -w0 * 3), stanceW: 0.2, lean: -0.05 } });
      else if (this.mandWants && !st.noPlank && mastOut) set('mandaadi', { x: PLANK_X, z: w * 1.7 }, 'plank', hangAt(w * 1.7));
      else {
        const pointing = (this.t % 9) < 2.2;
        // coming back aft: down the side he came up, then across behind the plank
        const lane = undefined;
        mand && mand.setGoal({ at: deck(-2.75, w * 0.15), surf: 'deck', lane,
          pose: { kind: 'command', face: Math.atan2(w * 0.18, 1), stanceW: 0.22, lean: -0.06,
                  point: pointing ? v3(14, 3.5, w * 9) : null, look: pointing ? v3(14, 3.5, w * 9) : v3(2.5, 4.5, -w * 1.0) } });
      }

      // --- sheet hand: crouched at the leeward quarter with the sheet; in step 3 he crosses right aft
      //     (behind the helmsman) to the new leeward quarter
      const shp = M.sheet;
      const sheetPose = z => ({ kind: 'sheet', face: Math.atan2(-Math.sign(z) * 0.35, 1), crouch: 0.32, bend: 0.3, holds: 'sheet', look: st.clew, kneesOut: 0.22 });
      if (ph === 1 || ph === 2) set('sheet', deck(-3.98, l0 * 0.36), 'deck', sheetPose(l0));
      else {
        const zt = l * 0.36;
        shp && shp.setGoal({ at: deck(-3.98, zt), surf: 'deck', via: [{ x: -4.02, z: -zt }, { x: -4.02, z: zt }], pose: sheetPose(l) });
      }

      // --- helmsman: windward gunwale aft, hand on the tiller; moves across only once the sheet hand is clear
      {
        // he stays put through steps 1-2; in step 3 he waits for the sheet hand to cross aft of him first
        const hw = ph === 1 || ph === 2 ? w0 : w;
        const x = -3.62, zg = hw * (halfBeam(x) - 0.12);
        const pel = v3(x, sheer(x) + 0.06, zg);
        const feet = [v3(x + 0.3, deckY(x + 0.3), hw * 0.42), v3(x + 0.12, deckY(x + 0.12), hw * 0.28)];
        if (hw > 0) feet.reverse();
        M.helmsman && M.helmsman.setGoal({ at: deck(x + 0.3, hw * 0.4), surf: 'deck', via: [{ x: -3.3, z: hw * 0.4 }],
          pose: { kind: 'tiller', face: Math.atan2(-hw * 0.3, 1), pelvis: pel, feet, bend: 0.15, tillerHand: hw < 0 ? 'R' : 'L', look: v3(8, 1.6, 0), kneesOut: 0.2, holds: 'tiller' } });
      }

      // --- bow hand: squats forward beside the bowsprit, to leeward; takes the yard's foot back to the mast and forward again
      if (ph === 4) {
        const bz = -(Math.sign(st.yardFoot.z) || 1) * 0.22;
        set('bow', deck(3.75, bz), 'deck', { kind: 'guy', face: Math.PI + 0.12 * Math.sign(bz), lean: 0.26, bend: 0.12, crouch: 0.16, stanceW: 0.2, stagger: 0.2, holds: 'guy', look: v3(1.4, 3.6, 0), quick: true, elbowsOut: 0.25 });
      } else if (ph === 1 || ph === 2 || (ph === 3 && st.prog[2] < 0.75)) {
        const yf = st.yardFoot;
        const bx = yf.x + 0.42 <= 4.0 ? clamp(yf.x + 0.42, 1.95, 4.0) : clamp(yf.x - 0.55, 1.95, 4.0);
        set('bow', deck(bx, 0.0), 'deck', { kind: 'yard', face: Math.atan2(yf.z, yf.x - bx), quick: true, crouch: yf.y < 1.2 ? 0.25 : 0.05, bend: yf.y < 1.2 ? 0.45 : 0.1, look: yf, holds: 'yard', stanceW: 0.16, stagger: 0.12 });
      } else set('bow', deck(3.05, l * 0.36), 'deck', sq(3.05, l * 0.36, 0, v3(14, 0.8, 0)));

      // ---- move, keep bodies apart, then animate
      const others = this.list;
      for (const c of others) c.move({ dt }, others);
      for (let it = 0; it < 2; it++) for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
        const a = others[i], b = others[j];
        const pa = a.bodyXZ(), pb = b.bodyXZ();
        let dx = pb.x - pa.x, dz = pb.z - pa.z; const d = Math.hypot(dx, dz);
        const minD = 0.44;
        if (d >= minD || d < 1e-5) continue;
        dx /= d; dz /= d;
        const fa = a.settled() && a.procW > 0.5 && a.goal && a.goal.pose && a.goal.pose.pelvis;    // seated men do not get shoved
        const fb = b.settled() && b.procW > 0.5 && b.goal && b.goal.pose && b.goal.pose.pelvis;
        const ka = fa ? 0 : fb ? 1 : 0.5, kb = fb ? 0 : fa ? 1 : 0.5;
        const push = minD - d;
        const shove = (c, k, sx, sz) => {
          if (!k) return;
          if (c.surf === 'plank') { c.pos.z += sz * push * k; return; }
          c.pos.x += sx * push * k; c.pos.z = clamp(c.pos.z + sz * push * k, -deckHalf(c.pos.x), deckHalf(c.pos.x));
        };
        shove(a, ka, -dx, -dz); shove(b, kb, dx, dz);
      }
      for (const c of others) c.update({ dt, gApp: st.gAppAt ? st.gAppAt(c.com) : undefined, tillerEnd: st.tillerEnd, yardFoot: st.yardFoot });
    }
    loads() { return this.list.map(c => ({ p: c.com, m: c.mass })); }
    // a collision: dv is the boat's change of velocity (boat frame, real m/s), at = where she was struck
    jolt(dvx, dvz, sev, at) {
      for (const c of this.list) {
        const near = at ? Math.max(0, 1 - Math.hypot(c.pos.x - at.x, c.pos.z - at.z) / 3.5) : 0;
        c.jolt(dvx, dvz, sev * (1 + 0.35 * near));
      }
    }
    anyDown() { return this.list.some(c => c.fall && c.fall.down); }
    // put everyone straight at his station (start, or after the boat is righted)
    snap(st) {
      const save = st.dt; st.dt = 0.0001; st.snap = true; this.update(st); st.snap = false;
      for (const c of this.list) if (c.goal) { c.place(c.goal.at, c.goal.surf); c.procW = c.goal.pose && c.goal.pose.kind !== 'stand' ? 1 : 0; c.speed = 0; }
      for (let i = 0; i < 3; i++) this.update(st);
      st.dt = save;
    }
  }

  root.PaaiCrew = { CrewMember, CrewDirector, ROLES, MASS, PLANK_X, PLANK_TOP, PLANK_END, MASTHEAD, TAIL_FROM, deckY, surfY };
})(typeof window !== 'undefined' ? window : globalThis);
