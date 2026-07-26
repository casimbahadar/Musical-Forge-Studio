/* Resilient MP3 renderer: no download event (that was the failure point),
   resumes by skipping existing files, and rebuilds the page after any error.
   usage: node render-mp3.js <songsDir> <indexFile> <outDir> <start> <end> <tag> */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const EXE = process.env.CHROMIUM || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const S = process.env.LAMEJS_DIR || __dirname;   // must contain node_modules/lamejs
const FILE = process.env.APP_URL || ("file://" + require("path").resolve(__dirname, "..", "index.html"));

const SONGS = process.argv[2], INDEXF = process.argv[3], OUT = process.argv[4];
const START = +process.argv[5], END = +process.argv[6], TAG = process.argv[7] || "x";
fs.mkdirSync(OUT, { recursive: true });
const LIST = JSON.parse(fs.readFileSync(INDEXF, "utf8"));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ENCODE = () => {
  const buf = window.__buf;
  const n = buf.length, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const enc = new lamejs.Mp3Encoder(2, buf.sampleRate, 128);
  const BL = 1152, out = []; const li = new Int16Array(BL), ri = new Int16Array(BL);
  let peak = 0, clip = 0, sq = 0;
  for (let p = 0; p < n; p += BL){
    const len = Math.min(BL, n - p);
    for (let k = 0; k < len; k++){
      let a = L[p+k], b = R[p+k];
      sq += (a*a + b*b) / 2;
      const m = Math.max(Math.abs(a), Math.abs(b)); if (m > peak) peak = m; if (m >= 0.985) clip++;
      a = a < -1 ? -1 : a > 1 ? 1 : a; b = b < -1 ? -1 : b > 1 ? 1 : b;
      li[k] = a < 0 ? a * 0x8000 : a * 0x7FFF; ri[k] = b < 0 ? b * 0x8000 : b * 0x7FFF;
    }
    const sub = len === BL ? enc.encodeBuffer(li, ri) : enc.encodeBuffer(li.subarray(0,len), ri.subarray(0,len));
    if (sub.length) out.push(sub);
  }
  const fin = enc.flush(); if (fin.length) out.push(fin);
  let total = 0; out.forEach(u => total += u.length);
  const all = new Uint8Array(total); let o = 0; out.forEach(u => { all.set(u, o); o += u.length; });
  let s = ""; const CH = 0x8000;
  for (let p = 0; p < all.length; p += CH) s += String.fromCharCode.apply(null, all.subarray(p, p + CH));
  const dur = +(n / buf.sampleRate).toFixed(1);
  const rms = Math.sqrt(sq / n);
  window.__buf = null;
  return { b64: btoa(s), dur, peak: +peak.toFixed(3), clip,
    rms: +rms.toFixed(4), lufs: +(20 * Math.log10(rms || 1e-9)).toFixed(1) };
};

async function newPage(browser){
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on("dialog", async d => { try { await d.accept(); } catch(e){} });
  await page.addInitScript(() => {
    const orig = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = function(){
      return orig.call(this).then(b => { window.__buf = b; return b; });
    };
  });
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: S + "/node_modules/lamejs/lame.min.js" });
  await page.evaluate(() => window.showView("view-seq"));
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  let page = await newPage(browser);
  const done = [];
  for (let i = START; i < END && i < LIST.length; i++){
    const meta = LIST[i];
    const sid = meta.songId || ("SQG" + String(meta.idx).padStart(3, "0"));
    const base = sid + "_" + slug(meta.title || meta.style);
    const dest = path.join(OUT, base + ".mp3");
    if (fs.existsSync(dest)){ console.log(`${sid} skip (exists)`); continue; }
    const song = JSON.parse(fs.readFileSync(path.join(SONGS, sid + ".json"), "utf8"));
    const t0 = Date.now();
    try {
      await page.evaluate(async (sg) => {
        window.__buf = null;
        await window.SEQ.importSong(sg);
        const loads = Array.from(document.querySelectorAll("#seq-song-list button")).filter(b => b.textContent === "Load");
        loads[loads.length - 1].click();
      }, song);
      await page.waitForTimeout(200);
      await page.click("#seq-export");
      await page.waitForFunction(() => !!window.__buf, undefined, { timeout: 2100000 });
      const r = await page.evaluate(ENCODE);
      fs.writeFileSync(dest, Buffer.from(r.b64, "base64"));
      done.push({ sid, title: meta.title, dur: r.dur, peak: r.peak, clip: r.clip, rms: r.rms, lufs: r.lufs, mb: +(fs.statSync(dest).size/1048576).toFixed(2) });
      console.log(`${sid} ${String(meta.title||"").slice(0,26).padEnd(27)} ${r.dur}s peak ${r.peak} rms ${r.rms} ${r.lufs}dB clip ${r.clip} ${(fs.statSync(dest).size/1048576).toFixed(2)}MB ${((Date.now()-t0)/1000).toFixed(0)}s`);
    } catch (e){
      console.log(`${sid} FAILED (${e.message.slice(0,50)}) — rebuilding page`);
      try { await page.close(); } catch(_){}
      try { page = await newPage(browser); } catch(_){ break; }
    }
  }
  fs.writeFileSync(path.join(OUT, `_done_${TAG}.json`), JSON.stringify(done, null, 1));
  console.log(`[${TAG}] finished, ${done.length} rendered`);
  await browser.close();
})().catch(e => { console.error("HARNESS", e.message); process.exit(1); });
