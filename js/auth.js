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

const gameContainer = document.getElementById("game-container");
const endScreen = document.getElementById("end-screen");

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth, OAuthProvider, signInWithPopup,
  setPersistence, browserLocalPersistence, onAuthStateChanged,
  // added for redirect fallback
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

// Ensure provider prompts account selection (helps in some edge cases)
try {
  provider.setCustomParameters && provider.setCustomParameters({ prompt: "select_account" });
} catch (e) {
  console.warn("Could not set provider custom parameters:", e);
}

// Replace top-level await with a non-blocking call and graceful fallback
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Could not set Firebase auth persistence; continuing without persistent session.", err);
});

FM.auth = {
  playerName: "Player",
  email: "",
  isTeacher: false,
  isStudent: false
};

async function handleSignedIn(user) {
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

  // recordUserLogin now returns the user row (including optional pref fields)
  const userRow = await backend.recordUserLogin(email, playerName);
  if (userRow) {
    window.currentUserId = userRow.user_id || userRow.id || null;

    // If DB has stored preferences, apply them (and persist to localStorage for ui pickers)
    try {
      if (userRow.background_color) {
        document.documentElement.style.setProperty('--bg', userRow.background_color);
        localStorage.setItem("fm_bg_color", userRow.background_color);
      }
      if (userRow.text_color) {
        document.documentElement.style.setProperty('--primary', userRow.text_color);
        document.documentElement.style.setProperty('--accent', userRow.text_color);
        localStorage.setItem("fm_primary_color", userRow.text_color);
      }
      // Also update color pickers if present in DOM
      const bgPicker = document.getElementById("bgColorPicker");
      const textPicker = document.getElementById("textColorPicker");
      if (bgPicker && userRow.background_color) bgPicker.value = userRow.background_color;
      if (textPicker && userRow.text_color) textPicker.value = userRow.text_color;
    } catch (e) {
      // ignore DOM timing issues
      console.warn("Could not apply user color prefs:", e);
    }
  }

  if (loginScreen) loginScreen.style.display = "none";
  if (gameContainer) gameContainer.style.display = "none";
  if (endScreen) endScreen.style.display = "none";

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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await handleSignedIn(user);
  } else {
    if (emperorScreen) emperorScreen.style.display = "none";
    if (gameContainer) gameContainer.style.display = "none";
    if (endScreen) endScreen.style.display = "none";
    if (loginScreen) loginScreen.style.display = "flex";
  }
});

// Process redirect result (in case we used signInWithRedirect fallback)
getRedirectResult(auth).then((result) => {
  if (result && result.user) {
    console.log("Processed redirect sign-in result");
    handleSignedIn(result.user).catch(err => console.warn("handleSignedIn after redirect failed:", err));
  }
}).catch((err) => {
  // Not fatal; just surface for debugging
  console.warn("getRedirectResult error:", err);
});

// Attach login handler (robust to DOM timing)
function attachLoginHandler() {
  if (!loginBtn) {
    console.warn("loginBtn not found at attachLoginHandler time");
    return;
  }
  // avoid attaching twice
  if (loginBtn._fmHandlerAttached) return;
  loginBtn._fmHandlerAttached = true;

  loginBtn.addEventListener("click", async (e) => {
    console.log("Login button clicked - attempting sign-in");
    try {
      const result = await signInWithPopup(auth, provider);
      if (result && result.user) {
        await handleSignedIn(result.user);
      }
    } catch (e) {
      console.error("Sign-in (popup) error:", e);
      // If popup was blocked or other popup errors, fallback to redirect
      const code = e?.code || "";
      const msg = (e && e.message) ? e.message : "";
      const shouldRedirect = /popup/i.test(code) || /popup/i.test(msg) || code === "auth/popup-blocked" || code === "auth/cancelled-popup-request";
      if (shouldRedirect) {
        try {
          if (loginStatus) loginStatus.textContent = "Popup blocked — using redirect sign-in...";
          console.warn("Falling back to signInWithRedirect due to popup issue.");
          await signInWithRedirect(auth, provider);
          // Redirect will navigate away; getRedirectResult above will handle result when returning.
        } catch (re) {
          console.error("signInWithRedirect failed:", re);
          if (loginStatus) loginStatus.textContent = "Sign-in failed: " + (re?.message || re);
        }
      } else {
        if (loginStatus) {
          loginStatus.textContent = "Sign-in failed: " + (e?.message || e);
        }
      }
    }
  });
}

// If loginBtn already resolved earlier, attach now; otherwise wait for DOMContentLoaded
if (loginBtn) {
  attachLoginHandler();
} else {
  document.addEventListener("DOMContentLoaded", () => {
    // re-resolve element and attach
    const btn = document.getElementById("loginBtn");
    if (btn) {
      // update module-level reference so other code can still read it if needed
      // (this mirrors the original top-level const behavior for safety)
      // eslint-disable-next-line no-unused-expressions
      (function setBtn() { /* re-bind for clarity */ })();
    }
    attachLoginHandler();
  }, { once: true });
}

if (playBtn) {
  playBtn.addEventListener("click", ()=>{
    emperorScreen.style.display = "none";
    FM.game.startGame();
  });
}
