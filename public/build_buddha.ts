/**
 * build_buddha.ts
 *
 * Deno build tool that permanently injects the buddha glitch
 * transparency + freeze-frame controller into index.html.
 *
 * Usage:
 *   deno run --allow-read --allow-write build_buddha.ts
 *
 * What it does:
 *   1. Reads index.html
 *   2. Injects a <script> block before </body>
 *   3. Writes the result to index.html (or a separate output file)
 *
 * The injected script:
 *   - Oscillates video opacity between 0.8 and 0.2 (sine wave)
 *   - Freezes at 4.0s (@0.25), 9.5s (@0.55), 13.0s (@0.15)
 *   - Each freeze holds for 5 seconds at its own opacity
 *   - Clones z-indexed elements (watermarks, title, scroll indicator,
 *     trident) above and beneath with floating Z-depth parallax
 *   - Resumes and loops indefinitely
 */

const INPUT = "index.html";
const OUTPUT = "index.html"; // overwrite in place; change to "index.built.html" to be safe

const BUDDHA_SCRIPT = `
<script>
(function () {
  "use strict";

  function initBuddhaGlitch() {
    const video = document.querySelector("video.fullwidth-video");
    if (!video) return;

    // ── Configuration ──────────────────────────────────────────
    const CONFIG = {
      opacityMin: 0.2,
      opacityMax: 0.8,
      freezeDuration: 5000,       // ms
      freezePoints: [
        { time: 4.0,  opacity: 0.25 },
        { time: 9.5,  opacity: 0.55 },
        { time: 13.0, opacity: 0.15 },
      ],
      freezeTolerance: 0.15,      // seconds
    };

    // ── State ──────────────────────────────────────────────────
    let isFrozen = false;
    let currentFreezeOpacity = 0.4;
    let freezeTimer = null;
    let lastFreezeTime = -1;

    // ── Opacity breathing ──────────────────────────────────────
    function updateOpacity() {
      if (isFrozen) {
        const cur = parseFloat(video.style.opacity) || 0.5;
        video.style.opacity = cur + (currentFreezeOpacity - cur) * 0.1;
      } else {
        const t = Date.now() / 3000;
        const n = (Math.sin(t * Math.PI) + 1) / 2;
        video.style.opacity = CONFIG.opacityMin + n * (CONFIG.opacityMax - CONFIG.opacityMin);
      }
      requestAnimationFrame(updateOpacity);
    }

    // ── Freeze-frame logic ─────────────────────────────────────
    function onTimeUpdate() {
      if (isFrozen) return;
      const ct = video.currentTime;

      for (const fp of CONFIG.freezePoints) {
        if (Math.abs(ct - fp.time) < CONFIG.freezeTolerance && lastFreezeTime !== fp.time) {
          lastFreezeTime = fp.time;
          currentFreezeOpacity = fp.opacity;
          isFrozen = true;
          video.pause();

          freezeTimer = setTimeout(function () {
            isFrozen = false;
            video.play();
            setTimeout(function () {
              if (lastFreezeTime === fp.time) lastFreezeTime = -1;
            }, 2000);
          }, CONFIG.freezeDuration);

          break;
        }
      }
    }

    function onSeeked() {
      if (video.currentTime < 1) lastFreezeTime = -1;
    }

    video.style.transition = "opacity 0.3s ease";
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onSeeked);
    requestAnimationFrame(updateOpacity);
  }

  // ══════════════════════════════════════════════════════════════
  // Z-Layer Multiplication — floating forward / backward
  // Clones z-indexed elements above and beneath with varying
  // vertical offsets and Z-depths, creating a breathing parallax
  // ══════════════════════════════════════════════════════════════
  function initZLayerFloat() {
    var targets = [
      ".neon-watermark",
      ".bg-watermark",
      ".title-wrapper",
      ".scroll-indicator",
      ".trident-hover",
    ];

    var styleEl = document.createElement("style");
    styleEl.textContent =
      "@keyframes zFloatA {" +
        "0%   { transform: translateZ(0px)   translateY(0);     opacity: var(--zf-op); }" +
        "35%  { transform: translateZ(60px)  translateY(-18px); opacity: calc(var(--zf-op) * 0.5); }" +
        "65%  { transform: translateZ(25px)  translateY(-8px);  opacity: calc(var(--zf-op) * 0.7); }" +
        "100% { transform: translateZ(0px)   translateY(0);     opacity: var(--zf-op); }" +
      "}" +
      "@keyframes zFloatB {" +
        "0%   { transform: translateZ(0px)    translateY(0);    opacity: var(--zf-op); }" +
        "40%  { transform: translateZ(-45px)  translateY(22px); opacity: calc(var(--zf-op) * 0.4); }" +
        "70%  { transform: translateZ(-15px)  translateY(10px); opacity: calc(var(--zf-op) * 0.65); }" +
        "100% { transform: translateZ(0px)    translateY(0);    opacity: var(--zf-op); }" +
      "}" +
      "@keyframes zFloatC {" +
        "0%   { transform: translateZ(0px)   translateY(0);     opacity: var(--zf-op); }" +
        "30%  { transform: translateZ(80px)  translateY(-30px); opacity: calc(var(--zf-op) * 0.3); }" +
        "60%  { transform: translateZ(35px)  translateY(-12px); opacity: calc(var(--zf-op) * 0.6); }" +
        "100% { transform: translateZ(0px)   translateY(0);     opacity: var(--zf-op); }" +
      "}" +
      ".z-float-clone { will-change: transform, opacity; }";
    document.head.appendChild(styleEl);

    var animations = ["zFloatA", "zFloatB", "zFloatC"];
    // Vertical offsets (px) and base opacities for each clone layer
    var layers = [
      { yOff: -359, opacity: 0.15, anim: 2 },  // above — far
      { yOff: -153, opacity: 0.30, anim: 0 },  // above — close
      { yOff:  295, opacity: 0.25, anim: 1 },  // below — close
      { yOff:  576, opacity: 0.10, anim: 2 },  // below — far
    ];

    targets.forEach(function (sel) {
      var els = document.querySelectorAll(sel);
      els.forEach(function (el) {
        var parent = el.parentElement;
        if (!parent) return;

        parent.style.perspective = "800px";
        parent.style.perspectiveOrigin = "center center";

        layers.forEach(function (layer) {
          var clone = el.cloneNode(true);
          clone.setAttribute("aria-hidden", "true");
          clone.style.position = "absolute";
          clone.style.top = (el.offsetTop + layer.yOff) + "px";
          clone.style.left = el.offsetLeft + "px";
          clone.style.width = el.offsetWidth + "px";
          clone.style.pointerEvents = "none";
          clone.style.setProperty("--zf-op", String(layer.opacity));
          clone.style.opacity = String(layer.opacity);
          var dur = 8 + Math.random() * 7;
          clone.style.animation = animations[layer.anim] + " " + dur + "s ease-in-out infinite";
          clone.style.animationDelay = (Math.random() * 5) + "s";
          clone.classList.add("z-float-clone");
          parent.appendChild(clone);
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initBuddhaGlitch();
      initZLayerFloat();
    });
  } else {
    initBuddhaGlitch();
    initZLayerFloat();
  }
})();
</script>`;

// ── Build step ───────────────────────────────────────────────────

async function build() {
  console.log(`Reading ${INPUT}...`);
  const html = await Deno.readTextFile(INPUT);

  // Check if script is already injected (idempotent)
  if (html.includes("initBuddhaGlitch")) {
    console.log("⚠️  Script already present in HTML. Skipping injection.");
    Deno.exit(0);
  }

  // Inject before </body>
  const marker = "</body>";
  const idx = html.lastIndexOf(marker);

  if (idx === -1) {
    console.error("❌ Could not find </body> tag in", INPUT);
    Deno.exit(1);
  }

  const modified = html.slice(0, idx) + BUDDHA_SCRIPT + "\n" + html.slice(idx);

  console.log(`Writing ${OUTPUT}...`);
  await Deno.writeTextFile(OUTPUT, modified);

  console.log("✅ Buddha glitch controller injected permanently.");
  console.log("   Opacity: 0.8 ↔ 0.2 (sine wave breathing)");
  console.log("   Freeze points: 4.0s @0.25, 9.5s @0.55, 13.0s @0.15");
  console.log("   Z-layer float: 4 clone layers per element (±30px, ±55–60px depth)");
}

build();
