(function () {
  "use strict";

  var EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

  /* ---------------------------------------------------------------------
   * 1. Nav — solid/blurred background once the page is scrolled
   * ------------------------------------------------------------------- */
  var header = document.getElementById("site-header");
  var SCROLLED_CLASSES = ["border-border/70", "bg-[rgba(10,10,12,0.8)]", "backdrop-blur-xl"];
  var TOP_CLASSES = ["border-transparent", "bg-transparent"];

  function updateHeader() {
    if (!header) return;
    var scrolled = window.scrollY > 80;
    header.classList.remove.apply(header.classList, SCROLLED_CLASSES.concat(TOP_CLASSES));
    header.classList.add.apply(header.classList, scrolled ? SCROLLED_CLASSES : TOP_CLASSES);
  }
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  /* ---------------------------------------------------------------------
   * 2. Desktop "Services" dropdown — open on hover/focus
   * ------------------------------------------------------------------- */
  var servicesDropdown = document.getElementById("services-dropdown");
  var servicesPanel = document.getElementById("services-panel");
  if (servicesDropdown && servicesPanel) {
    var openPanel = function () {
      servicesPanel.classList.remove("pointer-events-none", "translate-y-2", "opacity-0");
      servicesPanel.classList.add("pointer-events-auto", "translate-y-0", "opacity-100");
    };
    var closePanel = function () {
      servicesPanel.classList.add("pointer-events-none", "translate-y-2", "opacity-0");
      servicesPanel.classList.remove("pointer-events-auto", "translate-y-0", "opacity-100");
    };
    servicesDropdown.addEventListener("mouseenter", openPanel);
    servicesDropdown.addEventListener("mouseleave", closePanel);
    servicesDropdown.addEventListener("focusin", openPanel);
    servicesDropdown.addEventListener("focusout", function (e) {
      if (!servicesDropdown.contains(e.relatedTarget)) closePanel();
    });
  }

  /* ---------------------------------------------------------------------
   * 3. Mobile menu — open / close + its own Services accordion
   * ------------------------------------------------------------------- */
  var mobileBtn = document.getElementById("mobile-menu-btn");
  var mobileOverlay = document.getElementById("mobile-overlay");
  var mobileClose = document.getElementById("mobile-close-btn");
  var mobileAccBtn = document.getElementById("mobile-acc-btn");
  var mobileAccPanel = document.getElementById("mobile-acc-panel");
  var mobileAccIcon = document.getElementById("mobile-acc-icon");

  function openMobile() {
    if (!mobileOverlay) return;
    mobileOverlay.classList.remove("-translate-y-full");
    mobileOverlay.classList.add("translate-y-0");
    document.body.style.overflow = "hidden";
  }
  function closeMobile() {
    if (!mobileOverlay) return;
    mobileOverlay.classList.add("-translate-y-full");
    mobileOverlay.classList.remove("translate-y-0");
    document.body.style.overflow = "";
  }
  if (mobileBtn) mobileBtn.addEventListener("click", openMobile);
  if (mobileClose) mobileClose.addEventListener("click", closeMobile);
  // Close mobile menu when a nav/anchor link inside it is tapped
  if (mobileOverlay) {
    mobileOverlay.querySelectorAll("a[href]").forEach(function (a) {
      a.addEventListener("click", closeMobile);
    });
  }

  var mobileAccOpen = false;
  if (mobileAccBtn && mobileAccPanel) {
    mobileAccBtn.addEventListener("click", function () {
      mobileAccOpen = !mobileAccOpen;
      mobileAccPanel.style.gridTemplateRows = mobileAccOpen ? "1fr" : "0fr";
      mobileAccPanel.style.opacity = mobileAccOpen ? "1" : "0";
      if (mobileAccIcon) {
        mobileAccIcon.classList.toggle("rotate-45", mobileAccOpen);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * 4. Hero — draw-in line + stat count-up (runs once on load, like the
   *    original mount-triggered animation)
   * ------------------------------------------------------------------- */
  window.addEventListener("load", function () {
    setTimeout(function () {
      var path = document.getElementById("hero-draw-path");
      if (path) path.style.strokeDashoffset = "0";
    }, 250);
  });

  function animateCount(el) {
    if (!el || el.dataset.done) return;
    el.dataset.done = "1";
    var target = parseFloat(el.dataset.target || "0");
    var decimals = parseInt(el.dataset.decimals || "0", 10);
    var suffix = el.dataset.suffix || "";
    var duration = 1600;
    var start = null;

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      var value = target * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
  }

  ["stat-0", "stat-1", "stat-2"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) animateCount(el);
  });

  /* ---------------------------------------------------------------------
   * 5. Generic scroll-reveal ("rise" -> "rise-in") for simple groups
   * ------------------------------------------------------------------- */
  function revealChildrenOnce(container) {
    if (!container) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            container.querySelectorAll(".rise").forEach(function (el) {
              el.classList.add("rise-in");
            });
            if (container.classList.contains("rise")) container.classList.add("rise-in");
            io.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(container);
  }

  revealChildrenOnce(document.getElementById("services-reveal"));
  revealChildrenOnce(document.getElementById("faq-reveal"));

  /* ---------------------------------------------------------------------
   * 6. Process — reveal steps + draw the connecting line
   * ------------------------------------------------------------------- */
  (function () {
    var container = document.getElementById("process-reveal");
    if (!container) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          container.querySelectorAll(".rise").forEach(function (el) {
            el.classList.add("rise-in");
          });
          var line = document.getElementById("process-draw-line");
          if (line) line.style.strokeDashoffset = "0";
          var bar = document.getElementById("process-mobile-bar");
          if (bar) bar.style.transform = "scaleY(1)";
          io.disconnect();
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(container);
  })();

  /* ---------------------------------------------------------------------
   * 7. Results — reveal + autoplaying testimonial carousel
   * ------------------------------------------------------------------- */
  (function () {
    var container = document.getElementById("results-reveal");
    var track = document.getElementById("results-track");
    if (!container || !track) return;

    var slides = Array.prototype.slice.call(container.querySelectorAll(".results-slide"));
    var dots = Array.prototype.slice.call(document.querySelectorAll(".results-dot"));
    var count = slides.length;
    var i = 0;
    var paused = false;
    var timer = null;
    var started = false;

    function render() {
      track.style.transform = "translateX(calc(" + -i * 100 + "% + 0px))";
      slides.forEach(function (slide, idx) {
        slide.classList.remove("opacity-100", "opacity-30");
        slide.classList.add(idx === i ? "opacity-100" : "opacity-30");
      });
      dots.forEach(function (dot, idx) {
        dot.classList.remove("w-7", "bg-accent", "w-1.5", "bg-muted-foreground/40", "hover:bg-accent/60");
        if (idx === i) {
          dot.classList.add("w-7", "bg-accent");
        } else {
          dot.classList.add("w-1.5", "bg-muted-foreground/40", "hover:bg-accent/60");
        }
      });
    }

    function goTo(idx) {
      i = ((idx % count) + count) % count;
      render();
    }

    function restartTimer() {
      if (timer) clearInterval(timer);
      if (paused || !started) return;
      timer = setInterval(function () {
        goTo(i + 1);
      }, 6000);
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        goTo(parseInt(dot.dataset.idx, 10));
        restartTimer();
      });
    });

    var prevBtn = document.getElementById("results-prev");
    var nextBtn = document.getElementById("results-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { goTo(i - 1); restartTimer(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goTo(i + 1); restartTimer(); });

    container.addEventListener("mouseenter", function () { paused = true; restartTimer(); });
    container.addEventListener("mouseleave", function () { paused = false; restartTimer(); });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          container.classList.add("rise-in");
          started = true;
          restartTimer();
          io.disconnect();
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(container);
  })();

  /* ---------------------------------------------------------------------
   * 8. FAQ accordion — one item open at a time (first item open by default)
   * ------------------------------------------------------------------- */
  (function () {
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".faq-btn"));
    var openIdx = 0; // matches original default (first question open)

    function setState(idx, isOpen) {
      var panel = document.querySelector('.faq-panel[data-idx="' + idx + '"]');
      var icon = document.querySelector('.faq-icon[data-idx="' + idx + '"]');
      var btn = document.querySelector('.faq-btn[data-idx="' + idx + '"]');
      if (panel) {
        panel.style.gridTemplateRows = isOpen ? "1fr" : "0fr";
        panel.style.opacity = isOpen ? "1" : "0";
      }
      if (icon) icon.classList.toggle("rotate-[135deg]", isOpen);
      if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.dataset.idx, 10);
        var wasOpen = idx === openIdx;
        if (openIdx !== null) setState(openIdx, false);
        if (wasOpen) {
          openIdx = null;
        } else {
          openIdx = idx;
          setState(idx, true);
        }
      });
    });
  })();

  /* ---------------------------------------------------------------------
   * 9. Final CTA — reveal + background shift (matches original mount ref)
   * ------------------------------------------------------------------- */
  (function () {
    var section = document.getElementById("contact");
    var inner = document.getElementById("finalcta-inner");
    if (!section || !inner) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          section.style.backgroundColor = "var(--surface)";
          inner.classList.add("rise-in");
          io.disconnect();
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(section);
  })();

  /* ---------------------------------------------------------------------
   * 10. Light / dark theme toggle (floating button, bottom-right)
   * ------------------------------------------------------------------- */
  (function () {
    var root = document.documentElement;
    var btn = document.getElementById("theme-toggle");
    var logos = document.querySelectorAll('img[alt="Web Dominators"]');

    function applyTheme(theme) {
      if (theme === "light") {
        root.setAttribute("data-theme", "light");
      } else {
        root.removeAttribute("data-theme");
      }
      logos.forEach(function (img) {
        img.src = theme === "light" ? "logo-light.png" : "logo.png";
      });
    }

    var stored = null;
    try {
      stored = localStorage.getItem("wd-theme");
    } catch (e) {}
    applyTheme(stored === "light" ? "light" : "dark");

    if (btn) {
      btn.addEventListener("click", function () {
        var isLight = root.getAttribute("data-theme") === "light";
        var next = isLight ? "dark" : "light";
        applyTheme(next);
        try {
          localStorage.setItem("wd-theme", next);
        } catch (e) {}
      });
    }
  })();
})();
