/* ==========================================================================
   offline-game.js — "Pixel Breaker"
   A tiny original Breakout/Arkanoid-style game: the words "Oops, you are
   offline" are rendered once, then sampled pixel-by-pixel into a grid of
   breakable bricks. A paddle at the bottom keeps a ball alive; every hit
   knocks out one pixel of the text. Drop the ball past the paddle and it's
   game over. Clear every pixel and you win.

   Everything is drawn with canvas primitives (no image files, no font
   files beyond the system stack), so there is nothing extra for the
   service worker to fetch or cache.

   Controls:
   - Desktop: ArrowLeft/ArrowRight or A/D to move the paddle.
              Space / click to launch the ball (and to restart after a
              game over or a win).
   - Touch:   Drag anywhere on the canvas to move the paddle.
              Tap to launch (and to restart).
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
  var COLOR_BRICK = cssVar("--offline-fg", "#e8e8ec");
  var COLOR_BRICK_DIM = cssVar("--offline-fg-muted", "#9a9aa5");
  var COLOR_PADDLE = cssVar("--offline-accent", "#e8b94a");
  var COLOR_BALL = cssVar("--offline-accent", "#e8b94a");
  var COLOR_TEXT = cssVar("--offline-fg", "#e8e8ec");

  // ---------------------------------------------------------------------
  // Build the brick grid by rendering the message onto an offscreen
  // canvas, then sampling it in small blocks. Every block that lands on
  // an inked pixel becomes a live brick.
  // ---------------------------------------------------------------------
  var MESSAGE = "Oops, you are offline";
  var BLOCK = 5;
  var TEXT_AREA_H = 64;
  var TEXT_AREA_Y = 14;

  function buildBricks() {
    var off = document.createElement("canvas");
    off.width = LOGICAL_W;
    off.height = TEXT_AREA_H;
    var octx = off.getContext("2d");
    octx.clearRect(0, 0, off.width, off.height);
    octx.fillStyle = "#fff";
    octx.textBaseline = "top";

    var fontSize = 42;
    octx.font = "700 " + fontSize + "px 'Courier New', monospace";
    var textWidth = octx.measureText(MESSAGE).width;
    // Shrink to fit if the message would run past the canvas edges.
    while (textWidth > LOGICAL_W - 40 && fontSize > 16) {
      fontSize -= 2;
      octx.font = "700 " + fontSize + "px 'Courier New', monospace";
      textWidth = octx.measureText(MESSAGE).width;
    }
    var startX = (LOGICAL_W - textWidth) / 2;
    octx.fillText(MESSAGE, startX, 6);

    var img = octx.getImageData(0, 0, off.width, off.height).data;
    var cols = Math.floor(off.width / BLOCK);
    var rows = Math.floor(off.height / BLOCK);
    var bricks = [];

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = c * BLOCK + Math.floor(BLOCK / 2);
        var py = r * BLOCK + Math.floor(BLOCK / 2);
        var idx = (py * off.width + px) * 4;
        var alpha = img[idx + 3];
        if (alpha > 128) {
          bricks.push({
            x: c * BLOCK,
            y: TEXT_AREA_Y + r * BLOCK,
            w: BLOCK - 1,
            h: BLOCK - 1,
            alive: true,
          });
        }
      }
    }
    return bricks;
  }

  // ---- Game constants ----
  var PADDLE_W = 90;
  var PADDLE_H = 8;
  var PADDLE_Y = LOGICAL_H - 18;
  var PADDLE_SPEED = 0.62; // px per ms
  var BALL_RADIUS = 5;
  var BASE_BALL_SPEED = 0.30; // px per ms

  // ---- State ----
  var state = "ready"; // "ready" | "playing" | "over" | "won"
  var bricks, totalBricks, brokenCount, best, paddle, ball, lastTime;
  var keys = { left: false, right: false };
  var pointerActive = false;

  function loadBest() {
    try {
      return parseInt(localStorage.getItem("pixel-breaker-best") || "0", 10);
    } catch (e) {
      return 0;
    }
  }
  function saveBest(value) {
    try {
      localStorage.setItem("pixel-breaker-best", String(value));
    } catch (e) {}
  }

  function resetBallOnPaddle() {
    ball = {
      x: paddle.x + paddle.w / 2,
      y: PADDLE_Y - BALL_RADIUS - 1,
      vx: 0,
      vy: 0,
    };
  }

  function reset() {
    bricks = buildBricks();
    totalBricks = bricks.length;
    brokenCount = 0;
    paddle = { x: (LOGICAL_W - PADDLE_W) / 2, w: PADDLE_W };
    resetBallOnPaddle();
    lastTime = null;
  }

  best = loadBest();
  reset();

  function launch() {
    var angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25); // mostly upward
    ball.vx = Math.cos(angle) * BASE_BALL_SPEED * 16.6;
    ball.vy = Math.sin(angle) * BASE_BALL_SPEED * 16.6;
  }

  function startOrRestart() {
    if (state === "ready") {
      state = "playing";
      launch();
      requestAnimationFrame(loop);
    } else if (state === "over" || state === "won") {
      reset();
      state = "playing";
      launch();
      requestAnimationFrame(loop);
    }
  }

  // ---- Input: keyboard ----
  window.addEventListener("keydown", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      startOrRestart();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });

  // ---- Input: pointer (mouse + touch) ----
  function pointerToLogicalX(clientX) {
    var rect = canvas.getBoundingClientRect();
    var ratio = LOGICAL_W / rect.width;
    return (clientX - rect.left) * ratio;
  }

  canvas.addEventListener("pointerdown", function (e) {
    pointerActive = true;
    paddle.x = clampPaddleX(pointerToLogicalX(e.clientX) - paddle.w / 2);
    startOrRestart();
  });
  window.addEventListener("pointermove", function (e) {
    if (!pointerActive) return;
    paddle.x = clampPaddleX(pointerToLogicalX(e.clientX) - paddle.w / 2);
  });
  window.addEventListener("pointerup", function () {
    pointerActive = false;
  });

  function clampPaddleX(x) {
    return Math.max(0, Math.min(LOGICAL_W - paddle.w, x));
  }

  // ---- Main loop ----
  function loop(now) {
    if (state !== "playing") return;
    if (lastTime === null) lastTime = now;
    var dt = Math.min(now - lastTime, 32); // clamp to avoid huge jumps on tab-resume
    lastTime = now;

    // Paddle movement via keyboard (pointer drag sets position directly).
    if (keys.left) paddle.x -= PADDLE_SPEED * dt;
    if (keys.right) paddle.x += PADDLE_SPEED * dt;
    paddle.x = clampPaddleX(paddle.x);

    // Ball movement.
    ball.x += ball.vx * (dt / 16.6);
    ball.y += ball.vy * (dt / 16.6);

    // Walls.
    if (ball.x - BALL_RADIUS <= 0) {
      ball.x = BALL_RADIUS;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + BALL_RADIUS >= LOGICAL_W) {
      ball.x = LOGICAL_W - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - BALL_RADIUS <= 0) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
    }

    // Paddle collision (only when the ball is moving down into it).
    if (
      ball.vy > 0 &&
      ball.y + BALL_RADIUS >= PADDLE_Y &&
      ball.y + BALL_RADIUS <= PADDLE_Y + PADDLE_H + 6 &&
      ball.x >= paddle.x - BALL_RADIUS &&
      ball.x <= paddle.x + paddle.w + BALL_RADIUS
    ) {
      var hitPos = (ball.x - paddle.x) / paddle.w; // 0 (left edge) .. 1 (right edge)
      var speed = Math.hypot(ball.vx, ball.vy);
      var angle = -Math.PI / 2 + (hitPos - 0.5) * (Math.PI * 0.6);
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.y = PADDLE_Y - BALL_RADIUS - 1;
    }

    // Brick collision — break the single pixel the ball actually touches.
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (
        ball.x + BALL_RADIUS > b.x &&
        ball.x - BALL_RADIUS < b.x + b.w &&
        ball.y + BALL_RADIUS > b.y &&
        ball.y - BALL_RADIUS < b.y + b.h
      ) {
        b.alive = false;
        brokenCount++;
        ball.vy = -ball.vy;
        if (brokenCount >= totalBricks) {
          state = "won";
          if (brokenCount > best) {
            best = brokenCount;
            saveBest(best);
          }
        }
        break; // one brick per frame keeps things predictable
      }
    }

    // Ball dropped past the paddle — game over.
    if (ball.y - BALL_RADIUS > LOGICAL_H) {
      state = "over";
      if (brokenCount > best) {
        best = brokenCount;
        saveBest(best);
      }
    }

    draw();
    if (state === "playing") requestAnimationFrame(loop);
    else draw();
  }

  // ---- Rendering ----
  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Bricks (the message, one pixel-block at a time).
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      ctx.fillStyle = COLOR_BRICK;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    // Ground line (crossing this below the paddle ends the game).
    ctx.strokeStyle = COLOR_BRICK_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, LOGICAL_H - 1);
    ctx.lineTo(LOGICAL_W, LOGICAL_H - 1);
    ctx.stroke();

    // Paddle.
    ctx.fillStyle = COLOR_PADDLE;
    ctx.fillRect(paddle.x, PADDLE_Y, paddle.w, PADDLE_H);

    // Ball.
    ctx.beginPath();
    ctx.fillStyle = COLOR_BALL;
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // HUD.
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Pixels broken " + brokenCount + "/" + totalBricks, LOGICAL_W - 10, LOGICAL_H - 6);
    ctx.textAlign = "left";
    ctx.fillText("Best " + best, 10, LOGICAL_H - 6);

    if (state === "ready") {
      centerText("Tap, click, or press Space to launch", TEXT_AREA_Y + TEXT_AREA_H + 26);
    }
    if (state === "over" || state === "won") {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "700 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state === "won" ? "Signal Restored!" : "Ball Dropped", LOGICAL_W / 2, LOGICAL_H / 2 - 16);
      ctx.font = "400 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(
        brokenCount + "/" + totalBricks + " pixels broken · Tap or press Space to try again",
        LOGICAL_W / 2,
        LOGICAL_H / 2 + 16
      );
      ctx.textAlign = "left";
    }
  }

  function centerText(text, y) {
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = "500 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, LOGICAL_W / 2, y);
    ctx.textAlign = "left";
  }

  draw();
})();
