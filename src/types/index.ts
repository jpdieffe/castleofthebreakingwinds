// ─── Coordinates ─────────────────────────────────────────────────────────────

export interface TileCoord {
  x: number;
  y: number;
}

// ─── Actions (the command log stored in Firestore) ────────────────────────────

export type ActionType =
  | "MOVE"
  | "ATTACK"
  | "USE_ITEM"
  | "END_TURN";

export interface MoveAction {
  type: "MOVE";
  unitId: string;
  to: TileCoord;
}

export interface AttackAction {
  type: "ATTACK";
  unitId: string;
  targetId: string;
}

export interface UseItemAction {
  type: "USE_ITEM";
  unitId: string;
  itemId: string;
  targetId?: string;
}

export interface EndTurnAction {
  type: "END_TURN";
}

export type Action = MoveAction | AttackAction | UseItemAction | EndTurnAction;

// ─── Turn Log (one document per turn per player in Firestore) ─────────────────

export interface TurnLog {
  gameId: string;
  round: number;
  phase: RoundPhase;
  playerId: string;          // "playerA" | "playerB"
  actions: Action[];
  npcSeed: number;           // used only when phase === "playerB" to run enemy phase after
  timestamp: number;
}

// ─── Game State (lives only on clients, rebuilt from turn logs) ───────────────

export type EntityType = "player" | "enemy" | "npc";

export interface Entity {
  id: string;
  type: EntityType;
  pos: TileCoord;
  hp: number;
  maxHp: number;
  movementPoints: number;
  actionPoints: number;
}

// Phase within a round: playerA acts → playerB acts → enemies act → repeat
export type RoundPhase = "playerA" | "playerB" | "enemies";

export interface GameState {
  gameId: string;
  round: number;             // increments after enemies phase
  phase: RoundPhase;         // current phase within the round
  activePlayer: "playerA" | "playerB";  // kept for UI compat
  entities: Record<string, Entity>;
  seed: number;
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  round: number;
  phase: RoundPhase;
  label: string;             // e.g. "P1", "P2", "NPC1"
  log: TurnLog | null;       // null for enemy phase (computed locally)
  actions?: Action[];        // set for NPC entries (no log) for replay
  /** Entity positions at the START of this entry (before actions applied). Used for visual rewind. */
  entitySnapshot: Record<string, { x: number; y: number }>;
}

// ─── Lobby / Session ─────────────────────────────────────────────────────────

export type PlayerSlot = "playerA" | "playerB";

export interface GameSession {
  gameId: string;
  seed: number;
  playerAUid: string;
  playerBUid: string | null;  // null until second player joins
  currentTurn: number;        // whose turn is it — increments after each player acts
  status: "waiting" | "active" | "finished";
}
