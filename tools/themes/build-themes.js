/* Build extended (1:30-4:00) Forge Sequencer arrangements from theme specs.
   v3 — long-form arc (3 motifs, break section, real climax), sustain-aware
   bass, per-theme mix trim, optional legato for ambient pieces.

   Spec schema (one JSON per theme, in ./specs2/):
   {
     "id":"B7", "title":"Champion — Crown of Embers",
     "key":"F#", "scale":"harmonic", "bpm":152, "res":2,
     "targetSec":195,
     "prog":[0,5,3,4],                  // scale degrees, 1 chord per bar, cycles
     "lead":"sawlead","pad":"choir","bass":"synthbass","arp":"square","counter":"brass",
     "bassStyle":"oct",                 // whole | walk | pulse | oct
     "drums":"doubleTime",
     "reg":72,                          // melody centre (midi)
     "dens":0.85,                       // 0..1 rhythmic density
     "mix":1.0,                         // track-volume trim (sparse pieces need >1)
     "legato":1.0,                      // note-length multiplier for melody/pad
     "seed":207,
     "arc":["intro","A","B","A","break","C","climax","outro"]
   }
   Output: app-native song JSON in ./theme-songs/  */
const fs = require("fs"), path = require("path");

const SCALES = { major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10], harmonic:[0,2,3,5,7,8,11],
  dorian:[0,2,3,5,7,9,10], phrygian:[0,1,3,5,7,8,10], phrygdom:[0,1,4,5,7,8,10],
  lydian:[0,2,4,6,7,9,11], mixolydian:[0,2,4,5,7,9,10], pentaMaj:[0,2,4,7,9],
  pentaMin:[0,3,5,7,10], blues:[0,3,5,6,7,10], wholeTone:[0,2,4,6,8,10] };
const KEYS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

/* Voices whose envelope actually holds. A held whole-note on a decaying voice
   (marimba, pizz, harp) dies inside a second and leaves the bar empty — that is
   exactly why A15 rendered quieter than every other theme. */
const SUSTAINING = new Set(["organ","strings","choir","ooh","synthbass","sawlead",
  "square","fm","accordion","brass"]);

const DRUMPAT = {
  none: [], heartbeat: [["kick",0,.9],["kick",10,.6]],
  backbeat: [["kick",0,1],["snare",8,.8],["hat",4,.45],["hat",12,.45]],
  straight8: [["kick",0,1],["snare",8,.8],["hat",0,.5],["hat",2,.32],["hat",4,.5],["hat",6,.32],["hat",8,.5],["hat",10,.32],["hat",12,.5],["hat",14,.32]],
  drive16: [["kick",0,1],["kick",6,.7],["snare",8,.85],["clap",8,.5],["hat",0,.4],["hat",1,.22],["hat",2,.4],["hat",3,.22],["hat",4,.4],["hat",5,.22],["hat",6,.4],["hat",7,.22],["hat",8,.4],["hat",9,.22],["hat",10,.4],["hat",11,.22],["hat",12,.4],["hat",13,.22],["hat",14,.4],["hat",15,.22]],
  doubleTime: [["kick",0,1],["kick",4,1],["kick",8,1],["kick",12,1],["snare",4,.85],["snare",12,.85],["hat_o",2,.3],["hat_o",6,.3],["hat_o",10,.3],["hat_o",14,.3]],
  shuffle: [["kick",0,.95],["hat",3,.35],["snare",8,.75],["hat",11,.35],["hat",14,.3]],
  tribal: [["tom",0,.85],["tom",6,.6],["tom",10,.7],["kick",0,.8],["snare",12,.5]],
  sparseHat: [["hat",0,.35],["hat",8,.3]],
  marchy: [["kick",0,.95],["kick",8,.8],["snare",4,.6],["snare",12,.7]],
};
const FILLS = [[["tom",8,.6],["tom",10,.7],["tom",12,.8],["snare",14,.9]],
  [["snare",12,.6],["snare",13,.7],["snare",14,.8],["snare",15,.9]],
  [["tom",12,.75],["snare",14,.85],["clap",15,.7]]];

function rng(seed){ let a=seed>>>0; return ()=>{ a|=0; a=(a+0x6D2B79F5)|0;
  let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296; }; }

function build(spec, seed){
  const r = rng(seed);
  const scale = SCALES[spec.scale] || SCALES.minor;
  const rootPc = KEYS.indexOf(spec.key) >= 0 ? KEYS.indexOf(spec.key) : 0;
  const bpm = spec.bpm, res = spec.res || 2, spb = 4 * res, s16 = 16 / spb;
  const target = Math.max(95, Math.min(235, spec.targetSec || 180));
  let bars = Math.round(target * bpm / 240 / 4) * 4;
  bars = Math.max(16, Math.min(128, bars));
  const prog = (spec.prog && spec.prog.length) ? spec.prog : [0,5,3,4];
  const dens = spec.dens == null ? .7 : spec.dens;
  const reg = spec.reg || 72;
  const mix = spec.mix == null ? 1 : spec.mix;
  const leg = spec.legato == null ? 1 : spec.legato;

  const degMidi = (deg, oct) => { const n = scale.length;
    return rootPc + scale[((deg%n)+n)%n] + 12*(Math.floor(deg/n)+oct); };
  const fold = m => { while(m<24) m+=12; while(m>96) m-=12; return m; };
  const oct = Math.round((reg - rootPc)/12);
  const triad = (d,o) => [degMidi(d,o), degMidi(d+2,o), degMidi(d+4,o)];
  /* The progression must not be what decides how a piece ends. Bars are always
     a multiple of 4 and most progs are 4 long, so the final bar always landed
     on prog[3] — the dominant in 22 of the 26 themes — and the music simply
     stopped, unresolved, on a lone note. Force a real V-I cadence into the last
     two bars instead. */
  const chordAt = b => b===bars-1 ? 0 : b===bars-2 ? 4 : prog[b % prog.length];

  /* Section plan: spend the bars across the arc, giving any remainder to the
     middle sections so the intro and outro stay short. */
  const arc = spec.arc && spec.arc.length ? spec.arc : ["intro","A","A","B","A","C","B","outro"];
  const n = arc.length, base = Math.max(2, Math.floor(bars / n));
  const counts = arc.map(() => base);
  let tot = counts.reduce((a,b)=>a+b, 0), k = 0;
  const mid = Math.max(1, n - 2);
  while (tot < bars){ counts[1 + (k % mid)]++; tot++; k++; }
  while (tot > bars){ const j = counts.findIndex((c,i) => c > 2 && i > 0);
    if (j < 0) break; counts[j]--; tot--; }
  const plan = [];
  arc.forEach((lab,i) => { for (let q=0; q<counts[i]; q++) plan.push(lab); });
  while (plan.length < bars) plan.push(arc[n-1]);
  plan.length = bars;

  const melody=[],counter=[],pad=[],bass=[],arp=[],drums=[];
  const N=(a,m,b,s,l,v)=>{ if(s>=spb||l<1)return;
    a.push({midi:fold(m),step:b*spb+s,len:Math.max(1,Math.min(Math.round(l),spb-s)),vel:+Math.max(.05,Math.min(1,v)).toFixed(2)}); };
  const D=(d,b,s,v)=>drums.push({drum:d,step:b*spb+s,len:1,vel:+Math.max(.05,Math.min(1,v)).toFixed(2)});

  /* Three motifs: A is the tune, B contrasts, C develops. Climax reprises A
     with an octave doubling rather than introducing new material. */
  function motif(){ const pool = res===4?[1,1,2,2,4,8]:res===2?[1,2,2,4,8]:[1,2,4];
    const rh=[]; let s=0;
    while(s<spb*2){ let L=pool[Math.floor(r()*pool.length)]; if(s+L>spb*2)L=spb*2-s;
      if(!(r()>dens && s>0)) rh.push({s,L}); s+=L; }
    return { rh, cont: rh.map(()=>Math.floor(r()*7)-2) }; }
  const mA=motif(), mB=motif(), mC=motif();

  for(let bar=0;bar<bars;bar++){
    const sec=plan[bar], deg=chordAt(bar);
    const quiet = sec==="intro"||sec==="outro";
    const brk   = sec==="break";
    const clim  = sec==="climax";
    const big   = sec==="B"||sec==="C"||clim;
    const last  = bar===bars-1;

    // pad — the one layer that never drops out; it is what holds a break together
    if(spec.pad) triad(deg,oct-1).forEach(m=>N(pad,m,bar,0,spb,last?.52:quiet?.38:brk?.5:.46));

    // bass
    const root=degMidi(deg,oct-2);
    const bs=spec.bassStyle||"auto";
    if(last) N(bass,root,bar,0,spb,.66);
    else if(brk) N(bass,root,bar,0,spb,.6);
    else if(quiet){ N(bass,root,bar,0,spb/2,.58); N(bass,root,bar,spb/2,spb/2,.48); }
    else if(bs==="whole"){ N(bass,root,bar,0,spb,.66); }
    else if(bs==="walk"){ const q=Math.max(1,Math.round(spb/4));
      const deg2=[deg,deg+2,deg+4,deg+(r()<.5?6:5)];
      for(let i=0;i<4&&i*q<spb;i++) N(bass,degMidi(deg2[i],oct-2),bar,i*q,q,i===0?.66:.5); }
    else if(bs==="pulse"){ const e=Math.max(1,Math.round(spb/8));
      for(let s=0,i=0;s<spb;s+=e,i++) N(bass,root,bar,s,e,i%2?.44:.62); }
    else if(bs==="oct"){ const e=Math.max(1,Math.round(spb/8));
      for(let s=0,i=0;s<spb;s+=e,i++) N(bass,i%2?root+12:root,bar,s,e,i%2?.46:.66); }
    else { N(bass,root,bar,0,spb/2,.62); N(bass,root,bar,spb/2,spb/2,.5); }

    // melody
    if(last){ // land on the tonic, held, doubled at the octave — a real ending
      N(melody,degMidi(0,oct),bar,0,spb,.74);
      N(melody,degMidi(0,oct+1),bar,0,spb,.46);
    }
    else if(bar===bars-2){ // 3-2-1 stepwise descent over the V, resolving next bar.
      // Mode-agnostic on purpose: raising the 7th would give a stronger pull but
      // would also make the phrygian and dorian themes cadence like common practice
      // tonal music, which is not what they are.
      N(melody,degMidi(2,oct),bar,0,Math.max(1,spb/2),.66);
      N(melody,degMidi(1,oct),bar,Math.max(1,spb/2),Math.max(1,spb/2),.62);
    }
    else if(brk){ // breathe: one long held tone, nothing busy
      if(bar%2===0) N(melody,degMidi(deg+4,oct),bar,0,spb,.5);
    } else {
      const m = clim?mA : sec==="C"?mC : big?mB : mA;
      const phase=bar%2, o=oct+(big?1:0);
      m.rh.forEach((h,i)=>{ if(Math.floor(h.s/spb)!==phase)return;
        const st=h.s%spb, strong=(st===0||st===spb/2);
        let d=deg+m.cont[i]; if(strong) d=deg+[0,2,4][Math.abs(m.cont[i])%3];
        if(quiet && r()<.45) return;
        const L=Math.max(1,Math.round(h.L*leg));
        // a long note held flat is what makes a sparse theme sound simple —
        // split some of them with a neighbour tone so the line keeps moving
        if(!quiet && L>=4 && r()<.3){
          const a=Math.max(1,Math.round(L*.6));
          N(melody,degMidi(d,o),bar,st,a,strong?.78:.62);
          N(melody,degMidi(d+1,o),bar,st+a,L-a,strong?.6:.5);
        } else {
          N(melody,degMidi(d,o),bar,st,L,(strong?.78:.62)-(quiet?.12:0));
        }
        if(clim) N(melody,degMidi(d,o-1),bar,st,L,strong?.5:.4); });   // octave power
    }

    // counter — carries the break, sits under everything else
    if(spec.counter && last){ // fill out the final tonic chord
      N(counter,degMidi(2,oct-1),bar,0,spb,.5);
      N(counter,degMidi(4,oct-1),bar,0,spb,.44); }
    else if(spec.counter && !last && (brk || (!quiet && r()<.7))){
      const st=Math.floor(spb/4), L=Math.max(1,Math.round((brk?spb/2:spb/4)*leg));
      N(counter,degMidi(deg+2,oct-1),bar,brk?0:st,L,brk?.52:.45);
      if(!brk && r()<.5) N(counter,degMidi(deg+4,oct-1),bar,spb-Math.max(1,spb/4),Math.max(1,spb/4),.4); }

    // arp
    if(spec.arp && !brk && !last && (clim||big||(!quiet&&r()<.5))){
      const t=triad(deg,oct+1).concat([degMidi(deg+7,oct+1)]), st=Math.max(1,Math.round(spb/8));
      for(let s=0,i=0;s<spb;s+=st,i++) N(arp,t[i%t.length],bar,s,st,clim?.42:.34); }

    // drums
    const pat=DRUMPAT[spec.drums]||[];
    if(pat.length && !last && !brk){ const on = quiet ? (bar%2===0) : true;
      if(on) pat.forEach(([d,p,v])=>{ const st=Math.round(p/s16);
        if(st<spb) D(d,bar,st,v*(quiet?.6:clim?1.05:1)); }); }
    if(pat.length && brk && bar%2===0) D("kick",bar,0,.55);   // keep the pulse alive
    if(pat.length && plan[bar+1] && plan[bar+1]!==sec && !last)
      FILLS[Math.floor(r()*FILLS.length)].forEach(([d,p,v])=>{ const st=Math.round(p/s16); if(st<spb) D(d,bar,st,v); });
    if(pat.length && bar===bars-2)   // fill leading into the cadence
      FILLS[0].forEach(([d,p,v])=>{ const st=Math.round(p/s16); if(st<spb) D(d,bar,st,v*.9); });
    if(pat.length && last){ D("kick",bar,0,.92); D("snare",bar,0,.5); D("hat_o",bar,0,.55); }
  }

  const tracks=[];
  const V=v=>+Math.max(.05,Math.min(1,v*mix)).toFixed(2);
  const T=(nm,i,notes,vol)=>{ if(notes.length) tracks.push({type:"inst",name:nm,inst:i,notes,mute:false,solo:false,vol:V(vol),lo:24,hi:96}); };
  T("Melody",spec.lead,melody,.82);
  if(spec.counter) T("Counter",spec.counter,counter,.5);
  if(spec.pad) T("Pad",spec.pad,pad,.34);
  if(spec.arp) T("Arp",spec.arp,arp,.38);
  T("Bass",spec.bass,bass,.68);
  if(drums.length) tracks.push({type:"drum",name:"Drums",notes:drums,mute:false,solo:false,vol:V(.85)});

  const sustainWarn = spec.bassStyle==="whole" && !SUSTAINING.has(spec.bass);
  return { id:"SQL"+spec.id, kind:"song", name:spec.title, bpm, bars, res, tracks,
    _dur:+(bars*4*(60/bpm)).toFixed(1), _warn:sustainWarn?"decaying bass voice on held notes":null };
}

/* ---- main ---- */
const SPECS = process.argv[2] || "./specs2";
const OUT = process.argv[3] || "./theme-songs";
fs.mkdirSync(OUT,{recursive:true});
const rows=[]; let warns=0;
for(const f of fs.readdirSync(SPECS).filter(x=>x.endsWith(".json")&&!x.startsWith("_")).sort()){
  const spec=JSON.parse(fs.readFileSync(path.join(SPECS,f),"utf8"));
  const song=build(spec, spec.seed != null ? (0xA11CE ^ spec.seed)>>>0
    : 0xA11CE ^ (spec.id.split("").reduce((a,c)=>a*31+c.charCodeAt(0),7)>>>0));
  const dur=song._dur, warn=song._warn; delete song._dur; delete song._warn;
  if(warn){ warns++; console.log(`  !! ${spec.id}: ${warn} (${spec.bass})`); }
  fs.writeFileSync(path.join(OUT,song.id+".json"), JSON.stringify(song));
  const notes=song.tracks.reduce((a,t)=>a+t.notes.length,0);
  rows.push({id:spec.id,title:spec.title,dur,bars:song.bars,bpm:song.bpm,res:song.res,notes,tracks:song.tracks.length});
  console.log(`${spec.id.padEnd(4)} ${spec.title.slice(0,34).padEnd(35)} ${String(song.bpm).padStart(3)}bpm ${String(song.bars).padStart(3)}bars ${Math.floor(dur/60)}:${String(Math.round(dur%60)).padStart(2,"0")} ${String(notes).padStart(5)}n ${song.tracks.length}tr`);
}
fs.writeFileSync(path.join(OUT,"_index.json"),JSON.stringify(rows,null,1));
const bad=rows.filter(r=>r.dur<90||r.dur>240);
console.log(`\nbuilt ${rows.length} | out of 1:30-4:00 range: ${bad.length} | sustain warnings: ${warns}`);
