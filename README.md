# Theme Forge

A generative game-music maker and remix studio that runs in your browser.
One HTML file, zero dependencies, pure Web Audio API.

**[▶ Try it live](https://YOUR-USERNAME.github.io/theme-forge/)** *(update
this link after enabling GitHub Pages)*

Compose looping game themes — overworld, battle, town, dungeon — by choosing
ingredients instead of writing notes: an instrument, a key, a mood, a tempo,
a chord progression, and a **seed**. A deterministic generator does the
composing, which means the same recipe always produces the *identical* piece
of music. Forever. On any device.

## Features

**🎛 The Forge** — build themes from 12 instrument voices (piano, e-piano,
organ, guitar, harp, marimba, bell, brass, strings, saw lead, chip square,
flute), 7 modes labeled by feel (Phrygian = menacing, Lydian = wondrous...),
10 named chord progressions, and rhythm controls for bass, drums, and melody
density. Action drum styles automatically add a battle intro — drum fill,
snare roll, rising lead run.

**🎲 New melody** — rerolls only the seed: a brand-new tune in the same
style. Roll until one clicks, then save it.

**💾 Saved themes** — every keeper gets its own card with per-theme **WAV
export**, **recipe download (JSON)**, and delete.

**🎚 Remix Lab** — load an audio file (or a direct .mp3/.ogg/.wav link) and
shape it with a full FX rack of 12 live controls: speed &amp; pitch, drive,
bit crush, low/high cut, brightness, reverb, a three-knob echo section, tape
wobble, loop, and reverse. Every slider responds *while the music plays*.
Eight presets (Chip Crush, Slowed + Reverb, Nightcore, Underwater, Old
Radio, Cavern Echo, Warm Tape, Reversed) act as starting points, not
endpoints. Export renders your exact slider settings to WAV.

**💾 Saved FX presets** — name a sound you've dialed in and keep it; apply
it to any track you load later with one tap.

**🔍 Analyze → Forge** — the Lab estimates a loaded track's key, mode, and
BPM, then seeds the Forge so you can compose an *original* theme in the same
musical space — inspired by, never copied from.

**🔁 Share everything** — themes and FX presets download as small JSON
files. The Import button recognizes both shapes (even mixed in one file) and
routes each to the right list. Because recipes are deterministic, whoever
imports yours hears *exactly* what you heard.

**📖 Built-in guides** — a collapsible walkthrough of every Forge control,
and a second one inside the Remix Lab explaining each slider in plain
language.

## Running it

Open `index.html` in any modern browser. That's it — no build step, no
install, no internet required after loading. To host it, enable GitHub Pages
on this repo (Settings → Pages → deploy from main).

On iPhone: the ring/silent switch must be ON, or iOS mutes all web audio.

## Audio sources & what's allowed

The Remix Lab works with **audio files you have the rights to use**:

- ✔ Your own recordings and exports
- ✔ CC0 / public-domain music (e.g. [OpenGameArt](https://opengameart.org),
  [Pixabay](https://pixabay.com/music/)) — direct download links from these
  sites also work in the link loader
- ✔ YouTube's own Audio Library (downloaded through YouTube Studio, which is
  the sanctioned route)
- ✘ YouTube / Spotify / SoundCloud **links** — streaming platforms block
  downloads by design and their terms prohibit ripping, even for
  copyright-free videos. Converter sites (ytmp3 and similar) violate those
  same terms. This is a hard technical and policy wall, not a missing
  feature.

Many websites block cross-site fetching (CORS), so some legitimate direct
audio links will still fail — downloading the file and using the file picker
always works.

## How it works (for the curious)

Every theme is a ~1-line JSON recipe. A seeded PRNG
([mulberry32](https://github.com/bryc/code/blob/master/jshash/PRNGs.md))
composes the melody from the recipe's scale and chord tones — strong beats
snap to chord tones, other notes walk stepwise, the final bar resolves to
the tonic. Because the randomness is seeded, composition is fully
deterministic.

All sound is synthesized live with the Web Audio API: FM synthesis (flute,
e-piano), additive synthesis (organ), subtractive synthesis (brass, strings,
saw lead), struck-bar modeling (marimba, bell), and Karplus-Strong string
modeling (guitar, harp — a filtered feedback delay line that physically
simulates a plucked string). Drums are synthesized from noise and pitched
sine sweeps.

The Remix Lab is a fixed-topology effects graph (drive → crush → filters →
shelf, with echo and convolution-reverb sends) driven entirely by
parameters, which is why sliders update live and WAV exports match playback
exactly. Key detection uses a Goertzel-filter chromagram correlated against
Krumhansl-Schmuckler key profiles; tempo detection uses onset-envelope
autocorrelation with octave-error correction. Both are estimates — the app
says so, and every value stays hand-editable.

## Contributing

Issues and pull requests welcome. The whole app is one file by design —
please keep it that way; portability is the product.

## License

MIT — see [LICENSE](LICENSE).
