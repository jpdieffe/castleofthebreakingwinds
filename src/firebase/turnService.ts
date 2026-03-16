import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "./firebaseConfig";
import type { TurnLog, GameSession } from "../types";

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(session: GameSession): Promise<void> {
  await setDoc(doc(db, "sessions", session.gameId), session);
}

export async function joinSession(
  gameId: string,
  playerBUid: string
): Promise<GameSession | null> {
  const ref = doc(db, "sessions", gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const session = snap.data() as GameSession;
  if (session.playerBUid) return null; // already full

  await setDoc(ref, { ...session, playerBUid, status: "active" });
  return { ...session, playerBUid, status: "active" };
}

export async function getSession(gameId: string): Promise<GameSession | null> {
  const snap = await getDoc(doc(db, "sessions", gameId));
  return snap.exists() ? (snap.data() as GameSession) : null;
}

// ─── Turn Logs ────────────────────────────────────────────────────────────────

/**
 * Write a completed turn log to Firestore.
 * Document ID: `turn_{turn}_{playerId}`
 */
export async function submitTurn(log: TurnLog): Promise<void> {
  const id = `turn_${String(log.turn).padStart(4, "0")}_${log.playerId}`;
  await setDoc(doc(db, "sessions", log.gameId, "turns", id), log);
}

/**
 * Fetch a specific turn log.
 */
export async function getTurn(
  gameId: string,
  turn: number,
  playerId: string
): Promise<TurnLog | null> {
  const id = `turn_${String(turn).padStart(4, "0")}_${playerId}`;
  const snap = await getDoc(doc(db, "sessions", gameId, "turns", id));
  return snap.exists() ? (snap.data() as TurnLog) : null;
}

/**
 * Subscribe to new turns for a game.
 * Fires the callback whenever a new turn document is written.
 */
export function subscribeTurns(
  gameId: string,
  onNewTurn: (log: TurnLog) => void
): Unsubscribe {
  const q = query(
    collection(db, "sessions", gameId, "turns"),
    orderBy("turn", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        onNewTurn(change.doc.data() as TurnLog);
      }
    });
  });
}
