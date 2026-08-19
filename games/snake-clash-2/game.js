// ============================================================
// Snake Clash 2: RAMPAGE - pseudo-3D snake battle (Canvas 2D)
// V2 focus: level system, aggressive AI (encircle / intercept),
// touch boost, heavy visual punch (particles, shake, kills),
// faster pace and rising difficulty.
// Zero dependencies.
// ============================================================

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---------- World & visual tuning ----------
  const WORLD = { w: 3400, h: 3400 };
  const ISO_TILT = 0.6;
  const FOOD_COUNT = 300;
  const BASE_AI_COUNT = 12;

  const COLORS = [
    "#ff6b35", "#ffd23f", "#3ddc84", "#4dabf7", "#e64980",
    "#9775fa", "#20c997", "#ff922b", "#f06595", "#5c7cfa",
    "#94d82d", "#22b8cf",
  ];

  // ---------- Runtime state ----------
  let dpr = 1;
  let viewW = 0, viewH = 0;
  let running = false;
  let foods = [];
  let snakes = [];
  let particles = [];
  let player = null;
  let camera = { x: 0, y: 0, zoom: 1 };
  let shake = 0;
  let pointer = { x: 0, y: 0, active: false };
  let boosting = false;
  let boostCooldown = 0;
  let lastTime = 0;
  let elapsed = 0;      // seconds survived within the current stage
  let killCount = 0;

  // ---------- Round / Boss / Stage state ----------
  const ROUND_TIME = 60;        // seconds before the boss appears
  let stage = 1;                // current stage number
  let timeLeft = ROUND_TIME;    // countdown within the stage
  let boss = null;              // the boss snake, once spawned
  let bossSpawned = false;
  let phase = "round";          // "round" | "boss" | "cleared" | "dead"
  let bannerTimer = 0;          // for on-screen phase banners
  let bannerText = "";

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  function worldToScreen(wx, wy) {
    const z = camera.zoom;
    return {
      x: (wx - camera.x) * z + viewW / 2,
      y: (wy - camera.y) * ISO_TILT * z + viewH / 2,
    };
  }

  // Level is derived from length. Higher level eats lower level.
  function levelOf(s) {
    return 1 + Math.floor(s.length / 12);
  }

  // ---------- Food ----------
  function makeFood(x, y, big, color) {
    const isBig = big ?? Math.random() < 0.14;
    return {
      x: x ?? rand(0, WORLD.w),
      y: y ?? rand(0, WORLD.h),
      r: isBig ? rand(9, 13) : rand(5, 7),
      color: color || COLORS[(Math.random() * COLORS.length) | 0],
      value: isBig ? 3 : 1,
      bob: rand(0, Math.PI * 2),
    };
  }

  function spawnFoods() {
    foods = [];
    for (let i = 0; i < FOOD_COUNT; i++) foods.push(makeFood());
  }

  // ---------- Snakes ----------
  function makeSnake(isPlayer, color, startLen) {
    const x = rand(WORLD.w * 0.15, WORLD.w * 0.85);
    const y = rand(WORLD.h * 0.15, WORLD.h * 0.85);
    return {
      isPlayer,
      color: color || COLORS[(Math.random() * COLORS.length) | 0],
      x, y,
      angle: rand(0, Math.PI * 2),
      baseSpeed: 210,
      speed: 210,
      length: startLen || 8,
      segments: [{ x, y }],
      path: [{ x, y }],
      dead: false,
      // AI state
      mode: "forage",       // forage | hunt | flee
      target: null,
      retargetTimer: 0,
      wanderAngle: rand(0, Math.PI * 2),
    };
  }

  function snakeRadius(s) {
    return 11 + Math.min(s.length, 320) * 0.17;
  }

  const SEG_SPACING = 6;

  function difficulty() {
    // Rises within a round (0->1 over the round) and stacks with stage.
    const inRound = clamp(elapsed / ROUND_TIME, 0, 1);
    const stageBoost = clamp((stage - 1) * 0.25, 0, 1);
    return clamp(inRound * 0.6 + stageBoost, 0, 1);
  }

  // Typical AI starting length grows with the stage, so higher stages
  // are populated with bigger, tougher snakes.
  function aiStartLength() {
    const base = 6 + (stage - 1) * 8;
    return rand(base * 0.6, base + 8 + difficulty() * 24);
  }

  function initSnakes() {
    snakes = [];
    const playerColor = (window.PlayerProfile && PlayerProfile.getColor()) || "#ff6b35";
    player = makeSnake(true, playerColor);
    snakes.push(player);
    const n = BASE_AI_COUNT + Math.floor((stage - 1) * 1.5);
    for (let i = 0; i < n; i++) {
      snakes.push(makeSnake(false, null, aiStartLength()));
    }
  }

  function maybeSpawnAI() {
    if (phase !== "round") return; // stop refilling once the boss is here
    const desired = BASE_AI_COUNT + Math.floor(difficulty() * 8);
    const alive = snakes.filter((s) => !s.dead && s !== boss).length;
    if (alive < desired && Math.random() < 0.02) {
      let s;
      for (let tries = 0; tries < 6; tries++) {
        s = makeSnake(false, null, aiStartLength());
        if (dist2(s.x, s.y, player.x, player.y) > 700 * 700) break;
      }
      snakes.push(s);
    }
  }

  // ---------- Boss ----------
  function spawnBoss() {
    bossSpawned = true;
    phase = "boss";
    // Boss starts just a little above the player's level, so you can out-grow
    // it during the fight. It does NOT grow much, so it's a beatable target.
    const targetLevel = levelOf(player) + 2;
    const bossLen = Math.max(targetLevel * 12, 40);

    // Spawn at the arena corner FARTHEST from the player, so it never appears
    // right on top of you.
    const cornerX = player.x < WORLD.w / 2 ? WORLD.w - 200 : 200;
    const cornerY = player.y < WORLD.h / 2 ? WORLD.h - 200 : 200;

    boss = makeSnake(false, "#c1121f", bossLen);
    boss.x = cornerX; boss.y = cornerY;
    boss.isBoss = true;
    // Boss is a touch SLOWER than the player's normal speed, so a growing
    // player can keep distance while fattening up, then strike.
    boss.baseSpeed = 170;
    boss.speed = 170;
    // Warm-up: boss is sluggish for the first ~2.5s after the warning.
    boss.warmup = 2.5;
    snakes.push(boss);

    banner("⚠ BOSS INCOMING ⚠", 2.4);
    shake = 18;
    // Follow-up coaching hint so the player knows how to win.
    setTimeout(() => {
      if (running && phase === "boss") banner("EAT PELLETS TO OUT-GROW IT, THEN RAM ITS HEAD!", 3);
    }, 2500);
  }

  // ---------- Input ----------
  function updatePointerAngle() {
    if (!pointer.active || !player || player.dead) return;
    const head = worldToScreen(player.x, player.y);
    const dx = pointer.x - head.x;
    const dy = (pointer.y - head.y) / ISO_TILT;
    if (dx * dx + dy * dy > 16) {
      player.angle = lerpAngle(player.angle, Math.atan2(dy, dx), 0.35);
    }
  }

  function setupInput() {
    const setPointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = clientX - rect.left;
      pointer.y = clientY - rect.top;
      pointer.active = true;
    };

    // Mouse
    canvas.addEventListener("mousemove", (e) => setPointer(e.clientX, e.clientY));
    canvas.addEventListener("mousedown", (e) => { if (e.button === 0) boosting = true; });
    window.addEventListener("mouseup", () => { boosting = false; });

    // Keyboard boost
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") { e.preventDefault(); boosting = true; }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") boosting = false;
    });

    // Touch steering (whole canvas)
    const onTouch = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) setPointer(t.clientX, t.clientY);
    };
    canvas.addEventListener("touchstart", (e) => { markTouch(); onTouch(e); }, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });

    // Boost button (touch)
    const boostBtn = document.getElementById("boost-btn");
    const startBoost = (e) => { e.preventDefault(); boosting = true; boostBtn.classList.add("active"); };
    const endBoost = (e) => { if (e) e.preventDefault(); boosting = false; boostBtn.classList.remove("active"); };
    boostBtn.addEventListener("touchstart", startBoost, { passive: false });
    boostBtn.addEventListener("touchend", endBoost, { passive: false });
    boostBtn.addEventListener("touchcancel", endBoost, { passive: false });
    boostBtn.addEventListener("mousedown", startBoost);
    window.addEventListener("mouseup", () => endBoost());
  }

  function markTouch() {
    document.body.classList.add("touch");
  }

  // ---------- AI ----------
  function updateAI(s, dt) {
    s.retargetTimer -= dt;
    const myLevel = levelOf(s);
    const aggression = 0.4 + difficulty() * 0.6; // more aggressive over time

    // Periodically decide behavior
    if (s.retargetTimer <= 0 || !s.target) {
      s.retargetTimer = rand(0.3, 0.7);
      decideAI(s, myLevel, aggression);
    }

    let desired = s.wanderAngle;

    if (s.mode === "hunt" && s.target && !s.target.dead) {
      // Aim ahead of the prey and try to cut it off (intercept point)
      const prey = s.target;
      const lead = 40 + dist2(s.x, s.y, prey.x, prey.y) ** 0.5 * 0.15;
      const ix = prey.x + Math.cos(prey.angle) * lead;
      const iy = prey.y + Math.sin(prey.angle) * lead;
      desired = Math.atan2(iy - s.y, ix - s.x);
    } else if (s.mode === "flee" && s.target && !s.target.dead) {
      const threat = s.target;
      desired = Math.atan2(s.y - threat.y, s.x - threat.x);
      // occasional boost to escape
      if (dist2(s.x, s.y, threat.x, threat.y) < 260 * 260) s.aiBoost = true;
      else s.aiBoost = false;
    } else {
      // forage: nearest food
      let nearest = null, nd = Infinity;
      for (const f of foods) {
        const d = dist2(s.x, s.y, f.x, f.y);
        if (d < nd) { nd = d; nearest = f; }
      }
      if (nearest) desired = Math.atan2(nearest.y - s.y, nearest.x - s.x);
      s.aiBoost = false;
    }

    // Wall avoidance (steer back toward center)
    const margin = 240;
    if (s.x < margin || s.x > WORLD.w - margin || s.y < margin || s.y > WORLD.h - margin) {
      desired = Math.atan2(WORLD.h / 2 - s.y, WORLD.w / 2 - s.x);
      s.aiBoost = false;
    }

    // Smooth turn (sharper when hunting)
    const turnRate = s.mode === "hunt" ? 4.5 : 3;
    s.angle = lerpAngle(s.angle, desired, clamp(turnRate * dt, 0, 1));

    // AI boost handling
    if (s.aiBoost && s.length > 12) {
      s.speed = s.baseSpeed * 1.7;
      s.length -= 2.5 * dt;
    } else {
      s.speed = s.baseSpeed;
    }

    // Boss warm-up: crawls slowly right after spawning so it never
    // ambushes the player the instant it appears.
    if (s.warmup > 0) {
      s.warmup -= dt;
      s.speed *= 0.35;
    }
  }

  function decideAI(s, myLevel, aggression) {
    let bestPrey = null, preyD = Infinity;
    let biggestThreat = null, threatD = Infinity;

    for (const o of snakes) {
      if (o === s || o.dead) continue;
      const d = dist2(s.x, s.y, o.x, o.y);
      const oLevel = levelOf(o);
      if (oLevel < myLevel && d < 650 * 650) {
        if (d < preyD) { preyD = d; bestPrey = o; }
      } else if (oLevel > myLevel && d < 340 * 340) {
        if (d < threatD) { threatD = d; biggestThreat = o; }
      }
    }

    if (biggestThreat) {
      s.mode = "flee";
      s.target = biggestThreat;
    } else if (bestPrey && Math.random() < aggression) {
      s.mode = "hunt";
      s.target = bestPrey;
    } else {
      s.mode = "forage";
      s.target = null;
      s.wanderAngle += rand(-0.6, 0.6);
    }
  }

  // ---------- Movement ----------
  function moveSnake(s, dt) {
    s.x += Math.cos(s.angle) * s.speed * dt;
    s.y += Math.sin(s.angle) * s.speed * dt;
    s.x = clamp(s.x, 0, WORLD.w);
    s.y = clamp(s.y, 0, WORLD.h);

    const p = s.path;
    const last = p[0];
    if (dist2(s.x, s.y, last.x, last.y) > 4) p.unshift({ x: s.x, y: s.y });

    const segCount = Math.max(3, Math.floor(s.length));
    const maxPath = segCount * SEG_SPACING + 20;
    if (p.length > maxPath) p.length = maxPath;

    const segs = [];
    for (let i = 0; i < segCount; i++) {
      const idx = Math.min(i * SEG_SPACING, p.length - 1);
      segs.push(p[idx]);
    }
    s.segments = segs;
  }

  // ---------- Eating & collisions ----------
  function checkEatFood(s) {
    const r = snakeRadius(s);
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const rr = (r + f.r) * (r + f.r);
      if (dist2(s.x, s.y, f.x, f.y) < rr) {
        s.length += f.value * 0.55;
        if (s.isPlayer) spawnParticles(f.x, f.y, f.color, 6, 90);
        // replace food (keep density) unless it's a corpse overflow
        if (foods.length <= FOOD_COUNT + 120) foods[i] = makeFood();
        else foods.splice(i, 1);
      }
    }
  }

  function checkSnakeCollisions() {
    for (const a of snakes) {
      if (a.dead) continue;
      const ra = snakeRadius(a);
      for (const b of snakes) {
        if (a === b || b.dead) continue;
        const rb = snakeRadius(b);
        for (let i = 2; i < b.segments.length; i += 2) {
          const seg = b.segments[i];
          if (!seg) continue;
          const hit = (ra + rb * 0.55) * (ra + rb * 0.55);
          if (dist2(a.x, a.y, seg.x, seg.y) < hit) {
            // higher level wins; tie -> longer wins
            const la = levelOf(a), lb = levelOf(b);
            if (la > lb || (la === lb && a.length >= b.length)) killSnake(b, a);
            else killSnake(a, b);
            break;
          }
        }
      }
    }
  }

  function killSnake(s, by) {
    if (s.dead) return;
    s.dead = true;

    // corpse -> food burst
    for (let i = 0; i < s.segments.length; i += 2) {
      const seg = s.segments[i];
      if (!seg) continue;
      foods.push(makeFood(seg.x + rand(-8, 8), seg.y + rand(-8, 8), true, s.color));
    }
    if (foods.length > FOOD_COUNT + 260) {
      foods.splice(0, foods.length - (FOOD_COUNT + 260));
    }

    // visual burst (bigger for the boss)
    spawnParticles(s.x, s.y, s.color, s.isBoss ? 60 : 26, s.isBoss ? 380 : 240);

    if (s.isPlayer) {
      shake = 22;
      endGame(false);
      return;
    }

    // Boss defeated by the player -> stage clear!
    if (s.isBoss) {
      boss = null;
      if (by && by.isPlayer) {
        shake = 26;
        stageClear();
        return;
      }
    }

    // player got a kill
    if (by && by.isPlayer) {
      by.length += Math.max(4, s.length * 0.35); // reward
      killCount++;
      shake = Math.max(shake, 10);
      showKill();
    }
  }

  // ---------- Particles ----------
  function spawnParticles(x, y, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(spread * 0.3, spread);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.4, 0.9),
        maxLife: 0.9,
        r: rand(2, 5),
        color,
      });
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ---------- Kill feed ----------
  const KILL_WORDS = ["EAT!", "GOTCHA!", "CRUSHED!", "YUM!", "DOMINATE!", "REKT!"];
  function showKill() {
    const feed = document.getElementById("killfeed");
    const el = document.createElement("div");
    el.className = "kill-msg";
    const combo = killCount > 1 ? ` x${killCount}` : "";
    el.textContent = KILL_WORDS[(Math.random() * KILL_WORDS.length) | 0] + combo;
    feed.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ---------- Banner (big centered phase message) ----------
  function banner(text, seconds) {
    bannerText = text;
    bannerTimer = seconds;
  }

  // ---------- Stage clear -> next stage ----------
  function stageClear() {
    phase = "cleared";
    banner(`STAGE ${stage} CLEAR!`, 2.4);
    // Advance after a short celebration
    setTimeout(() => {
      if (!running) return;
      stage += 1;
      startStage(true);
    }, 2400);
  }

  // ---------- Rank ----------
  function computeRank() {
    const alive = snakes.filter((s) => !s.dead);
    alive.sort((a, b) => b.length - a.length);
    return { rank: alive.indexOf(player) + 1, total: alive.length };
  }

  // ============================================================
  // Rendering
  // ============================================================
  function draw() {
    ctx.save();
    // screen shake
    if (shake > 0.2) {
      ctx.translate(rand(-shake, shake), rand(-shake, shake));
    }

    // background
    const grd = ctx.createRadialGradient(viewW / 2, viewH / 2, 60, viewW / 2, viewH / 2, Math.max(viewW, viewH));
    grd.addColorStop(0, "#2a1010");
    grd.addColorStop(1, "#120303");
    ctx.fillStyle = grd;
    ctx.fillRect(-40, -40, viewW + 80, viewH + 80);

    drawGround();
    drawFoods();
    drawSnakes();
    drawParticles();
    drawWorldBounds();

    ctx.restore();
  }

  function drawGround() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,120,60,0.06)";
    ctx.lineWidth = 1;
    const step = 160;
    const z = camera.zoom;
    const startX = Math.floor((camera.x - viewW / z) / step) * step;
    const endX = camera.x + viewW / z;
    for (let wx = startX; wx <= endX; wx += step) {
      const a = worldToScreen(wx, camera.y - viewH / z);
      const b = worldToScreen(wx, camera.y + viewH / z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const startY = Math.floor((camera.y - viewH / ISO_TILT / z) / step) * step;
    const endY = camera.y + viewH / ISO_TILT / z;
    for (let wy = startY; wy <= endY; wy += step) {
      const a = worldToScreen(camera.x - viewW / z, wy);
      const b = worldToScreen(camera.x + viewW / z, wy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorldBounds() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,60,60,0.6)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(255,60,60,0.8)";
    ctx.shadowBlur = 16;
    const tl = worldToScreen(0, 0), tr = worldToScreen(WORLD.w, 0);
    const br = worldToScreen(WORLD.w, WORLD.h), bl = worldToScreen(0, WORLD.h);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  function drawBall(sx, sy, r, color, highlight = true, glow = 0) {
    ctx.save();
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + r * 0.5 * ISO_TILT, r, r * ISO_TILT * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (glow > 0) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.45, r * 0.1, sx, sy, r);
    g.addColorStop(0, lighten(color, 0.5));
    g.addColorStop(0.6, color);
    g.addColorStop(1, darken(color, 0.38));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    if (highlight) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(sx - r * 0.35, sy - r * 0.4, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFoods() {
    for (const f of foods) {
      const s = worldToScreen(f.x, f.y);
      if (s.x < -40 || s.x > viewW + 40 || s.y < -40 || s.y > viewH + 40) continue;
      drawBall(s.x, s.y, f.r, f.color, true, 6);
    }
  }

  function drawSnakes() {
    const order = snakes.filter((s) => !s.dead).slice().sort((a, b) => a.y - b.y);
    for (const s of order) drawSnake(s);
  }

  function drawSnake(s) {
    const r = snakeRadius(s) * camera.zoom;
    const boostingNow = (s.isPlayer && boosting && boostCooldown <= 0 && s.length > 12) || (!s.isPlayer && s.aiBoost);
    let glow = boostingNow ? 18 : (s.isPlayer ? 6 : 0);
    if (s.isBoss) glow = Math.max(glow, 24);

    for (let i = s.segments.length - 1; i >= 0; i--) {
      const seg = s.segments[i];
      if (!seg) continue;
      const p = worldToScreen(seg.x, seg.y);
      if (p.x < -60 || p.x > viewW + 60 || p.y < -60 || p.y > viewH + 60) continue;
      const isHead = i === 0;
      drawBall(p.x, p.y, isHead ? r * 1.18 : r, s.color, true, isHead ? glow : glow * 0.5);
      if (isHead) {
        drawEyes(p.x, p.y, r * 1.18, s.angle);
        if (s.isBoss) drawCrown(p.x, p.y, r * 1.18);
        drawLevelBadge(p.x, p.y, r * 1.18, levelOf(s), s.isPlayer);
      }
    }
  }

  // Golden crown above the boss head
  function drawCrown(sx, sy, r) {
    const w = r * 1.4, h = r * 0.8;
    const y = sy - r - r * 0.9;
    ctx.save();
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - w / 2, y + h);
    ctx.lineTo(sx - w / 2, y + h * 0.3);
    ctx.lineTo(sx - w / 4, y + h * 0.7);
    ctx.lineTo(sx, y);
    ctx.lineTo(sx + w / 4, y + h * 0.7);
    ctx.lineTo(sx + w / 2, y + h * 0.3);
    ctx.lineTo(sx + w / 2, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEyes(sx, sy, r, angle) {
    const ex = Math.cos(angle), ey = Math.sin(angle) * ISO_TILT;
    const px = -ey, py = ex;
    const eyeR = r * 0.3, off = r * 0.45;
    for (const sign of [-1, 1]) {
      const cx = sx + ex * r * 0.4 + px * off * sign;
      const cy = sy + ey * r * 0.4 + py * off * sign;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(cx, cy, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(cx + ex * eyeR * 0.4, cy + ey * eyeR * 0.4, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Level number floating above head
  function drawLevelBadge(sx, sy, r, level, isPlayer) {
    const y = sy - r - 12;
    ctx.save();
    ctx.font = `900 ${Math.max(12, r * 0.9)}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = String(level);
    // outline
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(text, sx, y);
    ctx.fillStyle = isPlayer ? "#ffd23f" : "#fff";
    ctx.fillText(text, sx, y);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const s = worldToScreen(p.x, p.y);
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Color utils
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function lighten(hex, amt) {
    const c = hexToRgb(hex);
    return `rgb(${clamp(c.r + 255 * amt, 0, 255) | 0},${clamp(c.g + 255 * amt, 0, 255) | 0},${clamp(c.b + 255 * amt, 0, 255) | 0})`;
  }
  function darken(hex, amt) {
    const c = hexToRgb(hex);
    return `rgb(${(c.r * (1 - amt)) | 0},${(c.g * (1 - amt)) | 0},${(c.b * (1 - amt)) | 0})`;
  }

  // ============================================================
  // Update loop
  // ============================================================
  function update(dt) {
    elapsed += dt;
    updatePointerAngle();

    // ----- Round countdown -> spawn boss -----
    if (phase === "round") {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        if (!bossSpawned) spawnBoss();
      }
    }

    // Banner timer
    if (bannerTimer > 0) bannerTimer -= dt;
    const bannerEl = document.getElementById("banner");
    if (bannerTimer > 0) {
      if (bannerEl.textContent !== bannerText) bannerEl.textContent = bannerText;
      bannerEl.classList.add("show");
    } else {
      bannerEl.classList.remove("show");
    }

    // player boost
    handlePlayerBoost(dt);

    for (const s of snakes) {
      if (s.dead) continue;
      if (!s.isPlayer) updateAI(s, dt);
      moveSnake(s, dt);
      checkEatFood(s);
    }
    checkSnakeCollisions();
    updateParticles(dt);
    maybeSpawnAI();

    // remove dead snakes occasionally to keep arrays small
    if (snakes.length > 40) snakes = snakes.filter((s) => !s.dead || s.isPlayer);

    // camera: follow + zoom out slightly as you grow
    if (player && !player.dead) {
      const targetZoom = clamp(1.15 - player.length * 0.0016, 0.7, 1.15);
      camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 2);
      camera.x += (player.x - camera.x) * Math.min(1, dt * 7);
      camera.y += (player.y - camera.y) * Math.min(1, dt * 7);
    }

    shake *= 0.86;

    // HUD
    document.getElementById("level").textContent = levelOf(player);
    document.getElementById("score").textContent = Math.floor(player.length);
    const { rank, total } = computeRank();
    document.getElementById("rank").textContent = `${rank}/${total}`;
    document.getElementById("stage").textContent = stage;
    const timerEl = document.getElementById("timer");
    if (phase === "round") {
      timerEl.textContent = Math.ceil(timeLeft) + "s";
      timerEl.classList.toggle("urgent", timeLeft <= 10);
    } else if (phase === "boss") {
      timerEl.textContent = "BOSS";
      timerEl.classList.add("urgent");
    } else {
      timerEl.textContent = "—";
      timerEl.classList.remove("urgent");
    }
  }

  function handlePlayerBoost(dt) {
    const btn = document.getElementById("boost-btn");
    if (boostCooldown > 0) {
      boostCooldown -= dt;
      btn.classList.add("cooldown");
    } else {
      btn.classList.remove("cooldown");
    }

    if (boosting && boostCooldown <= 0 && player.length > 12) {
      player.speed = player.baseSpeed * 1.9;
      player.length -= 3.5 * dt; // burn length to sprint
      // sprint trail
      if (Math.random() < 0.6) spawnParticles(player.x, player.y, "#ffb03a", 2, 60);
      if (player.length <= 12) { boostCooldown = 2; boosting = false; }
    } else {
      player.speed = player.baseSpeed + Math.min(player.length, 320) * 0.1;
    }
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ============================================================
  // Lifecycle
  // ============================================================
  function resize() {
    dpr = window.devicePixelRatio || 1;
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // (Re)start a stage. If advancing==true we keep the game running and just
  // rebuild the arena for the next stage (player resets to a small snake, but
  // the arena and its snakes are bigger).
  function startStage(advancing) {
    spawnFoods();
    initSnakes();
    particles = [];
    camera.x = player.x; camera.y = player.y; camera.zoom = 1.1;
    pointer.active = false;
    boosting = false;
    boostCooldown = 0;
    elapsed = 0;
    killCount = 0;
    shake = 0;
    // round/boss state
    timeLeft = ROUND_TIME;
    boss = null;
    bossSpawned = false;
    phase = "round";
    banner(advancing ? `STAGE ${stage}` : "GO!", 1.6);
  }

  function startGame() {
    stage = 1;
    running = true;
    startStage(false);
    lastTime = performance.now();
    document.body.classList.add("playing");
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    phase = "dead";
    document.body.classList.remove("playing");
    document.getElementById("banner").classList.remove("show");
    document.getElementById("final-level").textContent = "Stage " + stage;
    document.getElementById("final-score").textContent = Math.floor(player.length);
    document.getElementById("kill-summary").textContent =
      killCount > 0 ? `You ate ${killCount} snake${killCount > 1 ? "s" : ""} this stage!` : "Hunt some snakes next time!";
    document.getElementById("over-screen").classList.remove("hidden");
  }

  // Events
  window.addEventListener("resize", resize);
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  // Detect touch-capable device up front so the boost button is ready at start
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    markTouch();
  }

  resize();
  setupInput();
})();
