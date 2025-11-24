// auth.js - entry point: Firebase + emperor + start game
import "./utils.js";
import "./backend.js";
import "./game.js";
import "./ui.js";
const FM = (window.FastMath = window.FastMath || {});
const U = FM.utils;
const backend = FM.backend;

const loadingScreen = document.getElementById("loading-screen");
const emperorScreen = document.getElementById("emperor-screen");
const emperorName = document.getElementById("emperorName");
const emperorScore = document.getElementById("emperorScore");
const playBtn = document.getElementById("playBtn");

const gameContainer = document.getElementById("game-container");
const endScreen = document.getElementById("end-screen");

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
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
await setPersistence(auth, browserLocalPersistence);

FM.auth = {
  playerName: "Player",
  email: "",
  isTeacher: false,
  isStudent: false
};

function showLoading() {
  if (loadingScreen) loadingScreen.style.display = "flex";
  if (emperorScreen) emperorScreen.style.display = "none";
  if (gameContainer) gameContainer.style.display = "none";
  if (endScreen) endScreen.style.display = "none";
}

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

  showLoading();

  try {
    const [userId] = await Promise.all([
      backend.recordUserLogin(email, playerName),
      backend.fetchAndCacheLeaderboard(true)
    ]);
    window.currentUserId = userId;
  } catch (err) {
    console.error("Initial load failed:", err);
  }

  showEmperor();
}

function showEmperor() {
  const top = backend.getEmperorTopStudent();
  if (top) {
    emperorName.textContent = top.playerName;
    emperorScore.textContent = `${top.questionsAnswered} Correct`;
  } else {
    emperorName.textContent = "...";
    emperorScore.textContent = "...";
  }

  if (loadingScreen) loadingScreen.style.display = "none";
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
    // Sign-in now happens on the home page; send unauthenticated users back there.
    if (emperorScreen) emperorScreen.style.display = "none";
    if (gameContainer) gameContainer.style.display = "none";
    if (endScreen) endScreen.style.display = "none";
    window.location.href = "index.html";
  }
});

if (playBtn) {
  playBtn.addEventListener("click", ()=>{
    emperorScreen.style.display = "none";
    FM.game.startGame();
  });
}
