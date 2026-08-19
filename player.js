// ============================================================
// Shared player profile: name + main color.
// Stored in a cookie so every game can read the same settings.
// Include this on the home page and in each game.
// ============================================================
(function (global) {
  "use strict";

  const COOKIE = "gc_player";
  const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

  // Preset palette the player can pick from on the home page.
  const PALETTE = [
    "#ff6b35", "#ffd23f", "#3ddc84", "#4dabf7", "#e64980",
    "#9775fa", "#20c997", "#ff922b", "#f06595", "#5c7cfa",
    "#94d82d", "#22b8cf", "#ff5a5a", "#12b886", "#ffffff",
  ];

  const DEFAULT = { name: "Player", color: "#3ddc84" };

  function readCookie() {
    const m = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
    if (!m) return null;
    try {
      return JSON.parse(decodeURIComponent(m[1]));
    } catch (e) {
      return null;
    }
  }

  function writeCookie(profile) {
    const val = encodeURIComponent(JSON.stringify(profile));
    document.cookie = `${COOKIE}=${val}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  }

  function isValidColor(c) {
    return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  const PlayerProfile = {
    PALETTE,

    // Returns a safe profile, filling in defaults for anything missing/invalid.
    get() {
      const raw = readCookie() || {};
      const name = typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim().slice(0, 16)
        : DEFAULT.name;
      const color = isValidColor(raw.color) ? raw.color : DEFAULT.color;
      return { name, color };
    },

    getColor() {
      return this.get().color;
    },

    getName() {
      return this.get().name;
    },

    save(profile) {
      const cur = this.get();
      const next = {
        name: (profile.name != null ? String(profile.name) : cur.name).trim().slice(0, 16) || DEFAULT.name,
        color: isValidColor(profile.color) ? profile.color : cur.color,
      };
      writeCookie(next);
      return next;
    },
  };

  global.PlayerProfile = PlayerProfile;
})(window);
