// ─── Coordinates ─────────────────────────────────────────────────────────────

export interface TileCoord {
  x: number;
  y: number;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface Stats {
  strength: number;   // melee damage modifier
  wisdom: number;     // magic damage modifier
  agility: number;    // turn order priority
}

// ─── Items & Weapons ─────────────────────────────────────────────────────────

export type WeaponCategory = "melee" | "ranged" | "scroll";
export type MeleeType = "sword" | "mace" | "axe" | "club" | "dagger";
export type RangedType = "staff" | "wand";
export type ScrollType = "fireball" | "waterball" | "lightning";
export type WeaponType = MeleeType | RangedType | ScrollType;

export type EquipSlot = "helmet" | "leftHand" | "rightHand" | "chest" | "boots" | "ring1" | "ring2";
export type ItemType = "weapon" | "armor" | "consumable" | "misc";

export interface Item {
  id: string;
  name: string;
  itemType: ItemType;
  equipSlot?: EquipSlot;       // which slot it can go in (if equippable)
  // Weapon fields
  weaponCategory?: WeaponCategory;
  weaponType?: WeaponType;
  damage?: number;             // base damage
  range?: number;              // attack range in tiles (1 = melee adjacent)
  statScaling?: "strength" | "wisdom"; // which stat scales the damage
  consumable?: boolean;        // scrolls are consumed on use
  // Armor fields
  defense?: number;
  // Description for examine
  description?: string;
}

// ─── Equipment & Inventory ───────────────────────────────────────────────────

export interface Equipment {
  helmet: string | null;
  leftHand: string | null;
  rightHand: string | null;
  chest: string | null;
  boots: string | null;
  ring1: string | null;
  ring2: string | null;
}

export interface Inventory {
  equipment: Equipment;
  bag: string[];              // item IDs in storage
}

// ─── Entities ────────────────────────────────────────────────────────────────

export type EntityType = "player" | "enemy" | "npc";
export type Disposition = "friendly" | "hostile" | "neutral";

export interface Entity {
  id: string;
  name: string;               // display name
  type: EntityType;
  disposition: Disposition;    // friendly NPCs can be attacked to turn hostile
  pos: TileCoord;
  hp: number;
  maxHp: number;
  movementPoints: number;
  actionPoints: number;
  stats: Stats;
  inventory: Inventory;
  aggroRange: number;          // tiles; hostile NPCs engage if player is within this
  talkText?: string;           // dialogue for friendly NPCs
  inCombat: boolean;           // currently part of an active combat
  textureKey: string;          // which generated texture to use for rendering
}

// ─── World Tile ──────────────────────────────────────────────────────────────

export type TerrainType = "grass" | "stone" | "water" | "wall";

export interface WorldTile {
  terrain: TerrainType;
  structure?: string;          // e.g. "tree", "rock", "house", "chest" etc.
  groundItem?: string;         // item ID sitting on the ground
}

// ─── Actions (the command log stored in Firestore) ────────────────────────────

export interface MoveAction {
  type: "MOVE";
  unitId: string;
  to: TileCoord;
}

export interface AttackAction {
  type: "ATTACK";
  unitId: string;
  targetId: string;
  weaponItemId?: string;       // which weapon/scroll was used
}

export interface UseItemAction {
  type: "USE_ITEM";
  unitId: string;
  itemId: string;
  targetTile?: TileCoord;
}

export interface TalkAction {
  type: "TALK";
  unitId: string;
  targetId: string;
}

export interface PickUpAction {
  type: "PICK_UP";
  unitId: string;
  tile: TileCoord;
}

export interface EndTurnAction {
  type: "END_TURN";
}

export type Action = MoveAction | AttackAction | UseItemAction | TalkAction | PickUpAction | EndTurnAction;

// ─── Turn Log (one document per turn in Firestore) ───────────────────────────

export interface TurnLog {
  gameId: string;
  round: number;
  turnIndex: number;           // position in the turn order this round
  entityId: string;            // which entity's turn this was
  playerId?: string;           // "playerA" | "playerB" if a player turn
  actions: Action[];
  npcSeed: number;
  timestamp: number;
}

// ─── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  gameId: string;
  round: number;
  turnOrder: string[];         // entity IDs sorted by agility
  turnIndex: number;           // index into turnOrder for whose turn it is
  entities: Record<string, Entity>;
  worldTiles: WorldTile[][];   // [row][col]
  items: Record<string, Item>; // master item registry by ID
  seed: number;
  combatActive: boolean;       // any combat happening anywhere?
  mapWidth: number;
  mapHeight: number;
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  round: number;
  turnIndex: number;
  entityId: string;
  label: string;
  log: TurnLog | null;
  actions?: Action[];
  entitySnapshot: Record<string, { x: number; y: number }>;
}

// ─── Lobby / Session ─────────────────────────────────────────────────────────

export type PlayerSlot = "playerA" | "playerB";

export interface GameSession {
  gameId: string;
  seed: number;
  playerAUid: string;
  playerBUid: string | null;
  currentTurn: number;
  status: "waiting" | "active" | "finished";
}
