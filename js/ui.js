const lbMonthlyBtn = document.getElementById("lbMonthlyBtn");
const lbAllTimeBtn = document.getElementById("lbAllTimeBtn");
const viewAllBtn = document.getElementById("viewAllBtn");
const viewStudentsBtn = document.getElementById("viewStudentsBtn");
const viewTeachersBtn = document.getElementById("viewTeachersBtn");
const FM = (window.FastMath = window.FastMath || {});
const backend = FM.backend || {};

let currentScope = "all";
let currentTime = "monthly";

// --- NEW: helper to update time-button UI state ---
function highlightTimeButton(time) {
  if (!lbMonthlyBtn && !lbAllTimeBtn) return;
  lbMonthlyBtn?.classList.remove("active");
  lbAllTimeBtn?.classList.remove("active");
  if ((time || "").toString().trim().toLowerCase() === "alltime") {
    lbAllTimeBtn?.classList.add("active");
  } else {
    lbMonthlyBtn?.classList.add("active");
  }
}
// --- end NEW ---

lbMonthlyBtn.addEventListener("click", () => {
  currentTime = "monthly";
  // Visual update immediately
  highlightTimeButton(currentTime);
  // Request monthly leaderboard (force refresh)
  backend.loadLeaderboard(currentScope === "all" ? "all" : currentScope, "monthly", true);
});

lbAllTimeBtn.addEventListener("click", () => {
  currentTime = "alltime";
  // Visual update immediately
  highlightTimeButton(currentTime);
  // Request all-time leaderboard (force refresh)
  backend.loadLeaderboard(currentScope === "all" ? "all" : currentScope, "alltime", true);
});

viewAllBtn.addEventListener("click", () => {
  currentScope = "all";
  highlightScopeButton("all");
  backend.loadLeaderboard("all", currentTime, false);
});

viewStudentsBtn.addEventListener("click", () => {
  currentScope = "students";
  highlightScopeButton("students");
  backend.loadLeaderboard("students", currentTime, false);
});

viewTeachersBtn.addEventListener("click", () => {
  currentScope = "teachers";
  highlightScopeButton("teachers");
  backend.loadLeaderboard("teachers", currentTime, false);
});
function highlightScopeButton(scope) {
  viewAllBtn.classList.remove("active");
  viewStudentsBtn.classList.remove("active");
  viewTeachersBtn.classList.remove("active");

  if (scope === "all") viewAllBtn.classList.add("active");
  if (scope === "students") viewStudentsBtn.classList.add("active");
  if (scope === "teachers") viewTeachersBtn.classList.add("active");
}

// Ensure the "Everyone" button glows by default on load
// (call after highlightScopeButton is declared)
highlightScopeButton(currentScope);

// --- NEW: patch backend.loadLeaderboard so all callers update the time UI ---
if (backend && typeof backend.loadLeaderboard === "function") {
  const _origLoad = backend.loadLeaderboard.bind(backend);
  backend.loadLeaderboard = async function (scopeFilter = "all", timeFilter = "monthly", forceRefresh = false) {
    // normalize like backend.loadLeaderboard expects
    let normalized = timeFilter;
    if (typeof normalized === "boolean") {
      forceRefresh = normalized;
      normalized = "monthly";
    }
    if (typeof normalized === "string") {
      normalized = normalized.trim().toLowerCase();
      if (normalized === "all" || normalized === "alltime" || normalized === "all-time") normalized = "alltime";
      else normalized = "monthly";
    } else normalized = "monthly";

    // update UI
    highlightTimeButton(normalized);

    // call original implementation
    return await _origLoad(scopeFilter, timeFilter, forceRefresh);
  };
}
// --- end NEW ---

// initial time-button state
highlightTimeButton(currentTime);

// --- NEW: settings panel toggle (gear -> X) ---
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
let settingsOpen = false;
let _origTitle = document.querySelector("h1") ? document.querySelector("h1").textContent : "Fusion Fast Math";

// new: keep initial color values when opening settings so we know if they changed
let _initialBgColor = null;
let _initialPrimaryColor = null;

function getGearSVG() {
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.7 0 1.3-.42 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 6.9 2.1l.06.06c.5.5 1.2.67 1.82.33.5-.27 1.07-.33 1.6-.18V2a2 2 0 0 1 4 0v.09c.53-.15 1.1-.09 1.6.18.62.34 1.32.17 1.82-.33l.06-.06A2 2 0 0 1 20 6.1l-.06.06c-.27.5-.33 1.07-.18 1.6.24.59.9 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.7 0-1.3.42-1.51 1z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}
function getCloseSVG() {
  return `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function openSettings() {
  if (!settingsPanel || !settingsToggle) return;

  // toggle global settings mode to hide everything except title & version
  document.body.classList.add("settings-mode");

  // change title to "Settings"
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = "Settings";

  // capture initial color state (computed or stored)
  _initialBgColor = getCSSVar('--bg') || localStorage.getItem("fm_bg_color") || "#0e0f12";
  _initialPrimaryColor = getCSSVar('--primary') || localStorage.getItem("fm_primary_color") || "#1e90ff";

  // Ensure pickers reflect current values (if elements exist)
  const bgPick = document.getElementById("bgColorPicker");
  const txtPick = document.getElementById("textColorPicker");
  if (bgPick) bgPick.value = normalizeColorToHex(_initialBgColor) || "#0e0f12";
  if (txtPick) txtPick.value = normalizeColorToHex(_initialPrimaryColor) || "#1e90ff";

  settingsPanel.setAttribute("aria-hidden", "false");
  settingsPanel.style.display = "block";
  settingsToggle.innerHTML = getCloseSVG();
  settingsToggle.setAttribute("aria-label", "Close settings");
  settingsOpen = true;
}

async function closeSettings() {
  if (!settingsPanel || !settingsToggle) return;

  // read current picker values
  const bgPick = document.getElementById("bgColorPicker");
  const txtPick = document.getElementById("textColorPicker");
  const newBg = bgPick ? bgPick.value : normalizeColorToHex(getCSSVar('--bg'));
  const newPrimary = txtPick ? txtPick.value : normalizeColorToHex(getCSSVar('--primary'));

  settingsPanel.setAttribute("aria-hidden", "true");
  settingsPanel.style.display = "none";

  document.body.classList.remove("settings-mode");

  // restore original title
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = _origTitle || "Fusion Fast Math";

  settingsToggle.innerHTML = getGearSVG();
  settingsToggle.setAttribute("aria-label", "Open settings");
  settingsOpen = false;

  // If the user changed colors, persist them locally and to DB if signed in
  const bgChanged = _initialBgColor && normalizeColorToHex(_initialBgColor) !== normalizeColorToHex(newBg);
  const primaryChanged = _initialPrimaryColor && normalizeColorToHex(_initialPrimaryColor) !== normalizeColorToHex(newPrimary);

  if (bgChanged || primaryChanged) {
    // apply to CSS immediately
    applyColorSettings(newBg || null, newPrimary || null, true);

    // if signed in, persist to Supabase via backend.updateUserPreferences
    const userId = window.currentUserId || null;
    if (userId && backend && typeof backend.updateUserPreferences === "function") {
      const prefs = {};
      if (bgChanged && newBg) prefs.background_color = newBg;
      if (primaryChanged && newPrimary) prefs.text_color = newPrimary;
      try {
        await backend.updateUserPreferences(userId, prefs);
      } catch (e) {
        console.warn("Failed to persist color prefs:", e);
      }
    }
  }
}

function toggleSettings() {
  if (settingsOpen) closeSettings(); else openSettings();
}

if (settingsToggle) {
  // ensure the toggle is visible only when we have the element available
  settingsToggle.style.display = "inline-flex";
  settingsToggle.addEventListener("click", (e) => {
    e.preventDefault();
    toggleSettings();
  });
}
// --- end NEW ---

// --- NEW: color-picker settings wiring ---
const bgPicker = document.getElementById("bgColorPicker");
const textPicker = document.getElementById("textColorPicker");
const resetColorsBtn = document.getElementById("resetColorsBtn");

function normalizeColorToHex(raw) {
  if (!raw) return null;
  raw = raw.trim();
  // already hex
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    // expand 3-char hex
    if (raw.length === 4) {
      return "#" + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3];
    }
    return raw;
  }
  // rgb(...) -> hex
  const m = raw.match(/rgba?\s*\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (m) {
    const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    const toHex = n => ("0" + n.toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return null;
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || null;
}

function applyColorSettings(bgColor, primaryColor, persist = true) {
  if (bgColor) document.documentElement.style.setProperty('--bg', bgColor);
  if (primaryColor) document.documentElement.style.setProperty('--primary', primaryColor);
  // optional: also adjust fallback --accent so components using it react
  if (primaryColor) document.documentElement.style.setProperty('--accent', primaryColor);
  if (persist) {
    if (bgColor) localStorage.setItem("fm_bg_color", bgColor);
    if (primaryColor) localStorage.setItem("fm_primary_color", primaryColor);
  }
}

function initColorPickers() {
  // load persisted or computed values
  const savedBg = localStorage.getItem("fm_bg_color");
  const savedPrimary = localStorage.getItem("fm_primary_color");

  const curBg = savedBg || normalizeColorToHex(getCSSVar('--bg')) || "#0e0f12";
  const curPrimary = savedPrimary || normalizeColorToHex(getCSSVar('--primary')) || "#1e90ff";

  // Apply current values to CSS (ensures UI matches)
  applyColorSettings(curBg, curPrimary, false);

  // Set pickers values
  if (bgPicker) bgPicker.value = normalizeColorToHex(curBg) || "#0e0f12";
  if (textPicker) textPicker.value = normalizeColorToHex(curPrimary) || "#1e90ff";
}

if (bgPicker) {
  bgPicker.addEventListener("input", (e) => {
    const v = e.target.value;
    applyColorSettings(v, null, true);
  });
}
if (textPicker) {
  textPicker.addEventListener("input", (e) => {
    const v = e.target.value;
    // update primary/accent used by title, version, leaderboard headers and question numbers
    applyColorSettings(null, v, true);
  });
}
if (resetColorsBtn) {
  resetColorsBtn.addEventListener("click", () => {
    // reset to defaults (matching initial CSS root defaults)
    const defaultBg = "#0e0f12";
    const defaultPrimary = "#1e90ff";
    applyColorSettings(defaultBg, defaultPrimary, true);
    if (bgPicker) bgPicker.value = defaultBg;
    if (textPicker) textPicker.value = defaultPrimary;
  });
}

// initialize once DOM is ready
try { initColorPickers(); } catch (e) { /* ignore */ }
// --- end NEW ---
