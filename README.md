# Musical Forge Studio

Three music tools in one browser app: **generate** game themes, **remix**
audio, or **write** sheet music. One HTML file, zero dependencies, pure Web
Audio API. Every page has a built-in plain-language guide, so first-timers
can do everything a pro can.

**[▶ Try it live](https://casimbahadar.github.io/Musical-Forge-Studio/)**
*(enable GitHub Pages on this repo to activate the link)*

A home screen lets you pick a tool; each opens its own uncluttered page with
a ‹ Home button — built mobile-first, and the whole app widens responsively
on tablets and desktops.

## 🎛 Theme Forge — generate

Compose looping game themes by choosing ingredients instead of writing
notes: 12 instrument voices (piano, e-piano, organ, guitar, harp, marimba,
bell, brass, strings, saw lead, chip square, flute), 7 modes labeled by feel
(Phrygian = menacing, Lydian = wondrous...), 10 named chord progressions,
and rhythm controls for bass, drums and melody density. Action drum styles
add an automatic battle intro — drum fill, snare roll, rising lead run.

The **seed** is the magic: the same recipe + seed produces the *identical*
piece of music, forever, on any device. **🎲 New melody** rerolls only the
seed. Tap the ready-made **examples** to load their recipes and learn by
remixing. Saved themes get per-card **WAV export**, **recipe JSON
download**, **↗ Share**, and delete; live **level meters** show melody /
chords / bass / drums as it plays.

## 🎚 Remix Lab — transform

Load an audio file (or a direct .mp3/.ogg/.wav link) and shape it with a
full FX rack of 12 controls, all live while the music plays: speed & pitch,
drive, bit crush, low/high cut, brightness, reverb, a three-knob echo
section, tape wobble, loop and reverse. Eight presets (Chip Crush, Slowed +
Reverb, Nightcore, Underwater, Old Radio, Cavern Echo, Warm Tape, Reversed)
are starting points, not endpoints. **Save FX presets** to reapply your
signature sound to any track later; **Export WAV** bakes your exact slider
settings.

The Lab also **estimates a track's key, mode and BPM**, and one tap sends
them to the Forge so you can compose an *original* theme in the same musical
space — inspired by, never copied from.

## 🎼 Score Composer — write

Real engraved sheet music, note by note, on paginated sheets:

- **Notation** — choose a clef (treble/bass) and time signature; barlines
  draw automatically. Notes render with proper noteheads, stems, flags,
  dots, accidentals (♯/♭ spelling toggle), and ledger lines. All note and
  rest buttons are **hand-drawn SVG icons** (five rest types, whole through
  sixteenth), so they display identically on every device — no missing-glyph
  problems.
- **Letter names under every note** — chords stack their letters, lowest at
  the bottom — so the staff doubles as a learn-to-read-music aid.
- **Chords** — chord mode stacks up to five pitches on one note, engraved
  correctly (shared stem, offset seconds, stacked accidentals).
- **Never scroll sideways** — measures pack into rows by actual screen
  width; small bars share a line, a dense bar of sixteenths compresses to
  fit, and whole bars are never split across lines.
- **Pages like a real book** — four rows per sheet; pages grow a row at a
  time as you compose (no empty paper pushing the piano away), with
  **‹ Prev / Next ›** navigation. On desktop, two facing pages display side
  by side like an open book. Playback **turns the page for you**.
- **Live length readout** — total time at the current tempo, measures, and
  note count update with every edit, so you can compose to a target length.
- **↩ Undo** (60 steps), **▶ From here** (play from the selected note), and
  follow-along green highlighting during playback.
- **Two exports:** **Export WAV** renders the performance with any of the 12
  instruments; **🖼 Save sheet** downloads the notation itself as a PNG —
  every page stacked, with your title and tempo/instrument header on top —
  ready to print or share.
- **Save**, reload for editing, or share the score as a small JSON file —
  whoever imports it gets your exact score, editable.

## 🌐 Community gallery

Every saved theme, FX preset, and score card has an **↗ Share** button that
posts it to the project's gallery — a GitHub Discussions board — where
others can download the JSON, leave comments, and react with 👍 ❤️ 😄. A
**Community gallery** button on the home screen browses it.

To activate on your own fork: enable Discussions in the repo settings, keep
the default "Show and tell" category, and set `GH_REPO = "username/repo"`
near the bottom of `index.html`.

## Sharing everything

Themes, FX presets, and scores all download as small JSON files (stamped
with a "made with" link). The **Import** button recognizes all three shapes
— even mixed in one file — and routes each to the right list. Because
generation is deterministic, whoever imports your file hears exactly what
you heard. Saves persist on your device (no account, no server): via
`localStorage` on the web, with an automatic fallback chain for other
environments.

## Running it

Open `index.html` in any modern browser — no build step, no install. To
host: enable GitHub Pages on this repo (Settings → Pages → deploy from
main). On iPhone, the ring/silent switch must be ON or iOS mutes web audio.

## Audio sources & what's allowed

The Remix Lab works with **audio files you have the rights to use**:

- ✔ Your own recordings and exports
- ✔ CC0 / public-domain music (e.g. [OpenGameArt](https://opengameart.org),
  [Pixabay](https://pixabay.com/music/)) — direct download links from these
  sites also work in the link loader
- ✔ YouTube's own Audio Library (downloaded through YouTube Studio, the
  sanctioned route)
- ✘ YouTube / Spotify / SoundCloud **links** — streaming platforms block
  downloads by design and their terms prohibit ripping, even for
  copyright-free videos. Converter sites (ytmp3 and similar) violate those
  same terms. This is a hard technical and policy wall, not a missing
  feature.

Many websites block cross-site fetching (CORS), so some legitimate direct
audio links will still fail — downloading the file and using the file picker
always works.

## How it works (for the curious)

Themes are ~1-line JSON recipes; a seeded PRNG
([mulberry32](https://github.com/bryc/code/blob/master/jshash/PRNGs.md))
composes melodies from scale and chord tones, so composition is fully
deterministic. All sound is synthesized live with the Web Audio API: FM
synthesis (flute, e-piano), additive (organ), subtractive (brass, strings,
saw lead), struck-bar modeling (marimba, bell), and Karplus-Strong string
modeling (guitar, harp). Drums are synthesized from noise and pitched sine
sweeps.

The Remix Lab is a fixed-topology effects graph driven entirely by
parameters — that's why sliders update live and WAV exports match playback
exactly. Key detection uses a Goertzel-filter chromagram correlated against
Krumhansl-Schmuckler key profiles; tempo uses onset-envelope autocorrelation
with octave-error correction.

The Score Composer engraves notation as SVG (including its own drawn rest
glyphs), packs measures into systems by pixel width, paginates them four
systems per sheet, and plays events through the same instrument voices. WAV
export renders through an OfflineAudioContext at 44.1 kHz stereo; sheet
export rasterizes the full SVG score to PNG at 2× resolution.

## Contributing

Issues and pull requests welcome. The whole app is one file by design —
please keep it that way; portability is the product.

## License

MIT — see [LICENSE](LICENSE).
