import Phaser from "phaser";
import type { GameState, GameSession, PlayerSlot, Entity, Action, RoundPhase, HistoryEntry } from "../../types";
import { TurnManager } from "../systems/TurnManager";
import type { AnimateCallback } from "../systems/TurnManager";
import { MOVEMENT_POINTS, ACTION_POINTS } from "../simulation/GameState";

const TILE_W = 64;
const TILE_H = 32;
const MAP_SIZE = 20;
const ORIGIN_Y = 100; // pushed down to make room for history bar
const BAR_HEIGHT = 56;
const SLOT_SIZE = 44;
const ACTION_DELAY = 350; // ms between animated actions

export class GameScene extends Phaser.Scene {
  private turnManager!: TurnManager;
  private playerSlot!: PlayerSlot;
  private entitySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private uiText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;
  private historySlots: Phaser.GameObjects.Container[] = [];
  private historyCursorIdx = -1;  // index into history array; -1 = no cursor
  private playBtnRef: Phaser.GameObjects.Text | null = null;
  private isRewound = false;  // true when sprites are snapped to a past state

  /** Instantly move all sprites to the positions recorded in a snapshot. */
  private snapSpritesToSnapshot(snapshot: Record<string, { x: number; y: number }>): void {
    const originX = this.scale.width / 2;
    // Kill any in-flight tweens on entity sprites first
    for (const sprite of this.entitySprites.values()) {
      this.tweens.killTweensOf(sprite);
    }
    for (const [id, pos] of Object.entries(snapshot)) {
      const sprite = this.entitySprites.get(id);
      if (sprite) {
        const { sx, sy } = tileToScreen(pos.x, pos.y, originX, ORIGIN_Y);
        sprite.setPosition(sx, sy - 16);
      }
    }
  }

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { session: GameSession; playerSlot: PlayerSlot }): void {
    this.playerSlot = data.playerSlot;
    const initialState = buildInitialState(data.session);
    this.turnManager = new TurnManager(
      initialState,
      data.playerSlot,
      (state) => this.onStateChanged(state),
      this.animateActions.bind(this) as AnimateCallback
    );
  }

  create(): void {
    this.drawTiles();
    this.setupEntities(this.turnManager.getState());
    this.setupUI();
    this.turnManager.start();
    this.refreshUI(this.turnManager.getState());
    this.refreshHistoryBar();
  }

  shutdown(): void {
    this.turnManager.stop();
  }

  //  Tiles 

  private drawTiles(): void {
    const originX = this.scale.width / 2;
    for (let row = 0; row < MAP_SIZE; row++) {
      for (let col = 0; col < MAP_SIZE; col++) {
        const { sx, sy } = tileToScreen(col, row, originX, ORIGIN_Y);
        const key = (col + row) % 2 === 0 ? "tile_light" : "tile_dark";
        this.add.image(sx, sy, key).setDepth(0);
      }
    }
  }

  //  Entity sprites 

  private setupEntities(state: GameState): void {
    for (const entity of Object.values(state.entities)) {
      this.createSprite(entity);
    }
  }

  private createSprite(entity: Entity): void {
    const originX = this.scale.width / 2;
    const { sx, sy } = tileToScreen(entity.pos.x, entity.pos.y, originX, ORIGIN_Y);
    const key = entity.type === "player" ? entity.id : "enemy";
    const sprite = this.add
      .image(sx, sy - 16, key)
      .setDepth(1)
      .setInteractive({ useHandCursor: entity.type === "enemy" });

    sprite.on("pointerup", () => {
      if (!this.turnManager.isLocalTurn()) return;
      const localUnitId = this.playerSlot === "playerA" ? "player_a" : "player_b";
      const localUnit = this.turnManager.getState().entities[localUnitId];
      if (localUnit && localUnit.actionPoints > 0 && entity.type === "enemy") {
        this.turnManager.queueAction({ type: "ATTACK", unitId: localUnitId, targetId: entity.id });
      }
    });

    this.entitySprites.set(entity.id, sprite);
  }

  private syncSprites(state: GameState): void {
    const originX = this.scale.width / 2;

    for (const [id, sprite] of this.entitySprites) {
      if (!state.entities[id]) { sprite.destroy(); this.entitySprites.delete(id); }
    }

    for (const entity of Object.values(state.entities)) {
      const { sx, sy } = tileToScreen(entity.pos.x, entity.pos.y, originX, ORIGIN_Y);
      const sprite = this.entitySprites.get(entity.id);
      if (sprite) {
        this.tweens.add({ targets: sprite, x: sx, y: sy - 16, duration: 200, ease: "Quad.easeOut" });
      } else {
        this.createSprite(entity);
      }
    }
  }

  //  Animation: play actions one-by-one 

  private animateActions(actions: Action[], phase: RoundPhase, onDone: () => void): void {
    const toAnimate = actions.filter(a => a.type === "MOVE" || a.type === "ATTACK");

    if (toAnimate.length === 0) {
      // Enemy phase or empty  just a short pause
      this.time.delayedCall(phase === "enemies" ? 600 : 0, onDone);
      return;
    }

    let i = 0;
    const step = () => {
      if (i >= toAnimate.length) { onDone(); return; }
      const action = toAnimate[i++];
      const originX = this.scale.width / 2;

      if (action.type === "MOVE") {
        const sprite = this.entitySprites.get(action.unitId);
        if (sprite) {
          const { sx, sy } = tileToScreen(action.to.x, action.to.y, originX, ORIGIN_Y);
          this.tweens.add({ targets: sprite, x: sx, y: sy - 16, duration: ACTION_DELAY - 50, ease: "Quad.easeOut",
            onComplete: () => this.time.delayedCall(50, step) });
          return;
        }
      }

      if (action.type === "ATTACK") {
        const attacker = this.entitySprites.get(action.unitId);
        const target = this.entitySprites.get(action.targetId);
        if (attacker && target) {
          // Lunge toward target then snap back
          const origX = attacker.x, origY = attacker.y;
          this.tweens.add({ targets: attacker, x: target.x, y: target.y, duration: 120, ease: "Quad.easeIn",
            onComplete: () => {
              // Flash target red
              if (target) target.setTint(0xff0000);
              this.time.delayedCall(80, () => {
                if (target) target.clearTint();
                this.tweens.add({ targets: attacker, x: origX, y: origY, duration: 120, ease: "Quad.easeOut",
                  onComplete: () => this.time.delayedCall(50, step) });
              });
            }
          });
          return;
        }
      }

      // Fallback
      this.time.delayedCall(ACTION_DELAY, step);
    };

    step();
  }

  //  History bar 

  private refreshHistoryBar(): void {
    // Clear old slots and play button
    this.historySlots.forEach(c => c.destroy());
    this.historySlots = [];
    if (this.playBtnRef) { this.playBtnRef.destroy(); this.playBtnRef = null; }

    const history = this.turnManager.getHistory();
    const { width } = this.scale;
    const centerX = width / 2;
    const centerY = BAR_HEIGHT / 2;

    // Build the schedule: past 5, [current], next 5
    const past = history.slice(-5);
    const currentState = this.turnManager.getState();
    const upcoming = buildUpcoming(currentState, 5);
    // "now" label: during enemies phase we don't know which NPC index, so just say "NPC"
    const currentLabel = getPhaseLabel(currentState.phase);
    const all = [
      ...past.map(e => ({ entry: e as HistoryEntry | null, type: "past" as const, label: e.label })),
      { entry: null as HistoryEntry | null, type: "now" as const, label: currentLabel },
      ...upcoming.map(e => ({ entry: null as HistoryEntry | null, type: "future" as const, label: e.label! })),
    ];

    // Background bar
    this.add.rectangle(centerX, centerY, width, BAR_HEIGHT, 0x111122, 0.9).setDepth(20);

    const totalSlots = all.length;
    const startX = centerX - ((totalSlots - 1) / 2) * (SLOT_SIZE + 4);

    all.forEach(({ entry, type, label }, i) => {
      const x = startX + i * (SLOT_SIZE + 4);
      const container = this.add.container(x, centerY).setDepth(21);

      const isNow = type === "now";
      // historyIndex: which index in the full history array does this past slot correspond to?
      const historyIndex = type === "past" ? history.length - past.length + i : -1;
      const isCursor = historyIndex >= 0 && this.historyCursorIdx === historyIndex;

      const bgColor = isNow ? 0x445566 : isCursor ? 0xaa5500 : type === "past" ? 0x334455 : 0x223344;
      const bg = this.add.rectangle(0, 0, SLOT_SIZE, SLOT_SIZE, bgColor, 1);
      container.add(bg);

      const text = this.add.text(0, 0, label, { fontSize: "11px", color: "#ffffff" }).setOrigin(0.5);
      container.add(text);

      // Past slots: click to set/toggle the playback cursor
      if (type === "past" && entry) {
        bg.setInteractive({ useHandCursor: true });
        bg.on("pointerover", () => bg.setFillStyle(isCursor ? 0xcc7700 : 0x556677));
        bg.on("pointerout",  () => bg.setFillStyle(isCursor ? 0xaa5500 : bgColor));
        bg.on("pointerup", () => {
          if (isCursor) {
            // Un-set cursor: snap back to present
            this.historyCursorIdx = -1;
            this.isRewound = false;
            this.syncSprites(this.turnManager.getState());
          } else {
            // Set cursor: snap sprites to this point in history
            this.historyCursorIdx = historyIndex;
            this.isRewound = true;
            this.snapSpritesToSnapshot(entry.entitySnapshot);
          }
          this.refreshHistoryBar();
        });
      }

      // Orange border outline on the cursor slot
      if (isCursor) {
        const cursorGfx = this.add.graphics();
        cursorGfx.lineStyle(3, 0xffaa00, 1);
        cursorGfx.strokeRect(-(SLOT_SIZE / 2 + 2), -(SLOT_SIZE / 2 + 2), SLOT_SIZE + 4, SLOT_SIZE + 4);
        container.add(cursorGfx); // added last → renders on top of bg and text
      }

      // Pulsing green border outline on the current "now" slot
      if (isNow) {
        const glow = this.add.graphics();
        glow.lineStyle(3, 0x44ff88, 1);
        glow.strokeRect(-(SLOT_SIZE / 2 + 2), -(SLOT_SIZE / 2 + 2), SLOT_SIZE + 4, SLOT_SIZE + 4);
        container.add(glow); // added last → renders on top of bg and text
        this.tweens.add({ targets: glow, alpha: 0.2, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }

      this.historySlots.push(container);
    });

    // Play button: appears only when a cursor is set
    if (this.historyCursorIdx >= 0) {
      this.playBtnRef = this.add
        .text(width - 10, centerY, "▶ Play", {
          fontSize: "13px",
          color: "#ffcc00",
          backgroundColor: "#334455",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(1, 0.5)
        .setDepth(22)
        .setInteractive({ useHandCursor: true });

      this.playBtnRef.on("pointerup", () => {
        if (this.turnManager.isBusy()) return;
        const cursor = this.historyCursorIdx;
        this.historyCursorIdx = -1;
        this.refreshHistoryBar();
        this.turnManager.replayFromIndex(cursor, () => {
          // Snap all sprites back to current real game-state positions
          this.isRewound = false;
          this.syncSprites(this.turnManager.getState());
          this.refreshHistoryBar();
        });
      });
    }
  }

  //  UI 

  private setupUI(): void {
    const { width, height } = this.scale;

    this.uiText = this.add.text(10, BAR_HEIGHT + 6, "", { fontSize: "13px", color: "#ffffff" }).setDepth(10);

    this.add.text(10, height - 10, `Game: ${this.turnManager.getState().gameId}`,
      { fontSize: "12px", color: "#666666" }).setOrigin(0, 1).setDepth(10);

    this.endTurnBtn = this.add
      .text(width - 16, height - 16, "[ End Turn ]", { fontSize: "16px", color: "#ffdd88" })
      .setOrigin(1, 1).setDepth(10).setInteractive({ useHandCursor: true });

    this.endTurnBtn.on("pointerup", () => {
      if (this.turnManager.isLocalTurn()) this.turnManager.endTurn();
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.turnManager.isLocalTurn()) return;
      // Ignore clicks in the history bar
      if (pointer.y < BAR_HEIGHT) return;
      const state = this.turnManager.getState();
      const localUnitId = this.playerSlot === "playerA" ? "player_a" : "player_b";
      const unit = state.entities[localUnitId];
      if (!unit || unit.movementPoints <= 0) return;

      const tile = screenToTile(pointer.x, pointer.y, this.scale.width / 2, ORIGIN_Y);
      if (tile.x >= 0 && tile.x < MAP_SIZE && tile.y >= 0 && tile.y < MAP_SIZE) {
        this.turnManager.queueAction({ type: "MOVE", unitId: localUnitId, to: tile });
      }
    });
  }

  private refreshUI(state: GameState): void {
    const isMyTurn = this.turnManager.isLocalTurn();
    const localUnitId = this.playerSlot === "playerA" ? "player_a" : "player_b";
    const unit = state.entities[localUnitId];
    const phaseLabel = state.phase === "enemies" ? "Enemies moving..." :
      state.phase === this.playerSlot ? ">> YOUR TURN <<" : "Waiting for opponent...";

    this.uiText.setText([
      `You: ${this.playerSlot}  |  Round ${state.round}  |  ${phaseLabel}`,
      unit ? `MP: ${unit.movementPoints}  AP: ${unit.actionPoints}  HP: ${unit.hp}/${unit.maxHp}` : "(dead)",
    ].join("\n"));
    this.endTurnBtn.setAlpha(isMyTurn ? 1 : 0.3);
  }

  private onStateChanged(state: GameState): void {
    if (!this.isRewound) {
      this.syncSprites(state);
    }
    this.refreshUI(state);
    this.refreshHistoryBar();
  }
}

//  Helpers 

function tileToScreen(col: number, row: number, originX: number, originY: number) {
  return { sx: originX + (col - row) * (TILE_W / 2), sy: originY + (col + row) * (TILE_H / 2) };
}

function screenToTile(sx: number, sy: number, originX: number, originY: number) {
  const dx = sx - originX, dy = sy - originY;
  return {
    x: Math.round(dx / (TILE_W / 2) / 2 + dy / (TILE_H / 2) / 2),
    y: Math.round(dy / (TILE_H / 2) / 2 - dx / (TILE_W / 2) / 2),
  };
}

function getPhaseLabel(phase: RoundPhase, npcIndex?: number): string {
  if (phase === "playerA") return "P1";
  if (phase === "playerB") return "P2";
  return npcIndex !== undefined ? `NPC${npcIndex + 1}` : "NPC";
}

function buildUpcoming(state: GameState, count: number): Partial<HistoryEntry>[] {
  const order: RoundPhase[] = ["playerA", "playerB", "enemies"];
  const enemyIds = Object.values(state.entities).filter(e => e.type === "enemy").map(e => e.id);
  const enemyCount = Math.max(1, enemyIds.length);
  const result: Partial<HistoryEntry>[] = [];
  let phase = state.phase;
  let round = state.round;

  while (result.length < count) {
    const idx = (order.indexOf(phase) + 1) % order.length;
    phase = order[idx];
    if (phase === "playerA") round++;

    if (phase === "enemies") {
      // Expand into one slot per enemy
      for (let n = 0; n < enemyCount && result.length < count; n++) {
        result.push({ round, phase, label: `NPC${n + 1}` });
      }
    } else {
      result.push({ round, phase, label: getPhaseLabel(phase) });
    }
  }
  return result;
}

function buildInitialState(session: GameSession): GameState {
  return {
    gameId: session.gameId,
    round: 0,
    phase: "playerA",
    activePlayer: "playerA",
    seed: session.seed,
    entities: {
      player_a: { id: "player_a", type: "player", pos: { x: 2, y: 2 }, hp: 20, maxHp: 20, movementPoints: MOVEMENT_POINTS, actionPoints: ACTION_POINTS },
      player_b: { id: "player_b", type: "player", pos: { x: 17, y: 17 }, hp: 20, maxHp: 20, movementPoints: MOVEMENT_POINTS, actionPoints: ACTION_POINTS },
      enemy_1:  { id: "enemy_1",  type: "enemy",  pos: { x: 10, y: 10 }, hp: 10, maxHp: 10, movementPoints: 2, actionPoints: 1 },
      enemy_2:  { id: "enemy_2",  type: "enemy",  pos: { x: 8,  y: 12 }, hp: 10, maxHp: 10, movementPoints: 2, actionPoints: 1 },
    },
  };
}
