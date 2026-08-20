// ============================================================
// Snake Clash - 伪3D 贪吃蛇 (纯 Canvas 2D)
// 伪3D 手法：斜俯视角，Y 轴按比例压扁 (ISO_TILT)，
// 球体带高光+落地阴影，营造立体感。
// ============================================================

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---------- 世界与视觉参数 ----------
  const WORLD = { w: 3000, h: 3000 };   // 游戏世界大小
  const ISO_TILT = 0.62;                 // Y 轴压扁比例 -> 斜俯视角
  const FOOD_COUNT = 260;                // 场上食物数量
  const AI_COUNT = 10;                   // AI 蛇数量

  const COLORS = [
    "#3ddc84", "#ff6b6b", "#4dabf7", "#ffd43b",
    "#e599f7", "#ff922b", "#63e6be", "#ff8787",
    "#748ffc", "#f783ac", "#a9e34b", "#66d9e8",
  ];

  // ---------- 运行状态 ----------
  let dpr = 1;
  let viewW = 0, viewH = 0;
  let running = false;
  let foods = [];
  let snakes = [];
  let player = null;
  let camera = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0, active: false };
  let lastTime = 0;

  // ---------- 工具函数 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  // 世界坐标 -> 屏幕坐标（应用伪3D 压扁 + 镜头）
  function worldToScreen(wx, wy) {
    return {
      x: (wx - camera.x) + viewW / 2,
      y: (wy - camera.y) * ISO_TILT + viewH / 2,
    };
  }

  // ---------- 食物 ----------
  function makeFood() {
    const big = Math.random() < 0.12;
    return {
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      r: big ? rand(9, 13) : rand(5, 7),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      value: big ? 3 : 1,
    };
  }

  function spawnFoods() {
    foods = [];
    for (let i = 0; i < FOOD_COUNT; i++) foods.push(makeFood());
  }

  // ---------- 蛇 ----------
  function makeSnake(isPlayer, color) {
    const x = rand(WORLD.w * 0.2, WORLD.w * 0.8);
    const y = rand(WORLD.h * 0.2, WORLD.h * 0.8);
    return {
      isPlayer,
      color: color || COLORS[(Math.random() * COLORS.length) | 0],
      x, y,
      angle: rand(0, Math.PI * 2),
      speed: 165,
      length: 8,            // 逻辑长度（决定身体节数）
      segments: [{ x, y }], // 身体节点历史
      path: [{ x, y }],     // 头部走过的轨迹点
      dead: false,
      // AI 专用
      aiTurnTimer: 0,
      aiTargetAngle: rand(0, Math.PI * 2),
    };
  }

  // 蛇的半径（越长越粗）
  function snakeRadius(s) {
    return 10 + Math.min(s.length, 260) * 0.16;
  }

  // 身体节点间距
  const SEG_SPACING = 6;

  function initSnakes() {
    snakes = [];
    const playerColor = (window.PlayerProfile && PlayerProfile.getColor()) || "#3ddc84";
    player = makeSnake(true, playerColor);
    snakes.push(player);
    for (let i = 0; i < AI_COUNT; i++) {
      snakes.push(makeSnake(false));
    }
  }

  // ---------- 输入 ----------
  function updatePointerAngle() {
    if (!pointer.active || !player || player.dead) return;
    // 指针在屏幕坐标，换算成相对头部方向（注意 Y 压扁要还原）
    const head = worldToScreen(player.x, player.y);
    const dx = pointer.x - head.x;
    const dy = (pointer.y - head.y) / ISO_TILT;
    if (dx * dx + dy * dy > 25) {
      player.angle = Math.atan2(dy, dx);
    }
  }

  function setupInput() {
    const setPointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = clientX - rect.left;
      pointer.y = clientY - rect.top;
      pointer.active = true;
    };

    canvas.addEventListener("mousemove", (e) => setPointer(e.clientX, e.clientY));
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      setPointer(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      setPointer(t.clientX, t.clientY);
    }, { passive: false });
  }

  // ---------- AI 行为 ----------
  function updateAI(s, dt) {
    // 找最近的食物作为目标，偶尔随机转向
    s.aiTurnTimer -= dt;

    let nearest = null;
    let nd = Infinity;
    for (const f of foods) {
      const d = dist2(s.x, s.y, f.x, f.y);
      if (d < nd) { nd = d; nearest = f; }
    }

    if (nearest && nd < 500 * 500) {
      s.aiTargetAngle = Math.atan2(nearest.y - s.y, nearest.x - s.x);
    } else if (s.aiTurnTimer <= 0) {
      s.aiTargetAngle = rand(0, Math.PI * 2);
      s.aiTurnTimer = rand(1, 3);
    }

    // 避免撞墙：靠近边界就往中心转
    const margin = 200;
    if (s.x < margin) s.aiTargetAngle = 0;
    else if (s.x > WORLD.w - margin) s.aiTargetAngle = Math.PI;
    if (s.y < margin) s.aiTargetAngle = Math.PI / 2;
    else if (s.y > WORLD.h - margin) s.aiTargetAngle = -Math.PI / 2;

    // 平滑转向
    let diff = s.aiTargetAngle - s.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    s.angle += clamp(diff, -3 * dt, 3 * dt);
  }

  // ---------- 移动 ----------
  function moveSnake(s, dt) {
    s.x += Math.cos(s.angle) * s.speed * dt;
    s.y += Math.sin(s.angle) * s.speed * dt;
    s.x = clamp(s.x, 0, WORLD.w);
    s.y = clamp(s.y, 0, WORLD.h);

    // 记录轨迹
    const p = s.path;
    const last = p[0];
    if (dist2(s.x, s.y, last.x, last.y) > 4) {
      p.unshift({ x: s.x, y: s.y });
    }

    // 根据长度决定需要多少条轨迹点，裁掉多余的
    const segCount = Math.floor(s.length);
    const maxPath = segCount * SEG_SPACING + 20;
    if (p.length > maxPath) p.length = maxPath;

    // 从轨迹上按间距取出身体节点
    const segs = [];
    for (let i = 0; i < segCount; i++) {
      const idx = Math.min(i * SEG_SPACING, p.length - 1);
      segs.push(p[idx]);
    }
    s.segments = segs;
  }

  // ---------- 碰撞 ----------
  function checkEatFood(s) {
    const r = snakeRadius(s);
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const rr = (r + f.r) * (r + f.r);
      if (dist2(s.x, s.y, f.x, f.y) < rr) {
        s.length += f.value * 0.5;
        s.speed = 165 + Math.min(s.length, 260) * 0.12;
        foods[i] = makeFood(); // 立即补充
      }
    }
  }

  // 蛇头撞到别的蛇身：大吃小
  function checkSnakeCollisions() {
    for (const a of snakes) {
      if (a.dead) continue;
      const ra = snakeRadius(a);
      for (const b of snakes) {
        if (a === b || b.dead) continue;
        const rb = snakeRadius(b);
        // a 的头是否撞到 b 的身体
        for (let i = 2; i < b.segments.length; i += 2) {
          const seg = b.segments[i];
          const hit = (ra + rb * 0.6) * (ra + rb * 0.6);
          if (dist2(a.x, a.y, seg.x, seg.y) < hit) {
            // 谁更长谁赢
            if (a.length >= b.length) killSnake(b);
            else killSnake(a);
            break;
          }
        }
      }
    }
  }

  function killSnake(s) {
    if (s.dead) return;
    s.dead = true;
    // 尸体变成食物撒一地
    for (let i = 0; i < s.segments.length; i += 2) {
      const seg = s.segments[i];
      if (!seg) continue;
      foods.push({
        x: seg.x + rand(-8, 8),
        y: seg.y + rand(-8, 8),
        r: rand(6, 9),
        color: s.color,
        value: 2,
      });
    }
    // 控制食物总量不无限膨胀
    if (foods.length > FOOD_COUNT + 200) {
      foods.splice(0, foods.length - (FOOD_COUNT + 200));
    }

    if (s.isPlayer) {
      endGame();
    } else {
      // AI 死了，过一会儿重生一条新的
      setTimeout(() => {
        if (running) {
          const ns = makeSnake(false);
          const idx = snakes.indexOf(s);
          if (idx >= 0) snakes[idx] = ns;
        }
      }, 2000);
    }
  }

  // ---------- 排名 ----------
  function computeRank() {
    const alive = snakes.filter((s) => !s.dead);
    alive.sort((a, b) => b.length - a.length);
    const idx = alive.indexOf(player);
    return { rank: idx + 1, total: alive.length };
  }

  // ============================================================
  // 渲染
  // ============================================================
  function draw() {
    // 背景
    ctx.clearRect(0, 0, viewW, viewH);
    const grd = ctx.createLinearGradient(0, 0, 0, viewH);
    grd.addColorStop(0, "#24405c");
    grd.addColorStop(1, "#152838");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, viewW, viewH);

    drawGround();

    // 收集所有可绘制对象，按世界 Y 排序（后画的在前面，制造前后遮挡）
    drawFoods();
    drawSnakes();
    drawWorldBounds();
  }

  // 地面网格（透视网格增强 3D 感）
  function drawGround() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const step = 150;
    const startX = Math.floor((camera.x - viewW / 2) / step) * step;
    const endX = camera.x + viewW / 2;
    for (let wx = startX; wx <= endX; wx += step) {
      const a = worldToScreen(wx, camera.y - viewH);
      const b = worldToScreen(wx, camera.y + viewH);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const startY = Math.floor((camera.y - viewH / ISO_TILT) / step) * step;
    const endY = camera.y + viewH / ISO_TILT;
    for (let wy = startY; wy <= endY; wy += step) {
      const a = worldToScreen(camera.x - viewW, wy);
      const b = worldToScreen(camera.x + viewW, wy);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 世界边界（画个框，超出是墙）
  function drawWorldBounds() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,80,80,0.5)";
    ctx.lineWidth = 4;
    const tl = worldToScreen(0, 0);
    const tr = worldToScreen(WORLD.w, 0);
    const br = worldToScreen(WORLD.w, WORLD.h);
    const bl = worldToScreen(0, WORLD.h);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // 画一个伪3D 球体（带落地阴影 + 高光）
  function drawBall(sx, sy, r, color, highlight = true) {
    // 落地阴影
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + r * 0.5 * ISO_TILT, r, r * ISO_TILT * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 球体主体（径向渐变假光照）
    const g = ctx.createRadialGradient(
      sx - r * 0.35, sy - r * 0.45, r * 0.1,
      sx, sy, r
    );
    g.addColorStop(0, lighten(color, 0.5));
    g.addColorStop(0.6, color);
    g.addColorStop(1, darken(color, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // 高光点
    if (highlight) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(sx - r * 0.35, sy - r * 0.4, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFoods() {
    for (const f of foods) {
      const s = worldToScreen(f.x, f.y);
      if (s.x < -50 || s.x > viewW + 50 || s.y < -50 || s.y > viewH + 50) continue;
      drawFruit(s.x, s.y, f.r, f.color);
    }
  }

  // 小水果：光泽果身 + 叶子 + 高光
  function drawFruit(sx, sy, r, color) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + r * 0.55 * ISO_TILT, r * 0.9, r * ISO_TILT * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.4, r * 0.1, sx, sy, r);
    g.addColorStop(0, lighten(color, 0.6));
    g.addColorStop(0.55, color);
    g.addColorStop(1, darken(color, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 8) {
      ctx.fillStyle = "#4caf50";
      ctx.beginPath();
      ctx.ellipse(sx + r * 0.2, sy - r * 0.9, r * 0.35, r * 0.18, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.arc(sx - r * 0.35, sy - r * 0.4, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnakes() {
    // 按头部 Y 排序，让下方的蛇覆盖上方的（前后关系）
    const order = snakes.filter((s) => !s.dead).slice().sort((a, b) => a.y - b.y);
    for (const s of order) drawSnake(s);
  }

  // 平滑连续的管状蛇身 + 鳞纹高光，尾到头绘制
  function drawSnake(s) {
    const r = snakeRadius(s);
    const pts = [];
    for (let i = s.segments.length - 1; i >= 0; i--) {
      const seg = s.segments[i];
      if (!seg) continue;
      pts.push(worldToScreen(seg.x, seg.y));
    }
    if (pts.length < 2) {
      if (pts.length === 1) drawBall(pts[0].x, pts[0].y, r, s.color);
      return;
    }

    // 整条身体的落地阴影
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y + r * 0.5 * ISO_TILT);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + r * 0.5 * ISO_TILT);
    ctx.stroke();
    ctx.restore();

    // 身体描边 + 主体 + 顶部高光条
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = darken(s.color, 0.2);
    ctx.lineWidth = r * 2;
    strokePath(pts);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = r * 1.7;
    strokePath(pts);
    ctx.strokeStyle = lighten(s.color, 0.35);
    ctx.lineWidth = r * 0.7;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y - r * 0.35);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - r * 0.35);
    ctx.stroke();

    // 鳞纹点
    ctx.fillStyle = darken(s.color, 0.28);
    for (let i = 0; i < pts.length; i += 2) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y + r * 0.15, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // 蛇头
    const head = pts[pts.length - 1];
    const hr = r * 1.18;
    drawBall(head.x, head.y, hr, s.color);
    drawEyes(head.x, head.y, hr, s.angle);
    drawTongue(head.x, head.y, hr, s.angle);
  }

  function strokePath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // 分叉吐信
  function drawTongue(sx, sy, r, angle) {
    const ex = Math.cos(angle), ey = Math.sin(angle) * ISO_TILT;
    const bx = sx + ex * r, by = sy + ey * r;
    const tx = bx + ex * r * 0.7, ty = by + ey * r * 0.7;
    const px = -ey, py = ex;
    ctx.save();
    ctx.strokeStyle = "#ff3b5c";
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(tx, ty);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + px * r * 0.25 + ex * r * 0.15, ty + py * r * 0.25 + ey * r * 0.15);
    ctx.moveTo(tx, ty); ctx.lineTo(tx - px * r * 0.25 + ex * r * 0.15, ty - py * r * 0.25 + ey * r * 0.15);
    ctx.stroke();
    ctx.restore();
  }

  // 蛇头眼睛
  function drawEyes(sx, sy, r, angle) {
    const ex = Math.cos(angle), ey = Math.sin(angle) * ISO_TILT;
    // 垂直于朝向的偏移
    const px = -ey, py = ex;
    const eyeR = r * 0.32;
    const off = r * 0.45;
    for (const sign of [-1, 1]) {
      const cx = sx + ex * r * 0.4 + px * off * sign;
      const cy = sy + ey * r * 0.4 + py * off * sign;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx, cy, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx + ex * eyeR * 0.4, cy + ey * eyeR * 0.4, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 颜色工具
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
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
  // 主循环
  // ============================================================
  function update(dt) {
    updatePointerAngle();

    for (const s of snakes) {
      if (s.dead) continue;
      if (!s.isPlayer) updateAI(s, dt);
      moveSnake(s, dt);
      checkEatFood(s);
    }
    checkSnakeCollisions();

    // 镜头平滑跟随玩家
    if (player && !player.dead) {
      camera.x += (player.x - camera.x) * Math.min(1, dt * 6);
      camera.y += (player.y - camera.y) * Math.min(1, dt * 6);
    }

    // 更新 HUD
    document.getElementById("score").textContent = Math.floor(player.length);
    const { rank, total } = computeRank();
    document.getElementById("rank").textContent = `${rank}/${total}`;
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
  // 生命周期
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

  function startGame() {
    spawnFoods();
    initSnakes();
    camera.x = player.x;
    camera.y = player.y;
    pointer.active = false;
    running = true;
    lastTime = performance.now();
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    document.getElementById("final-score").textContent = Math.floor(player.length);
    document.getElementById("over-screen").classList.remove("hidden");
  }

  // ---------- 事件绑定 ----------
  window.addEventListener("resize", resize);
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  resize();
  setupInput();
})();
