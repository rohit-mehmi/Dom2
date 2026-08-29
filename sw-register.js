/* ==========================================================================
   sw-register.js — add a <script src="sw-register.js" defer></script>
   tag near the end of the <body> on EVERY page of your site (or paste this
   directly inline if you'd rather not add another file request).

   Uses a RELATIVE path and scope on purpose: this makes the exact same
   file work correctly whether the site is hosted at a domain root
   (example.com/) or under a GitHub Pages project subpath
   (username.github.io/repo-name/) — an absolute "/sw.js" path only works
   in the first case and silently 404s in the second.

   Safe by design:
   - Does nothing if the browser doesn't support service workers (older
     browsers just keep working exactly as before — no error, no breakage).
   - Registered with a relative scope, so it covers every page under
     whichever folder this script itself was loaded from.
   - Does NOT force a reload when a new version activates — see the comment
     at the bottom if you want to add an update-available notice later.
   ========================================================================== */
(function () {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("sw.js", { scope: "./" })
      .catch(function (err) {
        // Registration failures (e.g. sw.js missing or a scope mismatch)
        // should never break the actual page — just log it.
        console.error("Service worker registration failed:", err);
      });
  });

  // Optional: if you later want to tell users "a new version is available,
  // refresh to update" instead of silently updating on next full reload,
  // listen for the controllerchange event here. Left out by default to
  // avoid any risk of unexpected reload loops.
})();
