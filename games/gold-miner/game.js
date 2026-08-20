// ============================================================
// Gold Miner - swing the claw, tap to grab treasure before time runs out.
// Pure Canvas 2D, zero dependencies. Touch-first.
// ============================================================
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let dpr = 1, viewW = 0, viewH = 0;
  let running = false, lastTime = 0;

  // Player accent color (from Game Center profile) tints the miner.
  const ACCENT = (window.PlayerProfile && PlayerProfile.getColor()) || "#ffd23f";

  // ---- Game state ----
  let level = 1;
  let score = 0;
  let goal = 650;
  let timeLeft = 60;
  let items = [];
  let particles = [];

  // Claw / hook
  const claw = {
    baseX: 0, baseY: 0,     // pivot point (top center)
    angle: 0,               // swing angle (radians from straight down)
    swingDir: 1,
    swingSpeed: 1.4,
    length: 60,             // current rope length
    state: "swing",         // swing | extend | retract
    speed: 620,             // extend/retract speed px/s
    grabbed: null,          // item currently held
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- Item types ----
  // value: money; weight: how slow it reels in (higher = slower); r: radius
  const TYPES = [
    { kind: "goldS", value: 50,  weight: 1.0, r: 14, color: "#ffd23f" },
    { kind: "goldM", value: 200, weight: 1.9, r: 22, color: "#ffcc2a" },
    { kind: "goldL", value: 500, weight: 3.2, r: 34, color: "#f5b800" },
    { kind: "diamond", value: 600, weight: 1.2, r: 16, color: "#6fe3ff" },
    { kind: "rock", value: 12, weight: 3.6, r: 30, color: "#8a8f98" },
    { kind: "rockBig", value: 20, weight: 4.6, r: 42, color: "#6f747c" },
  ];

  function makeItem(type, x, y) {
    return { ...type, x, y, held: false };
  }

  // Lay out items in the "dirt" region (below the claw area).
  function spawnItems() {
    items = [];
    const top = viewH * 0.32;     // dirt starts here
    const bottom = viewH - 40;
    const count = 8 + level;      // more clutter each level
    const pool = [];
    // weighted-ish distribution
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let t;
      if (roll < 0.28) t = TYPES[0];        // small gold
      else if (roll < 0.45) t = TYPES[1];   // medium gold
      else if (roll < 0.55) t = TYPES[2];   // large gold
      else if (roll < 0.68) t = TYPES[3];   // diamond
      else if (roll < 0.85) t = TYPES[4];   // rock
      else t = TYPES[5];                    // big rock
      pool.push(t);
    }
    for (const t of pool) {
      let x, y, ok = false;
      for (let tries = 0; tries < 30; tries++) {
        x = rand(t.r + 20, viewW - t.r - 20);
        y = rand(top + t.r, bottom - t.r);
        ok = items.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + t.r + 8);
        if (ok) break;
      }
      items.push(makeItem(t, x, y));
    }
  }

  // ---- Input: tap to drop the claw ----
  function onTap(e) {
    e.preventDefault();
    if (!running) return;
    if (claw.state === "swing") claw.state = "extend";
  }

  // ---- Update ----
  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endGame(); return; }

    const cx = claw.baseX + Math.sin(claw.angle) * claw.length;
    const cy = claw.baseY + Math.cos(claw.angle) * claw.length;

    if (claw.state === "swing") {
      claw.angle += claw.swingDir * claw.swingSpeed * dt;
      if (claw.angle > 1.15) { claw.angle = 1.15; claw.swingDir = -1; }
      if (claw.angle < -1.15) { claw.angle = -1.15; claw.swingDir = 1; }
      claw.length = 60;
    } else if (claw.state === "extend") {
      claw.length += claw.speed * dt;
      // hit an item?
      for (const it of items) {
        if (it.held) continue;
        if (Math.hypot(cx - it.x, cy - it.y) < it.r) {
          claw.grabbed = it;
          it.held = true;
          claw.state = "retract";
          break;
        }
      }
      // hit bottom or sides -> retract empty
      if (cy > viewH - 10 || cx < 0 || cx > viewW || claw.length > 1400) {
        claw.state = "retract";
      }
    } else if (claw.state === "retract") {
      // reel speed depends on the weight of what we hold
      const w = claw.grabbed ? claw.grabbed.weight : 1;
      claw.length -= (claw.speed / w) * dt;
      if (claw.grabbed) {
        claw.grabbed.x = cx;
        claw.grabbed.y = cy;
      }
      if (claw.length <= 60) {
        claw.length = 60;
        if (claw.grabbed) collect(claw.grabbed);
        claw.grabbed = null;
        claw.state = "swing";
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // HUD
    document.getElementById("score").textContent = "$" + score;
    document.getElementById("timer").textContent = Math.ceil(timeLeft) + "s";
    document.getElementById("timer").classList.toggle("urgent", timeLeft <= 10);

    // win as soon as goal reached
    if (score >= goal) winLevel();
  }

  function collect(it) {
    score += it.value;
    burst(it.x, it.y, it.color, it.value >= 200 ? 22 : 10);
    const idx = items.indexOf(it);
    if (idx >= 0) items.splice(idx, 1);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 200);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), maxLife: 0.7, r: rand(2, 5), color });
    }
  }

  // ---- Render ----
  function draw() {
    // sky
    ctx.fillStyle = "#5a3d22";
    ctx.fillRect(0, 0, viewW, viewH);
    // dirt
    const dirtTop = viewH * 0.3;
    const g = ctx.createLinearGradient(0, dirtTop, 0, viewH);
    g.addColorStop(0, "#6b4a2b");
    g.addColorStop(1, "#3a2716");
    ctx.fillStyle = g;
    ctx.fillRect(0, dirtTop, viewW, viewH - dirtTop);
    // ground line
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, dirtTop); ctx.lineTo(viewW, dirtTop); ctx.stroke();

    drawMiner();
    drawItems();
    drawClaw();
    drawParticles();
  }

  function drawMiner() {
    // simple miner at top center, hat tinted with accent color
    const x = claw.baseX, y = claw.baseY - 34;
    ctx.save();
    // body
    ctx.fillStyle = "#c98a4b";
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    // hat
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.ellipse(x, y - 10, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 12, 12, Math.PI, 0); ctx.fill();
    ctx.restore();
  }

  function drawClaw() {
    const cx = claw.baseX + Math.sin(claw.angle) * claw.length;
    const cy = claw.baseY + Math.cos(claw.angle) * claw.length;
    // rope
    ctx.strokeStyle = "#d9c9a3";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(claw.baseX, claw.baseY); ctx.lineTo(cx, cy); ctx.stroke();
    // claw
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(claw.angle);
    ctx.strokeStyle = "#c9ccd4";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, 14, 12, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(-16, 12);
    ctx.moveTo(12, 0); ctx.lineTo(16, 12);
    ctx.stroke();
    ctx.restore();
  }

  function drawItems() {
    for (const it of items) {
      drawShiny(it.x, it.y, it.r, it.color, it.kind === "diamond");
    }
  }

  function drawShiny(x, y, r, color, gem) {
    ctx.save();
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    if (gem) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(0.4, color);
      gr.addColorStop(1, shade(color, -0.35));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function shade(hex, amt) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const f = (v) => clamp(v + 255 * amt, 0, 255) | 0;
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // ---- Loop ----
  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---- Lifecycle ----
  function resize() {
    dpr = window.devicePixelRatio || 1;
    viewW = window.innerWidth; viewH = window.innerHeight;
    canvas.width = viewW * dpr; canvas.height = viewH * dpr;
    canvas.style.width = viewW + "px"; canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    claw.baseX = viewW / 2;
    claw.baseY = viewH * 0.14;
  }

  function startLevel() {
    goal = Math.round(650 * Math.pow(1.4, level - 1));
    timeLeft = 60;
    score = 0;
    claw.state = "swing";
    claw.angle = 0;
    claw.swingDir = 1;
    claw.length = 60;
    claw.grabbed = null;
    claw.swingSpeed = 1.4 + (level - 1) * 0.12;
    particles = [];
    spawnItems();
    document.getElementById("level").textContent = level;
    document.getElementById("goal").textContent = "$" + goal;
  }

  function startGame() {
    level = 1;
    running = true;
    startLevel();
    lastTime = performance.now();
    hideOverlays();
    requestAnimationFrame(loop);
  }

  function winLevel() {
    running = false;
    document.getElementById("win-score").textContent = "$" + score;
    document.getElementById("win-screen").classList.remove("hidden");
  }

  function nextLevel() {
    level += 1;
    running = true;
    startLevel();
    lastTime = performance.now();
    hideOverlays();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    document.getElementById("final-level").textContent = level;
    document.getElementById("final-score").textContent = "$" + score;
    document.getElementById("over-screen").classList.remove("hidden");
  }

  function hideOverlays() {
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("win-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
  }

  // Events
  window.addEventListener("resize", resize);
  canvas.addEventListener("mousedown", onTap);
  canvas.addEventListener("touchstart", onTap, { passive: false });
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("next-btn").addEventListener("click", nextLevel);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  resize();
})();
