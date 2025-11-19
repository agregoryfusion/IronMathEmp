const lbMonthlyBtn = document.getElementById("lbMonthlyBtn");
const lbAllTimeBtn = document.getElementById("lbAllTimeBtn");
const viewAllBtn = document.getElementById("viewAllBtn");
const viewStudentsBtn = document.getElementById("viewStudentsBtn");
const viewTeachersBtn = document.getElementById("viewTeachersBtn");

let currentScope = "all";
let currentTime = "monthly";

lbMonthlyBtn.addEventListener("click", () => {
  currentTime = "monthly";
  lbMonthlyBtn.classList.add("active");
  lbAllTimeBtn.classList.remove("active");
  backend.loadLeaderboard(currentScope, currentTime, true);
});

lbAllTimeBtn.addEventListener("click", () => {
  currentTime = "alltime";
  lbAllTimeBtn.classList.add("active");
  lbMonthlyBtn.classList.remove("active");
  backend.loadLeaderboard(currentScope, currentTime, true);
});

viewAllBtn.addEventListener("click", () => {
  currentScope = "all";
  highlightScopeButton("all");
  backend.loadLeaderboard(currentScope, currentTime);
});

viewStudentsBtn.addEventListener("click", () => {
  currentScope = "students";
  highlightScopeButton("students");
  backend.loadLeaderboard(currentScope, currentTime);
});

viewTeachersBtn.addEventListener("click", () => {
  currentScope = "teachers";
  highlightScopeButton("teachers");
  backend.loadLeaderboard(currentScope, currentTime);
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
