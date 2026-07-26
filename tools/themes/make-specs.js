/* Rebuild the 26 A/B theme specs from themes.json, then improve them.

   themes.json is the starting point, not the ceiling: root, mode, bpm, prog,
   lead voice and seed are kept exactly (they are the theme's identity), but
   arrangement decisions are ours to make better. Two classes of fix:

   1. Sustain rule (mechanical, applies to every theme): a "whole"-note bass
      line on a decaying voice is inaudible for most of each bar. Any theme
      whose bass style holds must use a voice whose envelope holds.
   2. Per-theme overrides (judgement, listed in OVERRIDES with a reason).  */
const fs = require("fs"), path = require("path");

// usage: node make-specs.js <themes.json> [baseSpecsDir] [outDir]
const THEMES = process.argv[2] || "./themes.json";
const OLD = process.argv[3] || "./specs-base", OUT = process.argv[4] || "./specs";
const KEYS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MODE = { major:"major", minor:"minor", dorian:"dorian", lydian:"lydian",
  phrygian:"phrygian", mixo:"mixolydian", harmMinor:"harmonic" };
const DRUMS = { drive:{A:"straight8",B:"drive16"}, light:{A:"backbeat",B:"backbeat"},
  sparse:{A:"sparseHat",B:"sparseHat"}, double:{A:"doubleTime",B:"doubleTime"},
  none:{A:"none",B:"none"} };
const DENS = { low:0.42, med:0.65, high:0.85 };

const SUSTAINING = new Set(["organ","strings","choir","ooh","synthbass","sawlead",
  "square","fm","accordion","brass"]);
// preferred sustaining bass when the spec'd voice cannot hold a whole note
const HOLDBASS = { A:"organ", B:"synthbass" };

const ALTPAD = ["strings","choir","ooh","organ"];
const ALTARP = ["celesta","harp","musicbox","marimba"];
const ALTCTR = ["brass","epiano","pizz","bell"];

/* Deliberate departures from themes.json, each with a stated reason. */
const OVERRIDES = {
  // The theme the user flagged. It was the quietest of the 26 in the original
  // renders (peak 0.734 where everything else clipped past 1.0) and the cause
  // was structural: marimba bass on held notes + harp lead + no drums meant
  // nothing in the mix sustained. Give it a low organ drone to sit on, a
  // celesta shimmer for motion in place of the drums it deliberately lacks,
  // let the harp ring, and trim it shorter so it does not outstay its idea.
  A15: { bass:"organ", pad:"choir", counter:"ooh", arp:"celesta",
         dens:0.52, legato:1.6, mix:1.28, targetSec:175 },
  // Ice route: pizzicato cannot hold a whole note. Low strings can, and suit it.
  A6:  { bass:"strings", legato:1.45, mix:1.32 },
  // Forgotten zone: organ bass already holds; just let it breathe and lift it.
  A12: { legato:1.5, mix:1.22 },
  // Poison route: sustaining bass is right, but it needs presence at 84bpm.
  A7:  { legato:1.4, mix:1.2 },
  // Coastal: low density with a light kit sits under the rest of the set.
  A3:  { legato:1.3, mix:1.12 },
  // Forgotten Lumori encounter: pizz bass on held notes in a 126bpm battle.
  B11: { bass:"synthbass" },
  // A1 and A13 are the only two themes in themes.json that share a seed (101),
  // and they also share prog, target length, density, bass style and drum
  // family — "NG+ overworld variant" is meant to BE the overworld theme, soured.
  // The only thing breaking that mirror was my own res rule handing them
  // different grids, which made the motif generator produce unrelated tunes.
  // Same res => same motifs => A13 is literally A1 in A minor with strings.
  // targetSec 180 at 112bpm lands on 84 bars — the same bar count A1 gets at
  // 108bpm — so the two share a section plan and line up bar for bar.
  A13: { res:2, targetSec:180 },
};

fs.mkdirSync(OUT, { recursive: true });
const themes = JSON.parse(fs.readFileSync(THEMES, "utf8")).filter(t => t.cat==="A" || t.cat==="B");
const rows = [];
let fixed = 0;

for (const t of themes){
  const old = JSON.parse(fs.readFileSync(path.join(OLD, t.id + ".json"), "utf8"));
  const ov = OVERRIDES[t.id] || {};
  const lead = t.lead;                       // identity — never overridden
  const used = new Set([lead]);
  const pick = (want, alts) => {
    const c = want && !used.has(want) ? want : alts.find(a => !used.has(a));
    if (c) used.add(c);
    return c || null;
  };

  let bass = pick(ov.bass || old.bass, [HOLDBASS[t.cat], "synthbass", "organ", "guitar"]);
  /* Sustain rule. The first version of this only checked "whole"-note bass,
     which was too narrow: A2, A10 and A14 use a walking bass and slipped past
     it, and they came out as the three quietest themes of the 26 — in exactly
     the order their decay predicted, with A2 at -25.3 dB, worse than A15 ever
     was. What actually matters is whether ANYTHING in the mix holds. The lead
     is the theme's identity and can never change, so if the lead decays the
     bass has to carry the sustain. */
  const leadDecays = !SUSTAINING.has(lead);
  const needsHold = t.bass === "whole" || leadDecays;
  if (needsHold && !SUSTAINING.has(bass)){
    const repl = [ov.bass, HOLDBASS[t.cat], "organ", "strings", "synthbass"]
      .find(v => v && SUSTAINING.has(v) && !used.has(v));
    const why = t.bass === "whole" ? `cannot hold a ${t.bass} note` : `decays under a decaying lead (${lead})`;
    console.log(`  fix ${t.id}: bass ${bass} ${why} -> ${repl}`);
    used.delete(bass); bass = repl; used.add(bass); fixed++;
  }
  const pad = pick(ov.pad || old.pad, ALTPAD);
  const arp = (t.arp || ov.arp) ? pick(ov.arp || old.arp, ALTARP) : null;
  const counter = pick(ov.counter || old.counter, ALTCTR);

  const dens = ov.dens != null ? ov.dens : (DENS[t.dens] == null ? 0.65 : DENS[t.dens]);
  const drums = DRUMS[t.drums][t.cat];
  const targetSec = Math.max(95, Math.min(235, ov.targetSec || old.targetSec || 180));
  // every piece gets a shape; busier pieces earn a breakdown before the climax
  const arc = dens >= 0.6
    ? ["intro","A","B","A","break","C","climax","outro"]
    : ["intro","A","B","A","C","climax","outro"];

  const spec = {
    id: t.id, title: old.title,
    key: KEYS[((t.root % 12) + 12) % 12],
    scale: MODE[t.mode] || "minor",
    bpm: t.bpm,
    res: ov.res != null ? ov.res : (t.bpm <= 90 ? 4 : (old.res || 2)),
    targetSec, prog: t.prog.slice(),
    lead, bass, pad,
    bassStyle: t.bass, drums,
    reg: t.root + 12, dens,
    mix: ov.mix == null ? 1 : ov.mix,
    legato: ov.legato == null ? 1 : ov.legato,
    seed: t.seed, arc
  };
  if (arp) spec.arp = arp;
  if (counter) spec.counter = counter;

  fs.writeFileSync(path.join(OUT, t.id + ".json"), JSON.stringify(spec, null, 1));
  rows.push({ id:t.id, key:spec.key, scale:spec.scale, bpm:spec.bpm, lead, bass,
    bassStyle:spec.bassStyle, pad, arp:arp||"-", counter:counter||"-", drums,
    dens, mix:spec.mix, legato:spec.legato, targetSec });
  console.log(`${t.id.padEnd(4)} ${(spec.key+" "+spec.scale).padEnd(15)} ${String(spec.bpm).padStart(3)}bpm ` +
    `lead ${lead.padEnd(9)} bass ${bass.padEnd(9)}(${spec.bassStyle.padEnd(5)}) pad ${String(pad).padEnd(8)} ` +
    `arp ${String(arp||"-").padEnd(9)} ${drums.padEnd(10)} d${dens} mix${spec.mix} leg${spec.legato}`);
}
fs.writeFileSync(path.join(OUT, "_specs.json"), JSON.stringify(rows, null, 1));
console.log(`\nwrote ${rows.length} specs | sustain fixes applied: ${fixed} | overrides: ${Object.keys(OVERRIDES).length}`);
