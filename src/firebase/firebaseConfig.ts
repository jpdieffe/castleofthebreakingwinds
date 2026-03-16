import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ─────────────────────────────────────────────────────────────────────────────
// TODO: Replace these values with your own Firebase project config.
// Get them from: Firebase Console → Project Settings → Your Apps → Web App
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCwbA2BNHxtO50zXc2oLBEQjcnaVSpTcaA",
  authDomain: "castlewinds-f71e6.firebaseapp.com",
  projectId: "castlewinds-f71e6",
  storageBucket: "castlewinds-f71e6.firebasestorage.app",
  messagingSenderId: "923990290130",
  appId: "1:923990290130:web:7534e4e302f87fc3f3870b",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
