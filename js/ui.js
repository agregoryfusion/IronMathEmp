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

  settingsPanel.setAttribute("aria-hidden", "false");
  settingsPanel.style.display = "block";
  settingsToggle.innerHTML = getCloseSVG();
  settingsToggle.setAttribute("aria-label", "Close settings");
  settingsOpen = true;
}

function closeSettings() {
  if (!settingsPanel || !settingsToggle) return;

  document.body.classList.remove("settings-mode");

  // restore original title
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = _origTitle || "Fusion Fast Math";

  settingsPanel.setAttribute("aria-hidden", "true");
  settingsPanel.style.display = "none";
  settingsToggle.innerHTML = getGearSVG();
  settingsToggle.setAttribute("aria-label", "Open settings");
  settingsOpen = false;
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
