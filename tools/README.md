# tools/

Offline generators that drive the app's own audio engine. Nothing here ships to
the browser — `index.html` remains a standalone single-file app with no build
step and no dependencies. These scripts exist to mass-produce content *through*
that app rather than around it, so anything they generate sounds exactly like
something a user could have sequenced by hand.

## Layout

```
tools/
  render-mp3.js          headless renderer: loads a song into Forge Sequencer,
                         triggers Export, encodes MP3, logs peak/RMS/clipping
  themes/
    make-specs.js        Lumoria themes.json -> arrangement specs (applies the
                         sustain rule and the per-theme overrides)
    build-themes.js      specs -> app-native song JSON (structure, cadence, mix)
    specs-base/          first-pass specs (titles, pad/counter/arp voices, arcs)
    specs/               final specs — canonical input to build-themes.js
  songs/
    gen-songs.js         100-song generator, 24 styles x 12 scales
    names.js             100 unique titles
```

## Regenerating

```sh
# 26 Lumoria themes (specs/ is already committed; this only re-derives them)
cd tools/themes
node make-specs.js /path/to/themes.json ./specs-base ./specs
node build-themes.js ./specs /tmp/theme-songs

# 100 songs — first arg is the COUNT, not a seed. Seeds are derived per song
# (0x5EED + i*7919) so output is deterministic without one. Do not exceed 100:
# names.js holds exactly 100 unique titles and the generator refuses to reuse.
cd tools/songs && node gen-songs.js 100 /tmp/songs

# audio — needs playwright-core (a require) and lamejs (injected into the page)
npm i playwright-core lamejs        # in some dir, then point the vars at it
NODE_PATH=/that/dir/node_modules LAMEJS_DIR=/that/dir \
  node tools/render-mp3.js /tmp/theme-songs /tmp/theme-songs/_render_index.json \
                           /tmp/out 0 26 batch1
```

`render-mp3.js` reads four environment variables:

| var | purpose |
|---|---|
| `NODE_PATH` | must resolve `playwright-core` — the repo itself has no `node_modules` |
| `LAMEJS_DIR` | dir containing `node_modules/lamejs/lame.min.js`, injected into the page |
| `APP_URL` | defaults to the repo's own `index.html` |
| `CHROMIUM` | headless_shell binary path |

It resumes by skipping outputs that already exist and rebuilds its page after a
failure, so a killed batch can simply be re-run. Dense arrangements can take
20+ minutes each; the internal wait is 35 minutes per song. Expect roughly
realtime throughput per worker, and do not run more workers than cores minus
one — CPU starvation is what caused the render timeouts during the first batch.

## Two rules worth keeping

**Sustain rule** (`make-specs.js`). A held or walking bass on a decaying voice —
marimba, pizzicato, guitar, harp — dies inside a second and leaves the rest of
the bar empty. Since the lead voice is a theme's identity and must not change,
the rule is: *if the lead decays, the bass must sustain.*

This was found by measurement, not by ear. Sorting all 26 rendered themes by RMS
put the three themes where lead **and** bass both decay at the bottom, in exactly
the order their decay predicted:

| theme | lead | bass | before | after |
|---|---|---|---|---|
| A2 Forest | guitar | pizz → organ | −25.3 dB | −20.2 dB |
| A10 Town | marimba | pizz → organ | −22.4 dB | −19.2 dB |
| A14 Post-Game | epiano | guitar → organ | −20.5 dB | −18.0 dB |
| A15 Forgotten Lumori | harp | marimba → organ | −23.8 dB | −18.1 dB |

The first version of this rule only checked `whole`-note bass and missed the
three walking-bass cases entirely. The narrow version is the tempting one; it is
also the wrong one.

**Cadence rule** (`build-themes.js`). Bar counts are a multiple of 4 and most
progressions are 4 chords long, so the final bar always landed on `prog[3]` —
the dominant in 22 of the 26 themes. Every arrangement stopped unresolved, on a
single lone note. The progression is no longer allowed to decide the ending: the
last two bars are forced to a V–I cadence and the final bar is voiced as a full
sustained tonic chord.
