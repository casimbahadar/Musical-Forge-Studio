# Musical Forge Studio — project snapshot

Single-file browser music app. Four tools, zero dependencies, raw Web Audio API.
Live at `https://casimbahadar.github.io/Musical-Forge-Studio/` via GitHub Pages.

## Architecture

| Path | Owns |
|---|---|
| `index.html` | **The entire app** (~4900 lines). Everything below lives here. |
| `community/creator-key.js` | Reference copy of the device creator-key logic |
| `supabase/schema.sql` | Backend: tables, RLS, `SECURITY DEFINER` functions |
| `docs/community-board.md` | Community board design + security notes |
| `docs/DECISIONS.md` | Append-only decision log — **read the tail before changing anything** |
| `tools/` | Offline generators (not shipped to the browser) |

Inside `index.html`, roughly in order:

- **Studio engine** (`buildEnv` ~1100) — shared by Theme Forge and Score Composer
- **Voice bank** (`vPiano`…`vSitar`) — one function per instrument, twice over:
  the studio set and the sequencer set (`LEADS`, ~3970). They are **separate**;
  a fix to one does not fix the other. This has bitten us before.
- **Remix Lab** — `estimateKey`, `ingestAudio`, FX rack
- **Sequencer** (`SEQ`, ~3800+) — its own `buildEnv`, `DRUM_ROWS`, pagination
- **Sharing** — `classifyShared` / `sanitizeShared` / `importItems` is the single
  validation gate for file, link and board imports. Add new content kinds there.
- **Community** — `COMMUNITY`, `cmShare`, `cmFetchPage`, `cmSetLike`, `cmDeviceToken`

## Conventions

- No build step, no bundler, no dependencies. It must stay one openable file.
- No audio libraries. Raw Web Audio only.
- Mobile-first; widens responsively. Every tool page carries a plain-language guide.
- Deterministic generation: same recipe + seed ⇒ identical music, forever. Never
  change a generator's RNG consumption order without accepting that every
  previously shared seed now renders differently.
- Both audio engines end in a `DynamicsCompressor` limiter before `destination`.
  Keep it. Dense material clips without it and `encodeWav` hard-clamps.

## Standing rules

- Audit before refactoring; verify by re-deriving, not by re-reading.
- Claims about audio must be **measured** (peak, RMS, note content), never
  asserted. Nobody in this loop can hear the output.
- The Supabase anon key in `index.html` is public by design. The `service_role`
  key and DB password must never appear in the repo.
- Never commit a GitHub token or any secret to this static file.

## Current state

Four tools shipping. Community board live on Supabase. 100 generated songs and
26 extended Lumoria themes rendered and delivered (generators in `tools/`).

Known rough edge: A2 renders at −20.2 dB, the quietest of the theme set — a
guitar lead over an organ bass is inherently soft, and lifting it further would
mean overriding the lead voice, which is a theme's identity.
