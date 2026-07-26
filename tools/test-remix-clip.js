/* Does Remix Lab's WAV export clip? Drive the real app, capture the rendered
   buffer before encodeWav clamps it, and measure. */
const { chromium } = require("playwright-core");
const path = require("path");
const EXE = process.env.CHROMIUM || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const APP = process.env.APP_URL || "file:///home/user/Theme-Remix-Composer/index.html";
const SRC = process.argv[2];

const CASES = [
  { name: "defaults (untouched)",        p: {} },
  { name: "preset: Cavern Echo (1 click)", p: { echo:0.7, etime:0.28, efb:0.42, verb:0.5 } },
  { name: "preset: Slowed + Reverb",     p: { rate:0.82, verb:0.55, lp:0.93 } },
  { name: "worst case reachable in UI",  p: { vol:1.2, echo:1, verb:1, bright:12, drive:5, efb:0.85 } },
  { name: "quiet (vol 0.30) transparency", p: { vol:0.30 } },
  { name: "quiet (vol 0.15) transparency", p: { vol:0.15 } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on("dialog", async d => { try { await d.accept(); } catch(e){} });
  await page.addInitScript(() => {
    const orig = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = function(){
      return orig.call(this).then(b => { window.__buf = b; return b; });
    };
    // stop the download from actually firing
    window.__dlPatched = false;
  });
  await page.goto(APP, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.showView("view-remix"); window.downloadBlob = () => {}; });

  const input = await page.$("#view-remix input[type=file]");
  await input.setInputFiles(SRC);
  await page.waitForFunction(() => {
    const el = document.getElementById("r-info");
    return el && el.style.display === "block";
  }, undefined, { timeout: 120000 });
  console.log("loaded:", path.basename(SRC), "\n");
  console.log("case                             peak    clipped samples   % of file");
  console.log("-".repeat(74));

  const rows = [];
  for (const c of CASES){
    const r = await page.evaluate(async (P) => {
      // reset every slider to its default, then apply the case
      const D = { rate:1, vol:0.95, drive:0, crush:0, hp:0, lp:1, bright:0,
                  verb:0, echo:0, etime:0.28, efb:0.4, wob:0 };
      const set = { ...D, ...P };
      for (const k in set){ const el = document.getElementById("x-" + k); if (el) el.value = set[k]; }
      document.getElementById("x-rev").checked = !!P.rev;
      window.__buf = null;
      document.getElementById("r-export").click();
      const t0 = Date.now();
      while (!window.__buf && Date.now() - t0 < 180000) await new Promise(s => setTimeout(s, 200));
      const b = window.__buf; if (!b) return null;
      const n = b.length, L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
      let peak = 0, clip = 0;
      for (let i = 0; i < n; i++){
        const m = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        if (m > peak) peak = m;
        if (m >= 1.0) clip++;          // encodeWav clamps at exactly +-1
      }
      window.__buf = null;
      return { peak:+peak.toFixed(3), clip, n };
    }, c.p);
    if (!r){ console.log(c.name.padEnd(32), "RENDER FAILED"); continue; }
    rows.push({ ...c, ...r });
    console.log(c.name.padEnd(32),
      String(r.peak).padStart(6),
      String(r.clip).padStart(12),
      ("  " + (100 * r.clip / r.n).toFixed(3) + "%").padStart(12));
  }
  console.log("\nA sample at |x| >= 1.0 is hard-clamped by encodeWav and lost.");
  const bad = rows.filter(r => r.clip > 0);
  console.log(`cases that clip: ${bad.length}/${rows.length}`);
  await browser.close();
})().catch(e => { console.error("HARNESS", e.message); process.exit(1); });
