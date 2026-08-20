// ============================================================
// Fish Blaster - tap to aim a cannon and shoot fish. Bigger fish
// need more hits but score more. Beat the clock for a high score.
// Pure Canvas 2D, zero dependencies. Touch-first, kid-friendly
// (no coins/gambling; just shoot and score).
// ============================================================
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let dpr = 1, viewW = 0, viewH = 0;
  let running = false, lastTime = 0;

  const ACCENT = (window.PlayerProfile && PlayerProfile.getColor()) || "#2aa6e0";

  let score = 0;
  let best = 0;
  let timeLeft = 60;
  let fish = [];
  let bullets = [];
  let particles = [];
  let spawnTimer = 0;
  let shootCooldown = 0;

  const cannon = { x: 0, y: 0, angle: -Math.PI / 2 };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Fish types: hp (hits to catch), value (score), r (size), speed
  const FISH_TYPES = [
    { kind: "small",  hp: 1, value: 10,  r: 16, color: "#ffd23f", speedMul: 1.5 },
    { kind: "medium", hp: 3, value: 40,  r: 26, color: "#ff922b", speedMul: 1.1 },
    { kind: "big",    hp: 6, value: 120, r: 40, color: "#e64980", speedMul: 0.75 },
    { kind: "boss",   hp: 14, value: 400, r: 58, color: "#9775fa", speedMul: 0.5 },
  ];

  function spawnFish() {
    const roll = Math.random();
    let t;
    if (roll < 0.5) t = FISH_TYPES[0];
    else if (roll < 0.8) t = FISH_TYPES[1];
    else if (roll < 0.96) t = FISH_TYPES[2];
    else t = FISH_TYPES[3];

    const fromLeft = Math.random() < 0.5;
    const y = rand(viewH * 0.12, viewH * 0.72);
    const speed = rand(50, 90) * t.speedMul * (fromLeft ? 1 : -1);
    fish.push({
      ...t, hp: t.hp, maxHp: t.hp,
      x: fromLeft ? -t.r - 10 : viewW + t.r + 10,
      y,
      vx: speed,
      wobble: rand(0, Math.PI * 2),
      dir: fromLeft ? 1 : -1,
    });
  }

  // ---- Input ----
  function onTap(e) {
    e.preventDefault();
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    const tx = pt.clientX - rect.left;
    const ty = pt.clientY - rect.top;
    cannon.angle = Math.atan2(ty - cannon.y, tx - cannon.x);
    if (shootCooldown <= 0) {
      fire();
      shootCooldown = 0.18;
    }
  }

  function fire() {
    const speed = 720;
    bullets.push({
      x: cannon.x + Math.cos(cannon.angle) * 40,
      y: cannon.y + Math.sin(cannon.angle) * 40,
      vx: Math.cos(cannon.angle) * speed,
      vy: Math.sin(cannon.angle) * speed,
    });
  }

  // ---- Update ----
  function update(dt) {
    ambientTime += dt;
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endGame(); return; }

    if (shootCooldown > 0) shootCooldown -= dt;

    // spawn fish
    spawnTimer -= dt;
    if (spawnTimer <= 0 && fish.length < 14) {
      spawnFish();
      spawnTimer = rand(0.5, 1.3);
    }

    // fish movement
    for (let i = fish.length - 1; i >= 0; i--) {
      const f = fish[i];
      f.x += f.vx * dt;
      f.wobble += dt * 3;
      f.y += Math.sin(f.wobble) * 12 * dt;
      if ((f.vx > 0 && f.x > viewW + f.r + 20) || (f.vx < 0 && f.x < -f.r - 20)) {
        fish.splice(i, 1);
      }
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -20 || b.x > viewW + 20 || b.y < -20 || b.y > viewH + 20) {
        bullets.splice(i, 1);
        continue;
      }
      // hit test
      for (let j = fish.length - 1; j >= 0; j--) {
        const f = fish[j];
        if (Math.hypot(b.x - f.x, b.y - f.y) < f.r) {
          f.hp -= 1;
          burst(b.x, b.y, "#fff", 5);
          bullets.splice(i, 1);
          if (f.hp <= 0) {
            score += f.value;
            burst(f.x, f.y, f.color, 20);
            fish.splice(j, 1);
          }
          break;
        }
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
    document.getElementById("score").textContent = score;
    document.getElementById("timer").textContent = Math.ceil(timeLeft) + "s";
    document.getElementById("timer").classList.toggle("urgent", timeLeft <= 10);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 200);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), maxLife: 0.7, r: rand(2, 5), color });
    }
  }

  // ---- Render ----
  let ambientTime = 0;

  function draw() {
    // water gradient
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, "#3fb0e8");
    g.addColorStop(0.5, "#1f7fc0");
    g.addColorStop(1, "#062138");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    drawLightRays();
    drawSeabed();
    drawAmbientBubbles();
    drawFish();
    drawBullets();
    drawParticles();
    drawCannon();
  }

  // Sun rays from the surface
  function drawLightRays() {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "#ffffff";
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = (viewW / n) * i + (i * 37 % 60);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 60, 0);
      ctx.lineTo(x + 160, viewH);
      ctx.lineTo(x + 40, viewH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Sandy seabed with seaweed near the bottom
  function drawSeabed() {
    const top = viewH - 70;
    ctx.save();
    // seaweed sway
    ctx.strokeStyle = "rgba(60,180,120,0.55)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const x = (viewW / 8) * i + 30;
      const sway = Math.sin(ambientTime * 1.5 + i) * 14;
      ctx.beginPath();
      ctx.moveTo(x, viewH);
      ctx.quadraticCurveTo(x + sway, viewH - 40, x + sway * 1.6, top - 20);
      ctx.stroke();
    }
    // sand
    ctx.fillStyle = "#c9a86a";
    ctx.beginPath();
    ctx.moveTo(0, viewH);
    ctx.lineTo(0, top + 10);
    for (let x = 0; x <= viewW; x += 40) {
      ctx.lineTo(x, top + 10 + Math.sin(x * 0.03) * 8);
    }
    ctx.lineTo(viewW, viewH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAmbientBubbles() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 14; i++) {
      const x = (i * 97) % viewW;
      const y = viewH - ((ambientTime * 30 + i * 60) % viewH);
      const r = 3 + (i % 3);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFish() {
    for (const f of fish) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.dir, 1);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath(); ctx.ellipse(0, f.r * 0.7, f.r, f.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      // tail (with a gentle flap)
      const flap = Math.sin(f.wobble * 2) * f.r * 0.15;
      ctx.fillStyle = shade(f.color, -0.15);
      ctx.beginPath();
      ctx.moveTo(f.r * 0.7, 0);
      ctx.lineTo(f.r * 1.4, -f.r * 0.5 + flap);
      ctx.lineTo(f.r * 1.4, f.r * 0.5 + flap);
      ctx.closePath(); ctx.fill();
      // dorsal fin
      ctx.fillStyle = shade(f.color, -0.05);
      ctx.beginPath();
      ctx.moveTo(-f.r * 0.1, -f.r * 0.6);
      ctx.quadraticCurveTo(f.r * 0.2, -f.r * 1.05, f.r * 0.45, -f.r * 0.5);
      ctx.closePath(); ctx.fill();
      // body
      const gr = ctx.createRadialGradient(-f.r * 0.3, -f.r * 0.3, f.r * 0.2, 0, 0, f.r);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(0.4, f.color);
      gr.addColorStop(1, shade(f.color, -0.3));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(0, 0, f.r, f.r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      // eye
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-f.r * 0.45, -f.r * 0.12, f.r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(-f.r * 0.5, -f.r * 0.12, f.r * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // hp bar for tough fish
      if (f.maxHp > 1 && f.hp < f.maxHp) {
        const w = f.r * 1.6;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(f.x - w / 2, f.y - f.r - 12, w, 5);
        ctx.fillStyle = "#3ddc84";
        ctx.fillRect(f.x - w / 2, f.y - f.r - 12, w * (f.hp / f.maxHp), 5);
      }
    }
  }

  function drawBullets() {
    ctx.fillStyle = ACCENT;
    for (const b of bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCannon() {
    ctx.save();
    ctx.translate(cannon.x, cannon.y);
    // base
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    // barrel
    ctx.rotate(cannon.angle + Math.PI / 2);
    const bg = ctx.createLinearGradient(-12, 0, 12, 0);
    bg.addColorStop(0, shade(ACCENT, -0.3));
    bg.addColorStop(0.5, ACCENT);
    bg.addColorStop(1, shade(ACCENT, -0.3));
    ctx.fillStyle = bg;
    ctx.fillRect(-12, -46, 24, 50);
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
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
    cannon.x = viewW / 2;
    cannon.y = viewH - 46;
  }

  function startGame() {
    score = 0;
    timeLeft = 60;
    fish = []; bullets = []; particles = [];
    spawnTimer = 0; shootCooldown = 0;
    cannon.angle = -Math.PI / 2;
    running = true;
    lastTime = performance.now();
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
    // seed a few fish so it's lively immediately
    for (let i = 0; i < 4; i++) spawnFish();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    if (score > best) best = score;
    document.getElementById("best").textContent = best;
    document.getElementById("final-score").textContent = score;
    document.getElementById("over-screen").classList.remove("hidden");
  }

  // Events
  window.addEventListener("resize", resize);
  canvas.addEventListener("mousedown", onTap);
  canvas.addEventListener("touchstart", onTap, { passive: false });
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  resize();
})();
