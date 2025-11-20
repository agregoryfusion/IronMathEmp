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
