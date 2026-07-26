# Decisions

Append-only. One entry per decision, newest at the bottom.

---

**2026-07 — Community board is account-free, backed by Supabase.**
GitHub Discussions was rejected: it requires every listener to have a GitHub
account, which contradicts "anyone using the app can play what others share."
Identity is a per-device creator key (256-bit random secret in `localStorage`,
SHA-256 hashed server-side, first-come name claim). No email, no IP, no personal
data. RLS plus `SECURITY DEFINER` functions are the actual guard — the anon key
in `index.html` is public by design.

**2026-07 — Likes are one per share per device, server-enforced.**
A `likes` table keyed on (share, device) rather than a counter column, so
replaying `set_like` cannot inflate a total. Loads stay unlimited per device:
Most Liked is the quality signal, Most Loaded is not.

**2026-07 — Master limiter in both audio engines (PR #23, #25).**
Dense arrangements summed past 1.0 and `encodeWav` hard-clamps, so exports
distorted at their loudest moments. A `DynamicsCompressor` (−10 dB threshold,
12:1) now sits before `destination` in the sequencer engine *and* in the shared
Theme Forge / Score Composer engine. The second one was missed on the first
pass, which is how clipped Theme Forge WAVs shipped. Verified after: peaks
0.79–0.94, zero clipped samples across 126 rendered tracks.

**2026-07 — Sustain rule for generated arrangements.**
If a theme's lead voice decays, its bass voice must sustain. Found by sorting
rendered themes by measured RMS, not by ear. See `tools/README.md` for the
measurements. The first version of the rule only checked whole-note bass and
missed three walking-bass themes; the corrected rule keys on the lead instead.

**2026-07 — Generated arrangements end on a forced V–I cadence.**
Bar counts are a multiple of 4 and most progressions are 4 long, so the last bar
always landed on `prog[3]` — the dominant in 22 of 26 themes — and every piece
stopped unresolved on a lone note. The last two bars are now forced to V then I,
with the final bar voiced as a full sustained tonic chord. The cadence is kept
*modal*: raising the 7th would pull harder but would make the phrygian and
dorian themes cadence like common-practice tonal music, which is not what they
are.

**2026-07 — Analyser estimates are not a substitute for source data.**
The Remix Lab chromagram analyser recovered tempo well (23/26 within 2 BPM) but
key poorly (13/26 wrong) on dense synth material. Arrangements derived from its
estimates had to be rebuilt once `themes.json` was available. Treat the analyser
as a convenience for users, not as a source of truth for generation.

**2026-07 — A1 and A13 are deliberately the same tune.**
They share seed 101 in `themes.json`, along with progression, target length,
density, bass style and drum family: "NG+ overworld variant" is meant to *be*
the overworld theme, soured. They must share `res` and bar count or the motif
generator produces unrelated material from that shared seed. Currently verified
at 174/174 identical melody onsets, differing only in pitch.

**2026-07 — Remix Lab export needed its own guard, not the shared one.**
The FX chain summed dry + echo + reverb in parallel, each scaled by `vol`, then
connected straight to `destination` with no limiter — so `encodeWav`'s hard
clamp was the only thing standing between the user and lost samples. Measured on
a dense track: untouched defaults clipped 392 samples, the shipped Cavern Echo
preset clipped 0.635% of the file, and the loudest settings the sliders allow
peaked at 4.16 and clipped 20.6%. All four cases tested clipped.

It could not reuse the synthesis engines' limiter (threshold −10, ratio 12):
Remix Lab is fed the user's own already-mastered audio, and that setting pulls a
normal track down to roughly 0.35 peak. It now uses a −1 dB / 20:1 near-brickwall
followed by a soft-clip `WaveShaper`. The shaper is the actual guarantee — a
WaveShaper's curve domain is [−1,1] and inputs outside it clamp to the endpoints,
so the output cannot exceed the curve's last value regardless of what arrives.
The compressor alone was not enough; having no lookahead, it still overshot to
1.049 and 1.384 on transients.

Result: 0 clipped samples in all six cases, loud material bounded at 0.941, and
verified transparent at normal levels — halving `vol` exactly halves the output
peak (0.30 → 0.367, 0.15 → 0.183).

**2026-07 — Exported audio is not bit-reproducible; do not byte-compare it.**
`makeBuffers` re-randomizes the drum noise buffer and the reverb impulse response
on every render, and several voices randomize detune. Two renders of the same
song from the same code differ (~±0.0002 RMS, ±0.003 peak). A byte-comparison
regression test on rendered audio will fail for reasons that have nothing to do
with the change under test. Compare peak/RMS within tolerance, and prove code
paths are unaffected structurally instead.
