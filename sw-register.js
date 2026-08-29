/* ==========================================================================
   sw-register.js — add a <script src="/js/sw-register.js" defer></script>
   tag near the end of the <body> on EVERY page of your site (or paste this
   directly inline if you'd rather not add another file request).

   Safe by design:
   - Does nothing if the browser doesn't support service workers (older
     browsers just keep working exactly as before — no error, no breakage).
   - Registered with scope "/", so it covers the entire domain regardless of
     which page happens to load it first.
   - Does NOT force a reload when a new version activates — see the comment
     at the bottom if you want to add an update-available notice later.
   ========================================================================== */
(function () {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
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
