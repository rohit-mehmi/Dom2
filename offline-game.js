/* ==========================================================================
   offline-game.js — "Signal Runner"
   A small original endless-runner: a signal dot leaps over drifting
   obstacles while the connection is down. Everything is drawn with canvas
   primitives (no image files, no fonts beyond the system stack), so there
   is nothing extra for the service worker to fetch or cache.

   Controls: Space / ArrowUp / tap-and-hold-free tap = jump. Works with a
   keyboard on desktop and touch on mobile; no keyboard required on mobile.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("signal-runner");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  // ---- Sizing: fixed logical resolution, scaled to fit the element's
  // actual CSS size (including devicePixelRatio) for crisp rendering. ----
  var LOGICAL_W = 800;
  var LOGICAL_H = 300;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    canvas.style.height = rect.width * (LOGICAL_H / LOGICAL_W) + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- Palette (reads from CSS custom properties if present, else falls
  // back to neutral defaults — makes it easy to match any site's theme). ----
  var styles = getComputedStyle(document.documentElement);
  function cssVar(name, fallback) {
    var v = styles.getPropertyValue(name).trim();
    return v || fallback;
  }
  var COLOR_BG = cssVar("--offline-bg", "#0e0e12");
  var COLOR_GROUND = cssVar("--offline-ground", "#2a2a33");
  var COLOR_PLAYER = cssVar("--offline-accent", "#e8b94a");
  var COLOR_OBSTACLE = cssVar("--offline-fg", "#9a9aa5");
  var COLOR_TEXT = cssVar("--offline-fg", "#e8e8ec");

  // ---- Game constants ----
  var GROUND_Y = 230;
  var GRAVITY = 0.62;
  var JUMP_VELOCITY = -11.5;
  var PLAYER_X = 90;
  var PLAYER_SIZE = 22;
  var BASE_SPEED = 4.6;
  var SPEED_RAMP = 0.0009; // speed gained per ms survived

  // ---- State ----
  var state = "ready"; // "ready" | "playing" | "over"
  var player, obstacles, score, best, speed, elapsed, lastTime, spawnTimer;

  function loadBest() {
    try {
      return parseInt(localStorage.getItem("signal-runner-best") || "0", 10);
    } catch (e) {
      return 0;
    }
  }
  function saveBest(value) {
    try {
      localStorage.setItem("signal-runner-best", String(value));
    } catch (e) {}
  }

  function reset() {
    player = { y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true };
    obstacles = [];
    score = 0;
    speed = BASE_SPEED;
    elapsed = 0;
    spawnTimer = 0;
    lastTime = null;
  }

  best = loadBest();
  reset();

  // ---- Input ----
  function jump() {
    if (state === "ready") {
      state = "playing";
      lastTime = null;
      requestAnimationFrame(loop);
    }
    if (state === "over") {
      reset();
      state = "playing";
      lastTime = null;
      requestAnimationFrame(loop);
      return;
    }
    if (state === "playing" && player.onGround) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      jump();
    }
  });
  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    jump();
  });

  // ---- Obstacles ----
  function spawnObstacle() {
    var h = 22 + Math.random() * 26;
    var w = 16 + Math.random() * 14;
    obstacles.push({ x: LOGICAL_W + w, y: GROUND_Y - h, w: w, h: h });
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---- Main loop ----
  function loop(now) {
    if (state !== "playing") return;
    if (lastTime === null) lastTime = now;
    var dt = Math.min(now - lastTime, 48); // clamp to avoid huge jumps on tab-resume
    lastTime = now;
    elapsed += dt;
    speed = BASE_SPEED + elapsed * SPEED_RAMP;
    score = Math.floor(elapsed / 100);

    // physics
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= GROUND_Y - PLAYER_SIZE) {
      player.y = GROUND_Y - PLAYER_SIZE;
      player.vy = 0;
      player.onGround = true;
    }

    // spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = 900 + Math.random() * 900 - Math.min(elapsed / 60, 500);
      if (spawnTimer < 420) spawnTimer = 420;
    }

    // move + collide + cull
    var playerBox = { x: PLAYER_X, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
    for (var i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed * (dt / 16.6);
      if (rectsOverlap(playerBox, obstacles[i])) {
        gameOver();
        return;
      }
      if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
    }

    draw();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = "over";
    if (score > best) {
      best = score;
      saveBest(best);
    }
    draw();
  }

  // ---- Rendering ----
  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // ground
    ctx.strokeStyle = COLOR_GROUND;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(LOGICAL_W, GROUND_Y);
    ctx.stroke();

    // player (a simple rounded square "signal" glyph)
    ctx.fillStyle = COLOR_PLAYER;
    roundRect(PLAYER_X, player.y, PLAYER_SIZE, PLAYER_SIZE, 5);
    ctx.fill();

    // obstacles
    ctx.fillStyle = COLOR_OBSTACLE;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      roundRect(o.x, o.y, o.w, o.h, 3);
      ctx.fill();
    }

    // score
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Score " + score, LOGICAL_W - 16, 30);
    ctx.fillText("Best " + best, LOGICAL_W - 16, 52);

    if (state === "ready") {
      centerText("Tap or press Space to start", LOGICAL_H / 2);
    }
    if (state === "over") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "700 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", LOGICAL_W / 2, LOGICAL_H / 2 - 16);
      ctx.font = "400 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText("Score " + score + "  ·  Tap or press Space to try again", LOGICAL_W / 2, LOGICAL_H / 2 + 16);
      ctx.textAlign = "right";
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function centerText(text, y) {
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, LOGICAL_W / 2, y);
    ctx.textAlign = "right";
  }

  draw();
})();
