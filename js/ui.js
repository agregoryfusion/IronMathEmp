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
  highlightTimeButton(currentTime);
  const backendNow = window.FastMath && window.FastMath.backend;
  backendNow?.loadLeaderboard(currentScope === "all" ? "all" : currentScope, "monthly", true);
});

lbAllTimeBtn.addEventListener("click", () => {
  currentTime = "alltime";
  highlightTimeButton(currentTime);
  const backendNow = window.FastMath && window.FastMath.backend;
  backendNow?.loadLeaderboard(currentScope === "all" ? "all" : currentScope, "alltime", true);
});

viewAllBtn.addEventListener("click", () => {
  currentScope = "all";
  highlightScopeButton("all");
  const backendNow = window.FastMath && window.FastMath.backend;
  backendNow?.loadLeaderboard("all", currentTime, false);
});

viewStudentsBtn.addEventListener("click", () => {
  currentScope = "students";
  highlightScopeButton("students");
  const backendNow = window.FastMath && window.FastMath.backend;
  backendNow?.loadLeaderboard("students", currentTime, false);
});

viewTeachersBtn.addEventListener("click", () => {
  currentScope = "teachers";
  highlightScopeButton("teachers");
  const backendNow = window.FastMath && window.FastMath.backend;
  backendNow?.loadLeaderboard("teachers", currentTime, false);
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

// initial time-button state
highlightTimeButton(currentTime);
