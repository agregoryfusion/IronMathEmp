// auth.js - entry point: Firebase + emperor + start game
import "./utils.js";
import "./backend.js";
import "./game.js";
import "./ui.js";
const FM = (window.FastMath = window.FastMath || {});
const U = FM.utils;
const backend = FM.backend;

// DOM elements
const loginScreen = document.getElementById("login-screen");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const emperorScreen = document.getElementById("emperor-screen");
const emperorName = document.getElementById("emperorName");
const emperorScore = document.getElementById("emperorScore");
const playBtn = document.getElementById("playBtn");
// new: teacher-only data button
const dataBtn = document.getElementById("dataBtn");

const gameContainer = document.getElementById("game-container");
const endScreen = document.getElementById("end-screen");

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth, OAuthProvider, signInWithPopup,
  setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBUaOrUckCuTrc9MHB9jCF4TUsx-hWFC7g",
  authDomain: "ironmath-1263b.firebaseapp.com",
  projectId: "ironmath-1263b",
  storageBucket: "ironmath-1263b.firebasestorage.app",
  messagingSenderId: "729878130193",
  appId: "1:729878130193:web:f4d447b552e4f955f80bb0",
  measurementId: "G-0VCM7C1HPC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new OAuthProvider("microsoft.com");

// diagnostic at module load
console.log("[auth] module loaded. auth:", !!auth, "provider:", !!provider);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("[auth] setPersistence failed:", err);
});

try {
  provider.setCustomParameters?.({ prompt: "select_account" });
} catch (e) {
  console.warn("[auth] provider.setCustomParameters failed:", e);
}

getRedirectResult(auth).then((result) => {
  console.log("[auth] getRedirectResult:", !!result);
  if (result && result.user) {
    console.log("[auth] redirect result user:", result.user.email);
    handleSignedIn(result.user).catch(err => console.warn("[auth] handleSignedIn after redirect failed:", err));
  }
}).catch((err) => {
  console.warn("[auth] getRedirectResult error:", err);
});

FM.auth = {
  playerName: "Player",
  email: "",
  isTeacher: false,
  isStudent: false
};

async function handleSignedIn(user) {
  console.log("[auth] handleSignedIn called for:", user?.email);
  const email = user.email?.toLowerCase() || "";
  let isTeacher = false;
  let isStudent = false;

  if (email.endsWith("@fusionacademy.com")) {
    isTeacher = true;
    isStudent = false;
  } else if (email.endsWith("@fusionacademy.me")) {
    isStudent = true;
    isTeacher = false;
  }

  const playerName = user.displayName || (U && U.parseEmailToName ? U.parseEmailToName(user.email) : "Player");

  FM.auth.playerName = playerName;
  FM.auth.email = email;
  FM.auth.isTeacher = isTeacher;
  FM.auth.isStudent = isStudent;

  const userId = await backend.recordUserLogin(email, playerName);
  window.currentUserId = userId;

  if (loginScreen) loginScreen.style.display = "none";
  if (gameContainer) gameContainer.style.display = "none";
  if (endScreen) endScreen.style.display = "none";

  // show or hide Data button for teachers
  try {
    if (dataBtn) dataBtn.style.display = isTeacher ? "inline-block" : "none";
  } catch (e) { /* ignore timing */ }

  await backend.fetchAndCacheLeaderboard(true);
  showEmperor();
}

function showEmperor() {
  const top = backend.getEmperorTopStudent();
  if (top) {
    emperorName.textContent = top.playerName;
    emperorScore.textContent = `${top.questionsAnswered} Correct`;
  } else {
    emperorName.textContent = "—";
    emperorScore.textContent = "—";
  }

  emperorScreen.style.display = "block";
  if (gameContainer) gameContainer.style.display = "none";
}

// Expose UI helper for game restart
FM.ui = {
  showEmperor
};

try {
  onAuthStateChanged(auth, async (user) => {
    console.log("[auth] onAuthStateChanged; user:", user ? user.email : null);
    if (user) {
      await handleSignedIn(user);
    } else {
      if (emperorScreen) emperorScreen.style.display = "none";
      if (gameContainer) gameContainer.style.display = "none";
      if (endScreen) endScreen.style.display = "none";
      if (loginScreen) loginScreen.style.display = "flex";
    }
  });
} catch (e) {
  console.error("[auth] onAuthStateChanged failed:", e);
}

// attachLoginHandler ensures the click handler is bound and logs extensively
function attachLoginHandler() {
  const btn = document.getElementById("loginBtn");
  if (!btn) {
    console.warn("[auth] attachLoginHandler: loginBtn not found");
    return;
  }
  if (btn._fmHandlerAttached) return;
  btn._fmHandlerAttached = true;

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    console.log("[auth] loginBtn clicked");
    if (!auth || !provider) {
      console.error("[auth] auth or provider missing");
      if (loginStatus) loginStatus.textContent = "Auth not initialized";
      return;
    }
    try {
      const result = await signInWithPopup(auth, provider);
      console.log("[auth] signInWithPopup result:", !!result);
      if (result && result.user) {
        await handleSignedIn(result.user);
      } else {
        console.warn("[auth] signInWithPopup returned no user, falling back to redirect");
        await signInWithRedirect(auth, provider);
      }
    } catch (e) {
      console.error("[auth] signInWithPopup error:", e);
      if (loginStatus) loginStatus.textContent = "Sign-in failed: " + (e?.message || e);
      const msg = (e && e.message) ? String(e.message).toLowerCase() : "";
      const code = e?.code || "";
      const popupBlocked = /popup/i.test(msg) || /popup/i.test(code) || code === "auth/popup-blocked" || code === "auth/cancelled-popup-request";
      if (popupBlocked) {
        try {
          console.warn("[auth] popup blocked — using redirect fallback");
          if (loginStatus) loginStatus.textContent = "Popup blocked — redirecting...";
          await signInWithRedirect(auth, provider);
        } catch (re) {
          console.error("[auth] signInWithRedirect failed:", re);
          if (loginStatus) loginStatus.textContent = "Sign-in redirect failed: " + (re?.message || re);
        }
      }
    }
  });
}

// Attach now or when DOM ready
attachLoginHandler();
if (!loginBtn) {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[auth] DOMContentLoaded - attempting attachLoginHandler");
    attachLoginHandler();
  }, { once: true });
}

// re-add Data & Play wiring (safe id reads)
(function attachOtherButtons(){
  const data = document.getElementById("dataBtn");
  if (data) data.addEventListener("click", (e) => { e.preventDefault(); window.location.href = "data.html"; });
  const play = document.getElementById("playBtn");
  if (play) play.addEventListener("click", () => { if (emperorScreen) emperorScreen.style.display = "none"; FM.game.startGame(); });
})();
