/* ============================================================================
   Generate N varied Forge Sequencer songs (1:30–4:00 each).
   Deterministic: seed -> identical song. Output = app-native song JSON.
   Variety axes: style/atmosphere, instrument palette, scale/mode, key, tempo,
   grid resolution (quarter..sixteenth), note lengths, octave register,
   texture (melody/counter/pad/arp/bass/drums), song structure, drum family.
   ============================================================================ */
const fs = require("fs");
const path = require("path");
const NAMES = require("./names.js");   // 100 unique titles

/* ---------- deterministic PRNG (mulberry32) ---------- */
function rng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const chance = (r, p) => r() < p;

/* ---------- scales (semitones from root) ---------- */
const SCALES = {
  major:        [0,2,4,5,7,9,11],
  minor:        [0,2,3,5,7,8,10],
  harmonic:     [0,2,3,5,7,8,11],
  dorian:       [0,2,3,5,7,9,10],
  phrygian:     [0,1,3,5,7,8,10],
  phrygdom:     [0,1,4,5,7,8,10],   // phrygian dominant — desert/exotic
  lydian:       [0,2,4,6,7,9,11],
  mixolydian:   [0,2,4,5,7,9,10],
  pentaMaj:     [0,2,4,7,9],
  pentaMin:     [0,3,5,7,10],
  blues:        [0,3,5,6,7,10],
  wholeTone:    [0,2,4,6,8,10],
};
const DRUMS = ["kick","snare","hat","hat_o","clap","tom"];

/* ---------- chord progressions as scale degrees (0-indexed) ---------- */
const PROGS = {
  heroic:   [[0,4,5,3],[0,3,4,4],[0,5,3,4]],
  sad:      [[0,5,3,4],[0,3,5,4],[5,3,0,4]],
  tense:    [[0,1,0,4],[0,4,1,4],[0,0,1,5]],
  calm:     [[0,3,4,0],[0,4,3,0],[3,4,0,0]],
  modal:    [[0,6,3,0],[0,3,6,4],[0,6,4,3]],
  loop2:    [[0,3],[0,4],[0,5],[3,4]],
  wander:   [[0,2,4,6],[0,5,1,4],[0,4,6,3]],
};

/* ---------- drum pattern families (positions are in 16ths of a bar) ---------- */
function drumPattern(kind, r){
  // returns fn(barIdx) -> [{d, s16, v}]
  const F = {
    none: () => [],
    heartbeat: () => [{d:"kick",s16:0,v:.9},{d:"kick",s16:10,v:.6}],
    backbeat: () => [{d:"kick",s16:0,v:1},{d:"snare",s16:8,v:.8},{d:"hat",s16:4,v:.45},{d:"hat",s16:12,v:.45}],
    straight8: () => {
      const o=[{d:"kick",s16:0,v:1},{d:"snare",s16:8,v:.8}];
      for(let s=0;s<16;s+=2) o.push({d:"hat",s16:s,v:s%4?0.32:0.5});
      return o;
    },
    drive16: () => {
      const o=[{d:"kick",s16:0,v:1},{d:"kick",s16:6,v:.7},{d:"snare",s16:8,v:.85},{d:"clap",s16:8,v:.5}];
      for(let s=0;s<16;s++) o.push({d:"hat",s16:s,v:s%2?0.22:0.4});
      return o;
    },
    doubleTime: () => {
      const o=[];
      for(let s=0;s<16;s+=4) o.push({d:"kick",s16:s,v:1});
      o.push({d:"snare",s16:4,v:.85},{d:"snare",s16:12,v:.85});
      for(let s=2;s<16;s+=4) o.push({d:"hat_o",s16:s,v:.3});
      return o;
    },
    shuffle: () => [{d:"kick",s16:0,v:.95},{d:"hat",s16:3,v:.35},{d:"snare",s16:8,v:.75},{d:"hat",s16:11,v:.35},{d:"hat",s16:14,v:.3}],
    tribal: () => [{d:"tom",s16:0,v:.85},{d:"tom",s16:6,v:.6},{d:"tom",s16:10,v:.7},{d:"kick",s16:0,v:.8},{d:"snare",s16:12,v:.5}],
    sparseHat: () => [{d:"hat",s16:0,v:.35},{d:"hat",s16:8,v:.3}],
    marchy: () => [{d:"kick",s16:0,v:.95},{d:"kick",s16:8,v:.8},{d:"snare",s16:4,v:.6},{d:"snare",s16:12,v:.7}],
  };
  return F[kind] || F.backbeat;
}
function drumFill(r){
  const kinds = [
    [{d:"tom",s16:8,v:.6},{d:"tom",s16:10,v:.7},{d:"tom",s16:12,v:.8},{d:"snare",s16:14,v:.9}],
    [{d:"snare",s16:12,v:.6},{d:"snare",s16:13,v:.7},{d:"snare",s16:14,v:.8},{d:"snare",s16:15,v:.9}],
    [{d:"tom",s16:12,v:.75},{d:"snare",s16:14,v:.85},{d:"clap",s16:15,v:.7}],
    [{d:"hat_o",s16:12,v:.5},{d:"snare",s16:14,v:.9}],
  ];
  return pick(r, kinds);
}

/* ---------- style catalogue ---------- */
// tex: which optional voices exist. reg: octave centre for melody (midi).
const STYLES = [
  { key:"heroic_overworld", name:"Overworld", mood:"heroic",
    lead:["brass","strings","fm"], pad:["strings","organ"], bass:["synthbass","pizz"], arp:["harp","celesta"],
    scales:["major","mixolydian"], prog:"heroic", bpm:[104,132], res:[2], drums:["backbeat","straight8"], reg:72, dens:.7 },
  { key:"boss_battle", name:"Boss Battle", mood:"tense",
    lead:["sawlead","brass"], pad:["organ","choir"], bass:["synthbass"], arp:["square","sawlead"],
    scales:["harmonic","phrygian"], prog:"tense", bpm:[142,172], res:[2,4], drums:["doubleTime","drive16"], reg:69, dens:.9 },
  { key:"peaceful_village", name:"Village", mood:"calm",
    lead:["marimba","flute_fm","harp"], pad:["strings"], bass:["pizz","guitar"], arp:["harp","celesta"],
    scales:["major","lydian"], prog:"calm", bpm:[84,104], res:[2], drums:["sparseHat","none"], reg:72, dens:.5 },
  { key:"haunted_crypt", name:"Crypt", mood:"tense",
    lead:["organ","choir"], pad:["choir","strings"], bass:["synthbass"], arp:["bell"],
    scales:["phrygian","harmonic"], prog:"tense", bpm:[58,78], res:[2], drums:["heartbeat","none"], reg:60, dens:.35 },
  { key:"chiptune_platform", name:"Platformer", mood:"heroic",
    lead:["square"], pad:["square"], bass:["synthbass"], arp:["square"],
    scales:["major","mixolydian","pentaMaj"], prog:"heroic", bpm:[138,166], res:[4], drums:["straight8","drive16"], reg:76, dens:.85 },
  { key:"jazz_lounge", name:"Lounge", mood:"modal",
    lead:["epiano","pizz"], pad:["epiano"], bass:["synthbass"], arp:["celesta"],
    scales:["dorian","blues"], prog:"modal", bpm:[88,116], res:[2], drums:["shuffle","sparseHat"], reg:69, dens:.6 },
  { key:"ambient_space", name:"Drift", mood:"calm",
    lead:["choir","celesta"], pad:["strings","choir"], bass:["synthbass"], arp:["musicbox"],
    scales:["lydian","wholeTone"], prog:"loop2", bpm:[56,74], res:[1,2], drums:["none","sparseHat"], reg:72, dens:.25 },
  { key:"mystic_shrine", name:"Shrine", mood:"modal",
    lead:["sitar","harp"], pad:["choir"], bass:["pizz"], arp:["bell","musicbox"],
    scales:["pentaMin","dorian"], prog:"modal", bpm:[68,92], res:[2], drums:["tribal","sparseHat"], reg:69, dens:.45 },
  { key:"underwater", name:"Tides", mood:"calm",
    lead:["celesta","musicbox"], pad:["choir","strings"], bass:["synthbass"], arp:["harp"],
    scales:["wholeTone","lydian"], prog:"loop2", bpm:[66,86], res:[2], drums:["none","heartbeat"], reg:74, dens:.35 },
  { key:"desert_bazaar", name:"Bazaar", mood:"modal",
    lead:["sitar","accordion"], pad:["strings"], bass:["pizz","synthbass"], arp:["banjo"],
    scales:["phrygdom"], prog:"modal", bpm:[98,124], res:[2,4], drums:["tribal","shuffle"], reg:69, dens:.7 },
  { key:"snowy_peak", name:"Summit", mood:"calm",
    lead:["musicbox","celesta"], pad:["strings"], bass:["synthbass"], arp:["bell"],
    scales:["major","lydian"], prog:"calm", bpm:[76,96], res:[2], drums:["sparseHat","none"], reg:79, dens:.4 },
  { key:"cyber_chase", name:"Chase", mood:"tense",
    lead:["sawlead","square"], pad:["organ"], bass:["synthbass"], arp:["square"],
    scales:["minor","pentaMin"], prog:"tense", bpm:[140,168], res:[4], drums:["drive16","doubleTime"], reg:72, dens:.9 },
  { key:"folk_tavern", name:"Tavern", mood:"heroic",
    lead:["accordion","banjo"], pad:["guitar"], bass:["guitar","pizz"], arp:["banjo"],
    scales:["mixolydian","major"], prog:"heroic", bpm:[108,134], res:[2], drums:["marchy","shuffle"], reg:69, dens:.75 },
  { key:"melancholy_rain", name:"Rain", mood:"sad",
    lead:["piano"], pad:["strings"], bass:["synthbass","pizz"], arp:["harp"],
    scales:["minor","dorian"], prog:"sad", bpm:[62,84], res:[2], drums:["none","heartbeat"], reg:69, dens:.4 },
  { key:"victory_march", name:"Triumph", mood:"heroic",
    lead:["brass"], pad:["organ","strings"], bass:["synthbass"], arp:["bell"],
    scales:["major"], prog:"heroic", bpm:[112,138], res:[2], drums:["marchy","backbeat"], reg:72, dens:.75 },
  { key:"dungeon_crawl", name:"Depths", mood:"tense",
    lead:["organ","brass"], pad:["choir"], bass:["synthbass"], arp:["pizz"],
    scales:["minor","phrygian"], prog:"tense", bpm:[88,112], res:[2], drums:["tribal","heartbeat"], reg:64, dens:.5 },
  { key:"sunrise_meadow", name:"Meadow", mood:"calm",
    lead:["flute_fm","harp"], pad:["strings"], bass:["pizz"], arp:["celesta","harp"],
    scales:["lydian","major"], prog:"calm", bpm:[92,116], res:[2], drums:["sparseHat","backbeat"], reg:76, dens:.55 },
  { key:"steel_factory", name:"Foundry", mood:"tense",
    lead:["steeldrum","sawlead"], pad:["organ"], bass:["synthbass"], arp:["square"],
    scales:["minor","blues"], prog:"tense", bpm:[122,148], res:[2,4], drums:["drive16","marchy"], reg:69, dens:.8 },
  { key:"dream_sequence", name:"Reverie", mood:"calm",
    lead:["musicbox","choir"], pad:["choir","strings"], bass:["synthbass"], arp:["celesta"],
    scales:["wholeTone","lydian"], prog:"loop2", bpm:[60,80], res:[2], drums:["none"], reg:76, dens:.3 },
  { key:"pirate_voyage", name:"Voyage", mood:"heroic",
    lead:["accordion","brass"], pad:["strings"], bass:["guitar"], arp:["banjo"],
    scales:["dorian","minor"], prog:"modal", bpm:[110,136], res:[2], drums:["marchy","shuffle"], reg:69, dens:.7 },
  { key:"neon_drive", name:"Night Drive", mood:"modal",
    lead:["epiano","sawlead"], pad:["choir"], bass:["synthbass"], arp:["square"],
    scales:["pentaMin","minor"], prog:"loop2", bpm:[102,126], res:[2,4], drums:["straight8","drive16"], reg:72, dens:.7 },
  { key:"temple_ruins", name:"Ruins", mood:"sad",
    lead:["organ","bell"], pad:["choir"], bass:["pizz"], arp:["harp"],
    scales:["harmonic","phrygian"], prog:"sad", bpm:[72,94], res:[2], drums:["heartbeat","none"], reg:67, dens:.4 },
  { key:"final_confrontation", name:"Finale", mood:"tense",
    lead:["brass","sawlead"], pad:["choir","organ"], bass:["synthbass"], arp:["square","bell"],
    scales:["harmonic"], prog:"tense", bpm:[152,178], res:[2,4], drums:["doubleTime","drive16"], reg:72, dens:.95 },
  { key:"forest_hollow", name:"Hollow", mood:"modal",
    lead:["flute_fm","marimba"], pad:["strings"], bass:["pizz"], arp:["harp"],
    scales:["dorian","pentaMaj"], prog:"modal", bpm:[86,108], res:[2], drums:["tribal","sparseHat"], reg:74, dens:.55 },
];
// map friendly name -> engine instrument key ("fm" is the flute voice)
const INST = n => (n === "flute_fm" ? "fm" : n);

const KEYS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

/* ---------- one song ---------- */
function makeSong(idx, seed){
  const r = rng(seed);
  const st = STYLES[idx % STYLES.length];
  const scaleName = pick(r, st.scales);
  const scale = SCALES[scaleName];
  const rootPc = int(r, 0, 11);
  const bpm = int(r, st.bpm[0], st.bpm[1]);
  const res = pick(r, st.res);
  const spb = 4 * res;                       // steps per bar
  const s16 = 16 / spb;                      // divide 16th positions down to grid

  // choose bars so duration lands in [95,235]s and bars<=128
  const minB = Math.ceil(95 * bpm / 240), maxB = Math.floor(235 * bpm / 240);
  let bars = int(r, Math.max(16, minB), Math.min(128, Math.max(24, maxB)));
  bars = Math.max(16, Math.min(128, Math.round(bars / 4) * 4));   // 4-bar multiples

  // scale-degree -> midi
  const degMidi = (deg, oct) => {
    const n = scale.length;
    const o = Math.floor(deg / n) + oct;
    return rootPc + scale[((deg % n) + n) % n] + 12 * o;
  };
  const prog = pick(r, PROGS[st.prog]);
  const chordAt = bar => prog[bar % prog.length];
  const triad = (deg, oct) => [degMidi(deg, oct), degMidi(deg + 2, oct), degMidi(deg + 4, oct)];

  /* ---- section plan ---- */
  const plan = [];   // per bar: section label
  {
    const intro = Math.min(8, Math.max(4, Math.round(bars * 0.10 / 4) * 4)) || 4;
    const outro = intro;
    let body = bars - intro - outro;
    const secLen = body >= 48 ? 16 : 8;
    for (let i = 0; i < intro; i++) plan.push("intro");
    const labels = ["A","A","B","A","C","B"];
    let li = 0;
    while (body > 0){
      const L = Math.min(secLen, body);
      const lab = labels[li++ % labels.length];
      for (let i = 0; i < L; i++) plan.push(lab);
      body -= L;
    }
    for (let i = 0; i < outro; i++) plan.push("outro");
  }
  const isLastBar = b => b === bars - 1;

  /* ---- melodic motif: rhythm + contour, reused so it sounds composed ---- */
  function makeMotif(){
    // note lengths available at this resolution, biased by style density
    const pool = res === 4 ? [1,1,2,2,4,8] : res === 2 ? [1,2,2,4,8] : [1,2,4];
    const rhythm = [];
    let s = 0;
    while (s < spb * 2){                        // 2-bar motif
      let L = pick(r, pool);
      if (s + L > spb * 2) L = spb * 2 - s;
      const rest = chance(r, 1 - st.dens) && s > 0;
      if (!rest) rhythm.push({ s, L });
      s += L;
    }
    const contour = rhythm.map(() => int(r, -2, 4));
    return { rhythm, contour };
  }
  const motifA = makeMotif(), motifB = makeMotif();

  const melody = [], counter = [], pad = [], bassN = [], arp = [], drums = [];
  const fold = m => { while (m < 24) m += 12; while (m > 96) m -= 12; return m; };
  const N = (arr, midi, bar, step, len, vel) => {
    if (step >= spb || len < 1) return;
    arr.push({ midi: fold(midi), step: bar * spb + step, len: Math.max(1, Math.min(len, spb - step)), vel: +vel.toFixed(2) });
  };
  const D = (drum, bar, step, vel) => drums.push({ drum, step: bar * spb + step, len: 1, vel: +vel.toFixed(2) });

  const octLead = Math.round((st.reg - rootPc) / 12);   // octave index putting melody near st.reg
  const useCounter = chance(r, .45), useArp = chance(r, .55), usePad = chance(r, .85);
  const drumKind = pick(r, st.drums);
  const basePat = drumPattern(drumKind, r);

  for (let bar = 0; bar < bars; bar++){
    const sec = plan[bar];
    const deg = chordAt(bar);
    const quiet = sec === "intro" || sec === "outro";
    const big = sec === "B" || sec === "C";
    const last = isLastBar(bar);

    /* pad — sustained chord */
    if (usePad && !(quiet && chance(r, .35))){
      triad(deg, octLead - 1).forEach(m => N(pad, m, bar, 0, spb, quiet ? .38 : .46));
    }
    /* bass */
    if (!quiet || chance(r, .7)){
      const root = degMidi(deg, octLead - 2);
      if (last) N(bassN, root, bar, 0, spb, .5);
      else if (quiet) { N(bassN, root, bar, 0, spb / 2, .6); N(bassN, root, bar, spb / 2, spb / 2, .5); }
      else if (st.dens > .75){
        for (let s = 0; s < spb; s += Math.max(1, spb / 8))
          N(bassN, s === spb - Math.max(1, spb / 8) ? root + 7 : root, bar, s, Math.max(1, spb / 8), s % 2 ? .45 : .62);
      } else {
        N(bassN, root, bar, 0, spb / 2, .62);
        N(bassN, chance(r, .5) ? root + 7 : root, bar, spb / 2, spb / 2, .5);
      }
    }
    /* melody — motif applied to this bar's chord, varied by section */
    if (!last){
      const m = (sec === "B" || sec === "C") ? motifB : motifA;
      const phase = bar % 2;                    // 2-bar motif spans two bars
      const oct = octLead + (big ? 1 : 0) + (sec === "C" ? 1 : 0);
      m.rhythm.forEach((rh, i) => {
        if (Math.floor(rh.s / spb) !== phase) return;
        const stp = rh.s % spb;
        const strong = stp === 0 || stp === spb / 2;
        let d = deg + m.contour[i];
        if (strong) d = deg + [0, 2, 4][Math.abs(m.contour[i]) % 3];   // strong beats on chord tones
        if (quiet && chance(r, .45)) return;
        N(melody, degMidi(d, oct), bar, stp, rh.L, (strong ? .78 : .62) - (quiet ? .12 : 0));
      });
    } else {
      N(melody, degMidi(deg, octLead + 1), bar, 0, spb, .7);
    }
    /* counter-melody — sparser, lower, offset */
    if (useCounter && !quiet && !last && chance(r, .7)){
      const stp = Math.floor(spb / 4);
      N(counter, degMidi(deg + 2, octLead - 1), bar, stp, Math.max(1, spb / 4), .45);
      if (chance(r, .5)) N(counter, degMidi(deg + 4, octLead - 1), bar, spb - Math.max(1, spb / 4), Math.max(1, spb / 4), .4);
    }
    /* arpeggio */
    if (useArp && (big || (!quiet && chance(r, .5))) && !last){
      const tones = triad(deg, octLead + 1).concat([degMidi(deg + 7, octLead + 1)]);
      const stepN = Math.max(1, Math.round(spb / 8));
      for (let s = 0, k = 0; s < spb; s += stepN, k++)
        N(arp, tones[k % tones.length], bar, s, stepN, .34);
    }
    /* drums */
    if (drumKind !== "none"){
      const on = quiet ? (bar % 2 === 0 && chance(r, .5)) : true;
      if (on && !last){
        basePat().forEach(h => { const stp = Math.round(h.s16 / s16); if (stp < spb) D(h.d, bar, stp, h.v * (quiet ? .6 : 1)); });
        if (big && chance(r, .25)) D("clap", bar, Math.round(8 / s16), .45);
      }
      const nextNew = plan[bar + 1] && plan[bar + 1] !== sec;
      if (nextNew && !last) drumFill(r).forEach(h => { const stp = Math.round(h.s16 / s16); if (stp < spb) D(h.d, bar, stp, h.v); });
      if (last) D("kick", bar, 0, .85);
    }
  }

  /* ---- assemble tracks (only non-empty) ---- */
  const tracks = [];
  const T = (name, inst, notes, vol) => { if (notes.length) tracks.push({
    type:"inst", name, inst: INST(inst), notes, mute:false, solo:false, vol, lo:24, hi:96 }); };
  const leadI = pick(r, st.lead), padI = pick(r, st.pad), bassI = pick(r, st.bass), arpI = pick(r, st.arp);
  T("Melody", leadI, melody, .82);
  if (useCounter) T("Counter", pick(r, st.lead.concat(st.arp)), counter, .5);
  if (usePad)     T("Pad", padI, pad, .34);
  if (useArp)     T("Arp", arpI, arp, .38);
  T("Bass", bassI, bassN, .68);
  if (drums.length) tracks.push({ type:"drum", name:"Drums", notes:drums, mute:false, solo:false, vol:.85 });

  const dur = bars * 4 * (60 / bpm);
  // unique title: each style's own name once (its first occurrence), then originals
  const sIdx = idx % STYLES.length;
  const occ = Math.floor(idx / STYLES.length);      // 0 = first time this style appears
  const title = NAMES[sIdx][occ];
  if (!title) throw new Error("no name for style " + sIdx + " occurrence " + occ);
  return {
    song: { id: "SQG" + String(idx + 1).padStart(3, "0"), kind: "song",
      name: title, bpm, bars, res, tracks },
    meta: { idx: idx + 1, style: st.key, title, key: KEYS[rootPc], scale: scaleName, bpm, bars, res,
      dur: +dur.toFixed(1), tracks: tracks.map(t => t.type === "drum" ? "drums" : t.inst),
      notes: tracks.reduce((a, t) => a + t.notes.length, 0), drumKind }
  };
}

/* ---------- main ---------- */
const COUNT = +(process.argv[2] || 100);
const OUT = process.argv[3] || "./songs";
fs.mkdirSync(OUT, { recursive: true });
const index = [];
for (let i = 0; i < COUNT; i++){
  const { song, meta } = makeSong(i, 0x5EED + i * 7919);
  fs.writeFileSync(path.join(OUT, song.id + ".json"), JSON.stringify(song));
  index.push(meta);
}
fs.writeFileSync(path.join(OUT, "_index.json"), JSON.stringify(index, null, 1));
const tot = index.reduce((a, m) => a + m.dur, 0);
console.log(`generated ${COUNT} songs`);
console.log(`duration: min ${Math.min(...index.map(m=>m.dur))}s  max ${Math.max(...index.map(m=>m.dur))}s  total ${(tot/60).toFixed(0)} min`);
console.log(`out of range (<90 or >240s): ${index.filter(m=>m.dur<90||m.dur>240).length}`);
console.log(`styles: ${new Set(index.map(m=>m.style)).size}, scales: ${new Set(index.map(m=>m.scale)).size}, keys: ${new Set(index.map(m=>m.key)).size}`);
console.log(`res used: ${JSON.stringify([...new Set(index.map(m=>m.res))].sort())}, bpm ${Math.min(...index.map(m=>m.bpm))}-${Math.max(...index.map(m=>m.bpm))}`);
console.log(`instruments: ${new Set(index.flatMap(m=>m.tracks)).size} distinct`);
console.log(`notes: min ${Math.min(...index.map(m=>m.notes))} max ${Math.max(...index.map(m=>m.notes))}`);
