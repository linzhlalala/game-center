// ============================================================
// Shared player profile: name + main color.
// Stored in localStorage so every game can read the same settings.
// (localStorage has no path scoping and works under file:// too,
// unlike cookies which broke on sub-paths / local files.)
// Include this on the home page and in each game.
// ============================================================
(function (global) {
  "use strict";

  const KEY = "gc_player";

  // Preset palette the player can pick from on the home page.
  const PALETTE = [
    "#ff6b35", "#ffd23f", "#3ddc84", "#4dabf7", "#e64980",
    "#9775fa", "#20c997", "#ff922b", "#f06595", "#5c7cfa",
    "#94d82d", "#22b8cf", "#ff5a5a", "#12b886", "#ffffff",
  ];

  const DEFAULT = { name: "Player", color: "#3ddc84" };

  function readStore() {
    try {
      const raw = global.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStore(profile) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(profile));
    } catch (e) {
      // storage may be unavailable (private mode); fail silently
    }
  }

  function isValidColor(c) {
    return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  const PlayerProfile = {
    PALETTE,

    // Returns a safe profile, filling in defaults for anything missing/invalid.
    get() {
      const raw = readStore() || {};
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
      writeStore(next);
      return next;
    },
  };

  global.PlayerProfile = PlayerProfile;
})(window);
