/* ============================================================================
   Musical Forge Studio — Community Board client (Phase 1)

   Device-held "creator key": a random secret kept in localStorage. A display
   name is claimed first-come; only the device holding that name's secret can
   post under it (enforced server-side by share_creation() — see
   supabase/schema.sql). No accounts, no email, no IP, no personal data.

   This is a self-contained reference module, verified in isolation. It will be
   inlined into index.html during the live-integration pass; keeping it separate
   for now avoids churn in the app file and lets it be unit-tested on its own.

   Config shape:  { url: "https://<ref>.supabase.co", anonKey: "<publishable>" }
   The anon key is a PUBLISHABLE key and is safe to ship in the client.
   ============================================================================ */
(function (root) {
  "use strict";

  var LS_KEY = "mfs_creator_identities_v1";   // { nameKey: secret, ... }

  // --- encoding / randomness -------------------------------------------------
  function toB64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomSecret() {
    var b = new Uint8Array(32);                // 256 bits of entropy
    (root.crypto || root.msCrypto).getRandomValues(b);
    return toB64url(b);
  }
  function normalizeName(name) {
    return String(name == null ? "" : name).trim().toLowerCase();
  }

  // --- device identity store -------------------------------------------------
  function loadIdentities() {
    try { return JSON.parse(root.localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveIdentities(map) {
    try { root.localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function getSecret(nameKey) { return loadIdentities()[nameKey] || null; }
  function ensureSecret(nameKey) {
    var m = loadIdentities();
    if (!m[nameKey]) { m[nameKey] = randomSecret(); saveIdentities(m); }
    return m[nameKey];
  }
  // Back up / restore names across devices (there is no password reset — the
  // secret IS the identity, so exporting it is the only way to move devices).
  function exportIdentities() {
    return JSON.stringify({ type: "mfs-creator-keys", keys: loadIdentities() }, null, 2);
  }
  function importIdentities(json) {
    var data = JSON.parse(json);
    if (!data || data.type !== "mfs-creator-keys" || typeof data.keys !== "object") {
      throw new Error("not a creator-key backup file");
    }
    var m = loadIdentities(), added = 0;
    Object.keys(data.keys).forEach(function (k) {
      if (!m[k] && typeof data.keys[k] === "string") { m[k] = data.keys[k]; added++; }
    });
    saveIdentities(m);
    return added;
  }

  // --- Supabase REST ---------------------------------------------------------
  function base(cfg) { return String(cfg.url).replace(/\/+$/, ""); }
  function headers(cfg) {
    return {
      "apikey": cfg.anonKey,
      "Authorization": "Bearer " + cfg.anonKey,
      "Content-Type": "application/json"
    };
  }

  // Post one creation. Claims the name on first use, proves ownership after.
  // Resolves to the new creation id; rejects with err.nameTaken === true when
  // the name belongs to a different device.
  function shareToBoard(cfg, item) {
    var name = item.name ? String(item.name).slice(0, 40) : "";
    var nameKey = normalizeName(name);
    var secret = nameKey ? ensureSecret(nameKey) : "";
    var body = JSON.stringify({
      p_name: name,
      p_secret: secret,
      p_kind: item.kind,
      p_title: String(item.title || "untitled").slice(0, 80),
      p_payload: item.payload
    });
    return root.fetch(base(cfg) + "/rest/v1/rpc/share_creation", {
      method: "POST", headers: headers(cfg), body: body
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) {
          var msg = t;
          try { msg = JSON.parse(t).message || t; } catch (e) {}
          var err = new Error(msg);
          err.nameTaken = /already taken/i.test(msg);
          throw err;
        }
        return t.replace(/^"|"$/g, "");   // rpc returns the uuid as a JSON string
      });
    });
  }

  // Read the most recent creations for the board.
  function fetchBoard(cfg, opts) {
    var limit = Math.min((opts && opts.limit) || 100, 200);
    var url = base(cfg) +
      "/rest/v1/creations?select=id,display_name,kind,title,payload,created_at" +
      "&order=created_at.desc&limit=" + limit;
    return root.fetch(url, { headers: headers(cfg) }).then(function (r) {
      if (!r.ok) throw new Error("board fetch failed: " + r.status);
      return r.json();
    });
  }

  root.CreatorKey = {
    randomSecret: randomSecret,
    normalizeName: normalizeName,
    getSecret: getSecret,
    ensureSecret: ensureSecret,
    exportIdentities: exportIdentities,
    importIdentities: importIdentities,
    shareToBoard: shareToBoard,
    fetchBoard: fetchBoard,
    _LS_KEY: LS_KEY
  };
})(typeof window !== "undefined" ? window : this);
