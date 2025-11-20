const lbMonthlyBtn = document.getElementById("lbMonthlyBtn");
const lbAllTimeBtn = document.getElementById("lbAllTimeBtn");
const viewAllBtn = document.getElementById("viewAllBtn");
const viewStudentsBtn = document.getElementById("viewStudentsBtn");
const viewTeachersBtn = document.getElementById("viewTeachersBtn");
const FM = (window.FastMath = window.FastMath || {});
const backend = FM.backend || {};

let currentScope = "all";
let currentTime = "monthly";

lbMonthlyBtn.addEventListener("click", () => {
  currentTime = "monthly";
  // Request monthly leaderboard (force refresh)
  backend.loadLeaderboard(currentScope === "all" ? "all" : currentScope, "monthly", true);
});

lbAllTimeBtn.addEventListener("click", () => {
  currentTime = "alltime";
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
