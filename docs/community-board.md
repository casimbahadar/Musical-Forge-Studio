# Community Board — design & setup (Phase 1)

A global, online board where **anyone** using the app — on any device, with **no
account** — can share a creation and browse, play, and download what others
have shared. No comments, no reactions, no profiles (yet). Names are shown
beside titles and are **impersonation-resistant** without logins or personal
data.

Status: **wired into `index.html` and verified locally** (board render, Share →
`share_creation`, owner-only `delete_creation`, load-from-card). The one thing
not verifiable in the build environment is the **live Supabase round-trip**
(egress policy blocks `*.supabase.co`), so that is confirmed on the deployed
GitHub Pages site. The `↗ Share` button posts to the board; the home **🌐
Community board** button browses it; each card can be played, downloaded, and —
if it's one of your own posts — deleted.

---

## Why there is a backend

A single board that everyone sees is **shared online state**, which a static
file cannot provide. We use **Supabase** (hosted Postgres + auto REST API) as
the store. The app talks to it with the **publishable "anon" key**, which is
designed to live in client code and is not a secret.

## Data model (`supabase/schema.sql`)

- `creations` — one row per shared item: `kind` (theme/fx/score), `title`,
  `display_name`, `payload` (the creation's own recipe JSON), `created_at`.
- `names` — the name registry: `name_key` (normalized), `display_name`, and a
  **SHA-256 hash of the creator secret**. The raw secret is never stored.

Row-level security: **everyone can read**; **no one can write tables directly**.
All writes go through one function, `share_creation()`, which enforces the rules.

## The creator-key model (how impersonation is prevented without accounts)

- The first time you post under a name, the app generates a random 256-bit
  **secret** on your device (kept in `localStorage`) and sends it with the post.
- The server hashes it and **claims the name first-come**, storing only the hash.
- Every later post under that name must present the same secret (the server
  compares hashes). A different device **cannot** post under your name — it gets
  `that name is already taken by someone else`.
- **No accounts, no email, no IP, no personal data.** The secret *is* the
  identity, so there is no password reset. To use the same name on another
  device, **export your creator key** (a small backup file) and import it there.
- A creator name is **required** to post — there is no anonymous posting. The
  server rejects nameless posts and the app re-prompts until a name is given
  (or the user cancels). Rows from before this rule may still show "Anonymous".

Client reference implementation: `community/creator-key.js` (verified: secret
generation, name normalization, persistence, export/import, and that its
requests match the `share_creation` contract and board query).

## Security model

- **No secrets in the client.** Only the publishable anon key ships; it grants
  exactly "read the board" + "call `share_creation()`" and nothing else.
- **One write path.** `share_creation()` is `SECURITY DEFINER` with a fixed
  `search_path`; clients can't touch tables directly.
- **Server-side validation.** `kind` whitelist, payload ≤ 200 KB, title ≤ 80,
  name ≤ 40, name-ownership by secret hash.
- **Display safety.** Names/titles are rendered with the app's existing HTML
  escaping (`esc()`); payloads run through the same validated import path as
  file/link loading, and nothing auto-saves to a visitor's device without the
  existing consent prompt.
- **No personal data.** Nothing that could identify a user is collected, so the
  privacy/legal surface stays minimal — this is why Phase 1 is low-risk.

### Rate limiting & count integrity (closed)

`share_creation()` enforces: **10 posts/hour per name**, **20 anonymous
posts/hour globally**, and identical payloads are rejected within 10 minutes.
**Likes are one-per-device server-side**: each like is a row in a `likes` table
keyed by (creation, hashed device token) and the `likes` column is the row
count, so replaying `set_like` from curl can't inflate the "Most liked"
benchmark. Load counts intentionally count every open. Imported payloads are
sanitized client-side (bounded string coercion of `id`/`name`) and the load
path fails gracefully on malformed input. Moderation remains a `delete` in the
dashboard (commands in `schema.sql`).

### Optional hardening (later): signatures instead of a shared secret

The shared-secret flavor sends the secret to the server (over TLS) on each post.
A stronger variant keeps the secret on the device forever: generate an ECDSA
keypair (WebCrypto), register the **public** key with the name, and **sign**
each post; an Edge Function verifies the signature. Same UX, nothing secret ever
leaves the device — at the cost of deploying one Edge Function. Deferred unless
wanted.

---

## Go live (what you do)

1. Create a free project at **supabase.com**.
2. Open the **SQL editor**, paste all of `supabase/schema.sql`, and run it.
3. In **Project Settings → API**, copy the **Project URL** and the **anon /
   publishable** key.
4. Send me those two values. **Do not** send the `service_role` key or the
   database password — those are secrets and stay in your project.

Then I inline `creator-key.js` into `index.html`, add the **Community board**
view (browse → play → download, with names beside titles) and wire the **↗
Share** button to post to the board, and verify the whole flow end-to-end in a
real browser before anything merges.

## Roadmap

- **Phase 1 (this):** global board, account-free creator names, play/download.
- **Phase 2:** real accounts + profiles (Supabase Auth) → verified identities.
- **Phase 3:** comments + reactions, with reporting/moderation tooling.

Each phase is its own reviewable step; the account/comment layers bring the
privacy, legal, and moderation responsibilities described earlier and are opt-in.
