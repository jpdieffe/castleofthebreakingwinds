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
  turn: number;
  playerId: string;          // "playerA" | "playerB"
  actions: Action[];
  npcSeed: number;           // deterministic seed for NPC phase this turn
  timestamp: number;         // Date.now()
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

export interface GameState {
  gameId: string;
  turn: number;
  activePlayer: "playerA" | "playerB";
  entities: Record<string, Entity>;
  seed: number;              // initial game seed (shared, stored in Firestore on game creation)
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
