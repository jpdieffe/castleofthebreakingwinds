import Phaser from "phaser";
import type { GameState, GameSession, PlayerSlot, Entity } from "../../types";
import { TurnManager } from "../systems/TurnManager";
import { MOVEMENT_POINTS, ACTION_POINTS } from "../simulation/GameState";

const TILE_W = 64;
const TILE_H = 32;
const MAP_SIZE = 20; // 20×20 tile grid

/**
 * GameScene: the main isometric game view.
 * Receives `session` and `playerSlot` from the launching scene as init data.
 */
export class GameScene extends Phaser.Scene {
  private turnManager!: TurnManager;
  private playerSlot!: PlayerSlot;
  private entitySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private uiText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { session: GameSession; playerSlot: PlayerSlot }): void {
    this.playerSlot = data.playerSlot;

    const initialState = buildInitialState(data.session);
    this.turnManager = new TurnManager(
      initialState,
      data.playerSlot,
      (state) => this.onStateChanged(state)
    );
  }

  create(): void {
    this.drawTiles();
    this.setupEntities(this.turnManager.getState());
    this.setupUI();
    this.turnManager.start();
    this.refreshUI(this.turnManager.getState());
  }

  shutdown(): void {
    this.turnManager.stop();
  }

  // ─── Tile grid ─────────────────────────────────────────────────────────────

  private drawTiles(): void {
    const originX = this.scale.width / 2;
    const originY = 80;

    for (let row = 0; row < MAP_SIZE; row++) {
      for (let col = 0; col < MAP_SIZE; col++) {
        const { sx, sy } = tileToScreen(col, row, originX, originY);
        const key = (col + row) % 2 === 0 ? "tile_light" : "tile_dark";
        this.add.image(sx, sy, key).setDepth(0);
      }
    }
  }

  // ─── Entities ──────────────────────────────────────────────────────────────

  private setupEntities(state: GameState): void {
    for (const entity of Object.values(state.entities)) {
      this.createSprite(entity);
    }
  }

  private createSprite(entity: Entity): void {
    const originX = this.scale.width / 2;
    const originY = 80;
    const { sx, sy } = tileToScreen(
      entity.pos.x,
      entity.pos.y,
      originX,
      originY
    );

    const key =
      entity.type === "player" ? entity.id.replace("_", "_") : "enemy";
    const sprite = this.add
      .image(sx, sy - 16, key)
      .setDepth(1)
      .setInteractive({ useHandCursor: entity.type === "enemy" });

    if (entity.type === "enemy") {
      sprite.on("pointerup", () => {
        if (this.turnManager.isLocalTurn()) {
          const state = this.turnManager.getState();
          const localUnitId =
            this.playerSlot === "playerA" ? "player_a" : "player_b";
          const localUnit = state.entities[localUnitId];
          if (localUnit && localUnit.actionPoints > 0) {
            this.turnManager.queueAction({
              type: "ATTACK",
              unitId: localUnitId,
              targetId: entity.id,
            });
          }
        }
      });
    }

    this.entitySprites.set(entity.id, sprite);
  }

  private syncSprites(state: GameState): void {
    const originX = this.scale.width / 2;
    const originY = 80;

    // Remove sprites for dead/removed entities
    for (const [id, sprite] of this.entitySprites) {
      if (!state.entities[id]) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }

    // Update or create sprites
    for (const entity of Object.values(state.entities)) {
      const { sx, sy } = tileToScreen(
        entity.pos.x,
        entity.pos.y,
        originX,
        originY
      );
      const sprite = this.entitySprites.get(entity.id);
      if (sprite) {
        this.tweens.add({
          targets: sprite,
          x: sx,
          y: sy - 16,
          duration: 200,
          ease: "Quad.easeOut",
        });
      } else {
        this.createSprite(entity);
      }
    }
  }

  // ─── Input: click to move local player ────────────────────────────────────

  private setupUI(): void {
    const { width, height } = this.scale;

    this.uiText = this.add
      .text(10, 10, "", { fontSize: "13px", color: "#ffffff" })
      .setDepth(10);

    this.endTurnBtn = this.add
      .text(width - 16, height - 16, "[ End Turn ]", {
        fontSize: "16px",
        color: "#ffdd88",
      })
      .setOrigin(1, 1)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    this.endTurnBtn.on("pointerup", () => {
      if (this.turnManager.isLocalTurn()) {
        this.turnManager.endTurn();
      }
    });

    // Click on the ground to move
    this.input.on(
      "pointerup",
      (pointer: Phaser.Input.Pointer) => {
        if (!this.turnManager.isLocalTurn()) return;
        const state = this.turnManager.getState();
        const localUnitId =
          this.playerSlot === "playerA" ? "player_a" : "player_b";
        const unit = state.entities[localUnitId];
        if (!unit || unit.movementPoints <= 0) return;

        const originX = this.scale.width / 2;
        const originY = 80;
        const tile = screenToTile(pointer.x, pointer.y, originX, originY);

        if (
          tile.x >= 0 &&
          tile.x < MAP_SIZE &&
          tile.y >= 0 &&
          tile.y < MAP_SIZE
        ) {
          this.turnManager.queueAction({
            type: "MOVE",
            unitId: localUnitId,
            to: tile,
          });
        }
      }
    );
  }

  private refreshUI(state: GameState): void {
    const isMyTurn = this.turnManager.isLocalTurn();
    const localUnitId =
      this.playerSlot === "playerA" ? "player_a" : "player_b";
    const unit = state.entities[localUnitId];

    const lines = [
      `You are: ${this.playerSlot}`,
      `Turn: ${state.turn}  Active: ${state.activePlayer}`,
      isMyTurn ? ">> YOUR TURN <<" : "Waiting for opponent...",
      unit
        ? `MP: ${unit.movementPoints}  AP: ${unit.actionPoints}  HP: ${unit.hp}/${unit.maxHp}`
        : "(you are dead)",
    ];
    this.uiText.setText(lines.join("\n"));
    this.endTurnBtn.setAlpha(isMyTurn ? 1 : 0.3);
  }

  // ─── State change callback ─────────────────────────────────────────────────

  private onStateChanged(state: GameState): void {
    this.syncSprites(state);
    this.refreshUI(state);
  }
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function tileToScreen(
  col: number,
  row: number,
  originX: number,
  originY: number
): { sx: number; sy: number } {
  return {
    sx: originX + (col - row) * (TILE_W / 2),
    sy: originY + (col + row) * (TILE_H / 2),
  };
}

function screenToTile(
  sx: number,
  sy: number,
  originX: number,
  originY: number
): { x: number; y: number } {
  const dx = sx - originX;
  const dy = sy - originY;
  const col = Math.round(dx / (TILE_W / 2) / 2 + dy / (TILE_H / 2) / 2);
  const row = Math.round(dy / (TILE_H / 2) / 2 - dx / (TILE_W / 2) / 2);
  return { x: col, y: row };
}

// ─── Initial world state builder ──────────────────────────────────────────────

function buildInitialState(session: GameSession): GameState {
  return {
    gameId: session.gameId,
    turn: 0,
    activePlayer: "playerA",
    seed: session.seed,
    entities: {
      player_a: {
        id: "player_a",
        type: "player",
        pos: { x: 2, y: 2 },
        hp: 20,
        maxHp: 20,
        movementPoints: MOVEMENT_POINTS,
        actionPoints: ACTION_POINTS,
      },
      player_b: {
        id: "player_b",
        type: "player",
        pos: { x: 17, y: 17 },
        hp: 20,
        maxHp: 20,
        movementPoints: MOVEMENT_POINTS,
        actionPoints: ACTION_POINTS,
      },
      enemy_1: {
        id: "enemy_1",
        type: "enemy",
        pos: { x: 10, y: 10 },
        hp: 10,
        maxHp: 10,
        movementPoints: 2,
        actionPoints: 1,
      },
      enemy_2: {
        id: "enemy_2",
        type: "enemy",
        pos: { x: 8, y: 12 },
        hp: 10,
        maxHp: 10,
        movementPoints: 2,
        actionPoints: 1,
      },
    },
  };
}
