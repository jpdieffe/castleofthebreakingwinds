import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "./firebaseConfig";

let currentUser: User | null = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

export async function ensureSignedIn(): Promise<User> {
  if (currentUser) return currentUser;
  const cred = await signInAnonymously(auth);
  currentUser = cred.user;
  return currentUser;
}

export function getCurrentUser(): User | null {
  return currentUser;
}
