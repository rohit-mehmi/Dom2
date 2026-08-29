/* ==========================================================================
   offline-game.js — "Pixel Breaker"
   A fullscreen Breakout/Arkanoid-style game: the words "Oops, you are
   offline" are rendered once, then sampled pixel-by-pixel into a grid of
   breakable bricks. A paddle at the bottom keeps a ball alive; every pixel
   the ball actually touches breaks. Drop the ball past the paddle and the
   round ends with an explicit "You lost!" screen — nothing restarts until
   the player presses a button.

   Everything is drawn with canvas primitives (no image files, no font
   files beyond the system stack), so there is nothing extra for the
   service worker to fetch or cache.

   Controls:
   - Desktop: ArrowLeft/ArrowRight or A/D to move the paddle.
              Space / click launches the ball from a ready state.
   - Touch:   Drag anywhere on the canvas to move the paddle.
              Tap launches the ball from a ready state.
   - The floor "Try again" button and the game-over "Start again" button
     are the only ways to reset a round — the canvas itself never
     auto-restarts on tap once the ball has been lost or the text cleared.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("signal-runner");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var wrap = canvas.parentElement;

  var overlay = document.getElementById("game-over-screen");
  var overlayTitle = document.getElementById("game-over-title");
  var overlayBtn = document.getElementById("overlay-restart-btn");
  var floorBtn = document.getElementById("floor-try-again-btn");

  // ---- Sizing: the canvas fills its wrapper (the space between the
  // heading and the floor button). Logical resolution matches the CSS
  // size in pixels, scaled by devicePixelRatio for crisp rendering. ----
  var LOGICAL_W = 0;
  var LOGICAL_H = 0;

  function resize() {
    var rect = wrap.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    LOGICAL_W = Math.max(1, Math.round(rect.width));
    LOGICAL_H = Math.max(1, Math.round(rect.height));
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    canvas.style.width = LOGICAL_W + "px";
    canvas.style.height = LOGICAL_H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- Palette (reads from CSS custom properties if present, else falls
  // back to neutral defaults — makes it easy to match any site's theme). ----
  var styles = getComputedStyle(document.documentElement);
  function cssVar(name, fallback) {
    var v = styles.getPropertyValue(name).trim();
    return v || fallback;
  }
  var COLOR_BG = cssVar("--offline-bg", "#0e0e12");
  var COLOR_BRICK = cssVar("--offline-fg", "#e8e8ec");
  var COLOR_GROUND = cssVar("--offline-border", "#2a2a33");
  var COLOR_PADDLE = cssVar("--offline-accent", "#e8b94a");
  var COLOR_BALL = cssVar("--offline-accent", "#e8b94a");

  var MESSAGE = "Oops, you are offline";

  // ---------------------------------------------------------------------
  // Build the brick grid by rendering the message onto an offscreen
  // canvas at a size proportional to the play field, then sampling it in
  // blocks. Every block landing on an inked pixel becomes a live brick.
  // Returns { bricks, block, textAreaH } — block size is reused to scale
  // the ball so both stay visually proportional to each other.
  // ---------------------------------------------------------------------
  function buildBricks() {
    // Bigger text: aim for a font size around 9% of the play width,
    // clamped to sane bounds so it still fits on very narrow or very
    // wide screens.
    var fontSize = Math.round(Math.min(Math.max(LOGICAL_W * 0.09, 26), 110));
    var block = Math.max(4, Math.round(fontSize / 7));
    var textAreaH = Math.round(fontSize * 1.5);

    var off = document.createElement("canvas");
    off.width = LOGICAL_W;
    off.height = textAreaH;
    var octx = off.getContext("2d");
    octx.clearRect(0, 0, off.width, off.height);
    octx.fillStyle = "#fff";
    octx.textBaseline = "top";
    octx.font = "700 " + fontSize + "px 'Courier New', monospace";

    var textWidth = octx.measureText(MESSAGE).width;
    while (textWidth > LOGICAL_W - 24 && fontSize > 14) {
      fontSize -= 2;
      block = Math.max(4, Math.round(fontSize / 7));
      octx.font = "700 " + fontSize + "px 'Courier New', monospace";
      textWidth = octx.measureText(MESSAGE).width;
    }

    var startX = (LOGICAL_W - textWidth) / 2;
    var startY = Math.round((textAreaH - fontSize) / 2);
    octx.fillText(MESSAGE, startX, startY);

    var img = octx.getImageData(0, 0, off.width, off.height).data;
    var cols = Math.floor(off.width / block);
    var rows = Math.floor(off.height / block);
    var bricks = [];

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = c * block + Math.floor(block / 2);
        var py = r * block + Math.floor(block / 2);
        var idx = (py * off.width + px) * 4;
        var alpha = img[idx + 3];
        if (alpha > 128) {
          bricks.push({
            x: c * block,
            y: r * block,
            w: block - 1,
            h: block - 1,
            alive: true,
          });
        }
      }
    }
    return { bricks: bricks, block: block, textAreaH: textAreaH };
  }

  // ---- Layout & state ----
  var TEXT_TOP_MARGIN = 24;
  var bricks, totalBricks, brokenCount, block, textAreaH;
  var paddle, ball, paddleY, paddleW, paddleH, ballRadius;
  var state = "ready"; // "ready" | "playing" | "over" | "won"
  var lastTime = null;
  var keys = { left: false, right: false };
  var pointerActive = false;

  function layoutGame() {
    var built = buildBricks();
    bricks = built.bricks;
    totalBricks = bricks.length;
    block = built.block;
    textAreaH = built.textAreaH;
    brokenCount = 0;

    // Ball scales with the pixel size of the text, per design: bigger
    // text means a proportionally bigger ball.
    ballRadius = Math.max(5, Math.round(block * 1.1));

    paddleW = Math.max(70, Math.round(LOGICAL_W * 0.14));
    paddleH = Math.max(8, Math.round(block * 1.4));
    paddleY = LOGICAL_H - paddleH - 14;

    paddle = { x: (LOGICAL_W - paddleW) / 2 };
    resetBallOnPaddle();
  }

  function resetBallOnPaddle() {
    ball = {
      x: paddle.x + paddleW / 2,
      y: paddleY - ballRadius - 1,
      vx: 0,
      vy: 0,
    };
  }

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
  var best = loadBest();

  function showOverlay(title, buttonLabel) {
    overlayTitle.textContent = title;
    overlayBtn.textContent = buttonLabel;
    overlay.hidden = false;
  }
  function hideOverlay() {
    overlay.hidden = true;
  }

  function fullReset() {
    resize();
    layoutGame();
    state = "ready";
    lastTime = null;
    hideOverlay();
    draw();
  }

  function launch() {
    var angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25); // mostly upward
    var speed = Math.max(4.2, LOGICAL_W * 0.0055);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
  }

  function startFromReady() {
    if (state !== "ready") return;
    state = "playing";
    lastTime = null;
    launch();
    requestAnimationFrame(loop);
  }

  // ---- Explicit restart controls only — no tap-anywhere restart. ----
  floorBtn.addEventListener("click", fullReset);
  overlayBtn.addEventListener("click", fullReset);

  // ---- Input: keyboard ----
  window.addEventListener("keydown", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      startFromReady();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });

  // ---- Input: pointer (mouse + touch) — moves the paddle, and launches
  // the ball only while the round is in "ready" state. ----
  function pointerToLogicalX(clientX) {
    var rect = canvas.getBoundingClientRect();
    return clientX - rect.left;
  }
  function clampPaddleX(x) {
    return Math.max(0, Math.min(LOGICAL_W - paddleW, x));
  }

  canvas.addEventListener("pointerdown", function (e) {
    pointerActive = true;
    paddle.x = clampPaddleX(pointerToLogicalX(e.clientX) - paddleW / 2);
    startFromReady();
  });
  window.addEventListener("pointermove", function (e) {
    if (!pointerActive) return;
    paddle.x = clampPaddleX(pointerToLogicalX(e.clientX) - paddleW / 2);
  });
  window.addEventListener("pointerup", function () {
    pointerActive = false;
  });

  // ---- Resize handling: rebuilding the brick grid mid-round would
  // desync it from what's on screen, so a resize simply starts a fresh
  // round at the new size. Debounced to avoid thrashing during drags. ----
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fullReset, 150);
  });

  // ---- Main loop ----
  function loop(now) {
    if (state !== "playing") return;
    if (lastTime === null) lastTime = now;
    var dt = Math.min(now - lastTime, 32);
    lastTime = now;

    if (keys.left) paddle.x -= (LOGICAL_W * 0.0009) * dt;
    if (keys.right) paddle.x += (LOGICAL_W * 0.0009) * dt;
    paddle.x = clampPaddleX(paddle.x);

    ball.x += ball.vx * (dt / 16.6);
    ball.y += ball.vy * (dt / 16.6);

    // Walls.
    if (ball.x - ballRadius <= 0) {
      ball.x = ballRadius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ballRadius >= LOGICAL_W) {
      ball.x = LOGICAL_W - ballRadius;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ballRadius <= 0) {
      ball.y = ballRadius;
      ball.vy = Math.abs(ball.vy);
    }

    // Paddle collision.
    if (
      ball.vy > 0 &&
      ball.y + ballRadius >= paddleY &&
      ball.y + ballRadius <= paddleY + paddleH + ballRadius &&
      ball.x >= paddle.x - ballRadius &&
      ball.x <= paddle.x + paddleW + ballRadius
    ) {
      var hitPos = (ball.x - paddle.x) / paddleW; // 0 (left) .. 1 (right)
      var speed = Math.hypot(ball.vx, ball.vy);
      var angle = -Math.PI / 2 + (hitPos - 0.5) * (Math.PI * 0.6);
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.y = paddleY - ballRadius - 1;
    }

    // Brick collisions — break every pixel the ball is actually touching
    // this frame (not just the first one found), so a bigger ball can
    // knock out more than one pixel on the same pass. The bounce itself
    // only happens once per frame even if several bricks broke.
    var hitSomething = false;
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (
        ball.x + ballRadius > b.x &&
        ball.x - ballRadius < b.x + b.w &&
        ball.y + ballRadius > b.y &&
        ball.y - ballRadius < b.y + b.h
      ) {
        b.alive = false;
        brokenCount++;
        hitSomething = true;
      }
    }
    if (hitSomething) {
      ball.vy = -Math.abs(ball.vy);
      if (brokenCount >= totalBricks) {
        state = "won";
        if (brokenCount > best) {
          best = brokenCount;
          saveBest(best);
        }
        draw();
        showOverlay("You win!", "Play again");
        return;
      }
    }

    // Ball dropped past the paddle — round over.
    if (ball.y - ballRadius > LOGICAL_H) {
      state = "over";
      if (brokenCount > best) {
        best = brokenCount;
        saveBest(best);
      }
      draw();
      showOverlay("You lost!", "Start again");
      return;
    }

    draw();
    requestAnimationFrame(loop);
  }

  // ---- Rendering ----
  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Bricks (the message), offset down from the top by a fixed margin.
    ctx.fillStyle = COLOR_BRICK;
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      ctx.fillRect(b.x, TEXT_TOP_MARGIN + b.y, b.w, b.h);
    }

    // Ground line — crossing this below the paddle ends the round.
    ctx.strokeStyle = COLOR_GROUND;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, LOGICAL_H - 1);
    ctx.lineTo(LOGICAL_W, LOGICAL_H - 1);
    ctx.stroke();

    // Paddle.
    ctx.fillStyle = COLOR_PADDLE;
    ctx.fillRect(paddle.x, paddleY, paddleW, paddleH);

    // Ball.
    ctx.beginPath();
    ctx.fillStyle = COLOR_BALL;
    ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Boot ----
  resize();
  layoutGame();
  draw();
})();
