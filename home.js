// ============================================================
// Home page: wire up the name input + color swatches.
// Reads/writes the shared PlayerProfile cookie.
// ============================================================
(() => {
  "use strict";

  const nameInput = document.getElementById("player-name");
  const swatches = document.getElementById("swatches");
  const previewDot = document.getElementById("preview-dot");
  const previewText = document.getElementById("preview-text");

  let profile = PlayerProfile.get();

  // Build color swatches
  PlayerProfile.PALETTE.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "swatch";
    btn.style.background = color;
    btn.dataset.color = color;
    btn.setAttribute("aria-label", "Pick color " + color);
    btn.addEventListener("click", () => selectColor(color));
    swatches.appendChild(btn);
  });

  function selectColor(color) {
    profile = PlayerProfile.save({ color });
    render();
  }

  function render() {
    // Highlight the active swatch
    for (const el of swatches.children) {
      el.classList.toggle("active", el.dataset.color.toLowerCase() === profile.color.toLowerCase());
    }
    previewDot.style.background = profile.color;
    previewText.textContent = profile.name || "Player";
    previewText.style.color = profile.color;
  }

  // Init name field
  nameInput.value = profile.name === "Player" ? "" : profile.name;
  nameInput.addEventListener("input", () => {
    profile = PlayerProfile.save({ name: nameInput.value });
    render();
  });

  render();
})();
