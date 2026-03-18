import Phaser from "phaser";
import type { GameState, GameSession, PlayerSlot, Entity, Action, HistoryEntry, TileCoord } from "../../types";
import { TurnManager } from "../systems/TurnManager";
import type { AnimateCallback } from "../systems/TurnManager";
import { generateWorld, MAP_SIZE, INTERACT_RANGE, tileDist, buildTurnOrder } from "../simulation/GameState";
import { RNG } from "../simulation/RNG";

const TILE_W = 64;
const TILE_H = 32;
const ORIGIN_Y = 100;
const BAR_HEIGHT = 56;
const SLOT_SIZE = 44;
const ACTION_DELAY = 350;

export class GameScene extends Phaser.Scene {
  private turnManager!: TurnManager;
  private playerSlot!: PlayerSlot;
  private entitySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private structureSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private groundItemSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private uiText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;
  private historySlots: Phaser.GameObjects.Container[] = [];
  private historyCursorIdx = -1;
  private playBtnRef: Phaser.GameObjects.Text | null = null;
  private isRewound = false;

  // Context menu
  private ctxMenu: Phaser.GameObjects.Container | null = null;
  // Inventory popup
  private invPanel: Phaser.GameObjects.Container | null = null;
  // Talk dialog
  private talkDialog: Phaser.GameObjects.Container | null = null;

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
    const state = this.turnManager.getState();
    this.drawTiles(state);
    this.drawStructures(state);
    this.drawGroundItems(state);
    this.setupEntities(state);
    this.setupUI();
    this.setupRightClick();
    this.turnManager.start();
    this.refreshUI(state);
    this.refreshHistoryBar();
  }

  shutdown(): void {
    this.turnManager.stop();
  }

  // ─── World tiles ──────────────────────────────────────────────────────────

  private drawTiles(state: GameState): void {
    const originX = this.scale.width / 2;
    for (let row = 0; row < state.mapHeight; row++) {
      for (let col = 0; col < state.mapWidth; col++) {
        const { sx, sy } = tileToScreen(col, row, originX, ORIGIN_Y);
        const tile = state.worldTiles[row][col];
        let key = (col + row) % 2 === 0 ? "tile_grass" : "tile_grass2";
        if (tile.terrain === "stone") key = "tile_stone";
        else if (tile.terrain === "water") key = "tile_water";
        else if (tile.terrain === "wall") key = "tile_wall";
        this.add.image(sx, sy, key).setDepth(0);
      }
    }
  }

  private drawStructures(state: GameState): void {
    const originX = this.scale.width / 2;
    for (let row = 0; row < state.mapHeight; row++) {
      for (let col = 0; col < state.mapWidth; col++) {
        const tile = state.worldTiles[row][col];
        if (tile.structure) {
          const { sx, sy } = tileToScreen(col, row, originX, ORIGIN_Y);
          const texKey = `struct_${tile.structure}`;
          const s = this.add.image(sx, sy - 8, texKey).setDepth(0.5);
          this.structureSprites.set(`${col}_${row}`, s);
        }
      }
    }
  }

  private drawGroundItems(state: GameState): void {
    this.groundItemSprites.forEach(s => s.destroy());
    this.groundItemSprites.clear();
    const originX = this.scale.width / 2;
    for (let row = 0; row < state.mapHeight; row++) {
      for (let col = 0; col < state.mapWidth; col++) {
        const tile = state.worldTiles[row][col];
        if (tile.groundItem) {
          const { sx, sy } = tileToScreen(col, row, originX, ORIGIN_Y);
          const s = this.add.image(sx, sy, "ground_item").setDepth(0.6);
          this.groundItemSprites.set(`${col}_${row}`, s);
        }
      }
    }
  }

  // ─── Entity sprites ──────────────────────────────────────────────────────

  private setupEntities(state: GameState): void {
    for (const entity of Object.values(state.entities)) {
      this.createSprite(entity);
    }
  }

  private createSprite(entity: Entity): void {
    const originX = this.scale.width / 2;
    const { sx, sy } = tileToScreen(entity.pos.x, entity.pos.y, originX, ORIGIN_Y);
    const sprite = this.add
      .image(sx, sy - 16, entity.textureKey)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });

    // Left-click: move toward this entity (if it's an enemy and we can attack)
    sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return; // left click only
      if (!this.turnManager.isLocalTurn()) return;
      const localId = this.localUnitId();
      const localUnit = this.turnManager.getState().entities[localId];
      if (localUnit && localUnit.actionPoints > 0 && entity.type === "enemy") {
        const weapon = this.getEquippedWeapon(localUnit);
        const range = weapon?.range ?? 1;
        if (tileDist(localUnit.pos, entity.pos) <= range) {
          this.turnManager.queueAction({ type: "ATTACK", unitId: localId, targetId: entity.id, weaponItemId: weapon?.id });
        }
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
        sprite.setTexture(entity.textureKey);
        this.tweens.add({ targets: sprite, x: sx, y: sy - 16, duration: 200, ease: "Quad.easeOut" });
      } else {
        this.createSprite(entity);
      }
    }
    this.drawGroundItems(state);
  }

  private snapSpritesToSnapshot(snapshot: Record<string, { x: number; y: number }>): void {
    const originX = this.scale.width / 2;
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

  // ─── Right-click context menu ─────────────────────────────────────────────

  private setupRightClick(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        // Prevent propagation so the move handler doesn't fire
        pointer.event.preventDefault();
        const tile = screenToTile(pointer.x, pointer.y, this.scale.width / 2, ORIGIN_Y);
        this.showContextMenu(pointer.x, pointer.y, tile);
      } else {
        this.closeContextMenu();
        this.closeTalkDialog();
      }
    });

    // Disable browser context menu over the canvas
    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private showContextMenu(px: number, py: number, tile: TileCoord): void {
    this.closeContextMenu();
    if (!this.turnManager.isLocalTurn()) return;

    const state = this.turnManager.getState();
    const localId = this.localUnitId();
    const localUnit = state.entities[localId];
    if (!localUnit) return;

    const dist = tileDist(localUnit.pos, tile);
    const options: { label: string; action: () => void }[] = [];

    // Check what's at this tile
    const entityAtTile = Object.values(state.entities).find(e => e.pos.x === tile.x && e.pos.y === tile.y && e.hp > 0 && e.id !== localId);

    if (entityAtTile) {
      // Talk (friendly NPCs within range)
      if (entityAtTile.disposition === "friendly" && entityAtTile.talkText && dist <= INTERACT_RANGE) {
        options.push({ label: "Talk", action: () => {
          this.turnManager.queueAction({ type: "TALK", unitId: localId, targetId: entityAtTile.id });
          this.showTalkDialog(entityAtTile.name, entityAtTile.talkText!);
        }});
      }
      // Examine (always available)
      options.push({ label: "Examine", action: () => {
        this.showTalkDialog(entityAtTile.name, `${entityAtTile.name} — HP: ${entityAtTile.hp}/${entityAtTile.maxHp} | STR: ${entityAtTile.stats.strength} WIS: ${entityAtTile.stats.wisdom} AGI: ${entityAtTile.stats.agility}`);
      }});
      // Attack (hostile or any entity if in range and have AP)
      if (localUnit.actionPoints > 0 && entityAtTile.id !== localId) {
        const weapon = this.getEquippedWeapon(localUnit);
        const range = weapon?.range ?? 1;
        if (dist <= range) {
          options.push({ label: `Attack (${weapon?.name ?? "Fists"})`, action: () => {
            this.turnManager.queueAction({ type: "ATTACK", unitId: localId, targetId: entityAtTile.id, weaponItemId: weapon?.id });
          }});
        }
      }
    }

    // Pick up ground item
    if (tile.y >= 0 && tile.y < state.mapHeight && tile.x >= 0 && tile.x < state.mapWidth) {
      const worldTile = state.worldTiles[tile.y][tile.x];
      if (worldTile.groundItem && dist <= INTERACT_RANGE) {
        const item = state.items[worldTile.groundItem];
        options.push({ label: `Pick up ${item?.name ?? worldTile.groundItem}`, action: () => {
          this.turnManager.queueAction({ type: "PICK_UP", unitId: localId, tile });
        }});
      }
    }

    if (options.length === 0) return;

    const container = this.add.container(px, py).setDepth(100);
    const bgHeight = options.length * 28 + 8;
    const bgWidth = 160;
    const bg = this.add.rectangle(0, bgHeight / 2, bgWidth, bgHeight, 0x222233, 0.95).setOrigin(0, 0.5);
    bg.setStrokeStyle(1, 0x6666aa);
    container.add(bg);

    options.forEach((opt, i) => {
      const txt = this.add.text(8, 4 + i * 28, opt.label, { fontSize: "13px", color: "#ffffff", backgroundColor: "#333355", padding: { x: 4, y: 4 } })
        .setInteractive({ useHandCursor: true });
      txt.on("pointerover", () => txt.setColor("#ffcc00"));
      txt.on("pointerout", () => txt.setColor("#ffffff"));
      txt.on("pointerup", () => { this.closeContextMenu(); opt.action(); });
      container.add(txt);
    });

    // Adjust position if menu would go off-screen
    if (px + bgWidth > this.scale.width) container.x = this.scale.width - bgWidth - 4;
    if (py + bgHeight > this.scale.height) container.y = this.scale.height - bgHeight - 4;

    this.ctxMenu = container;
  }

  private closeContextMenu(): void {
    if (this.ctxMenu) { this.ctxMenu.destroy(); this.ctxMenu = null; }
  }

  // ─── Talk dialog ──────────────────────────────────────────────────────────

  private showTalkDialog(name: string, text: string): void {
    this.closeTalkDialog();
    const { width, height } = this.scale;
    const dw = Math.min(400, width - 40);
    const container = this.add.container(width / 2, height - 80).setDepth(100);

    const bg = this.add.rectangle(0, 0, dw, 60, 0x111122, 0.95).setStrokeStyle(1, 0x6666aa);
    const nameText = this.add.text(-dw / 2 + 10, -20, name, { fontSize: "13px", color: "#ffcc00", fontStyle: "bold" });
    const bodyText = this.add.text(-dw / 2 + 10, 0, text, { fontSize: "12px", color: "#cccccc", wordWrap: { width: dw - 20 } });
    container.add([bg, nameText, bodyText]);

    this.talkDialog = container;
    this.time.delayedCall(4000, () => this.closeTalkDialog());
  }

  private closeTalkDialog(): void {
    if (this.talkDialog) { this.talkDialog.destroy(); this.talkDialog = null; }
  }

  // ─── Inventory popup ──────────────────────────────────────────────────────

  private toggleInventory(): void {
    if (this.invPanel) { this.invPanel.destroy(); this.invPanel = null; return; }
    const state = this.turnManager.getState();
    const localUnit = state.entities[this.localUnitId()];
    if (!localUnit) return;

    const { width, height } = this.scale;
    const pw = 320, ph = 260;
    const container = this.add.container(width / 2, height / 2).setDepth(90);

    const bg = this.add.rectangle(0, 0, pw, ph, 0x111122, 0.95).setStrokeStyle(2, 0x6666aa);
    container.add(bg);

    const title = this.add.text(0, -ph / 2 + 8, `${localUnit.name} — Inventory`, { fontSize: "14px", color: "#ffcc00" }).setOrigin(0.5, 0);
    container.add(title);

    // Equipment slots (left side)
    const slotNames: Array<{ key: keyof typeof localUnit.inventory.equipment; label: string }> = [
      { key: "helmet", label: "Head" },
      { key: "chest", label: "Chest" },
      { key: "leftHand", label: "L.Hand" },
      { key: "rightHand", label: "R.Hand" },
      { key: "boots", label: "Boots" },
    ];

    const eqStartY = -ph / 2 + 40;
    slotNames.forEach((slot, i) => {
      const y = eqStartY + i * 28;
      const itemId = localUnit.inventory.equipment[slot.key];
      const item = itemId ? state.items[itemId] : null;
      const label = `${slot.label}: ${item?.name ?? "(empty)"}`;
      const txt = this.add.text(-pw / 2 + 12, y, label, { fontSize: "12px", color: item ? "#aaddff" : "#666666" });
      container.add(txt);
    });

    // Bag (right side)
    const bagTitle = this.add.text(40, -ph / 2 + 40, "Bag:", { fontSize: "12px", color: "#aaaaaa" });
    container.add(bagTitle);

    localUnit.inventory.bag.forEach((itemId, i) => {
      const item = state.items[itemId];
      const y = -ph / 2 + 64 + i * 22;
      const txt = this.add.text(46, y, item?.name ?? itemId, { fontSize: "11px", color: "#cccccc" })
        .setInteractive({ useHandCursor: true });
      txt.on("pointerup", () => {
        // Equip the item from bag
        if (item?.equipSlot) {
          this.equipItemFromBag(itemId, item.equipSlot);
          this.invPanel?.destroy();
          this.invPanel = null;
          this.toggleInventory(); // refresh
        }
      });
      container.add(txt);
    });

    // Close button
    const closeBtn = this.add.text(pw / 2 - 10, -ph / 2 + 8, "X", { fontSize: "14px", color: "#ff6666" })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on("pointerup", () => { this.invPanel?.destroy(); this.invPanel = null; });
    container.add(closeBtn);

    this.invPanel = container;
  }

  private equipItemFromBag(itemId: string, slot: string): void {
    // This modifies state locally for immediate feedback.
    // In a full implementation, equip actions would be queued. For now, mutate directly.
    const state = this.turnManager.getState();
    const localId = this.localUnitId();
    const unit = state.entities[localId];
    if (!unit) return;

    const equipment = { ...unit.inventory.equipment };
    const bag = [...unit.inventory.bag];

    // Swap: if slot is occupied, put old item back in bag
    const slotKey = slot as keyof typeof equipment;
    const oldItemId = equipment[slotKey];
    if (oldItemId) bag.push(oldItemId);

    // Remove new item from bag, equip it
    const bagIdx = bag.indexOf(itemId);
    if (bagIdx >= 0) bag.splice(bagIdx, 1);
    equipment[slotKey] = itemId;

    // Use queueAction with a USE_ITEM to record the equip
    this.turnManager.queueAction({ type: "USE_ITEM", unitId: localId, itemId });
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  private animateActions(actions: Action[], entityId: string, onDone: () => void): void {
    const toAnimate = actions.filter(a => a.type === "MOVE" || a.type === "ATTACK");

    if (toAnimate.length === 0) {
      this.time.delayedCall(200, onDone);
      return;
    }

    // Pan camera to the active entity before animating
    const sprite = this.entitySprites.get(entityId);
    if (sprite) {
      this.cameras.main.pan(sprite.x, sprite.y, 300, "Quad.easeInOut");
    }

    let i = 0;
    const step = () => {
      if (i >= toAnimate.length) { onDone(); return; }
      const action = toAnimate[i++];
      const originX = this.scale.width / 2;

      if (action.type === "MOVE") {
        const s = this.entitySprites.get(action.unitId);
        if (s) {
          const { sx, sy } = tileToScreen(action.to.x, action.to.y, originX, ORIGIN_Y);
          this.tweens.add({
            targets: s, x: sx, y: sy - 16, duration: ACTION_DELAY - 50, ease: "Quad.easeOut",
            onComplete: () => this.time.delayedCall(50, step),
          });
          return;
        }
      }

      if (action.type === "ATTACK") {
        const attacker = this.entitySprites.get(action.unitId);
        const target = this.entitySprites.get(action.targetId);
        if (attacker && target) {
          const origX = attacker.x, origY = attacker.y;
          this.tweens.add({
            targets: attacker, x: target.x, y: target.y, duration: 120, ease: "Quad.easeIn",
            onComplete: () => {
              if (target) target.setTint(0xff0000);
              this.time.delayedCall(80, () => {
                if (target) target.clearTint();
                this.tweens.add({
                  targets: attacker, x: origX, y: origY, duration: 120, ease: "Quad.easeOut",
                  onComplete: () => this.time.delayedCall(50, step),
                });
              });
            },
          });
          return;
        }
      }

      this.time.delayedCall(ACTION_DELAY, step);
    };

    this.time.delayedCall(350, step); // wait for pan
  }

  // ─── History bar ──────────────────────────────────────────────────────────

  private refreshHistoryBar(): void {
    this.historySlots.forEach(c => c.destroy());
    this.historySlots = [];
    if (this.playBtnRef) { this.playBtnRef.destroy(); this.playBtnRef = null; }

    const history = this.turnManager.getHistory();
    const { width } = this.scale;
    const centerX = width / 2;
    const centerY = BAR_HEIGHT / 2;
    const state = this.turnManager.getState();

    const past = history.slice(-5);
    const currentEntityId = this.turnManager.getCurrentEntityId();
    const currentEntity = currentEntityId ? state.entities[currentEntityId] : null;
    const currentLabel = currentEntity?.name ?? currentEntityId ?? "?";

    const upcoming = buildUpcoming(state, 5);

    const all = [
      ...past.map(e => ({ entry: e as HistoryEntry | null, type: "past" as const, label: e.label })),
      { entry: null as HistoryEntry | null, type: "now" as const, label: currentLabel },
      ...upcoming.map(u => ({ entry: null as HistoryEntry | null, type: "future" as const, label: u.label })),
    ];

    this.add.rectangle(centerX, centerY, width, BAR_HEIGHT, 0x111122, 0.9).setDepth(20);

    const totalSlots = all.length;
    const startX = centerX - ((totalSlots - 1) / 2) * (SLOT_SIZE + 4);

    all.forEach(({ entry, type, label }, i) => {
      const x = startX + i * (SLOT_SIZE + 4);
      const container = this.add.container(x, centerY).setDepth(21);

      const isNow = type === "now";
      const historyIndex = type === "past" ? history.length - past.length + i : -1;
      const isCursor = historyIndex >= 0 && this.historyCursorIdx === historyIndex;

      const bgColor = isNow ? 0x445566 : isCursor ? 0xaa5500 : type === "past" ? 0x334455 : 0x223344;
      const bg = this.add.rectangle(0, 0, SLOT_SIZE, SLOT_SIZE, bgColor, 1);
      container.add(bg);

      // Truncate label for narrow slots
      const displayLabel = label.length > 6 ? label.slice(0, 5) + "…" : label;
      const text = this.add.text(0, 0, displayLabel, { fontSize: "10px", color: "#ffffff" }).setOrigin(0.5);
      container.add(text);

      if (type === "past" && entry) {
        bg.setInteractive({ useHandCursor: true });
        bg.on("pointerover", () => bg.setFillStyle(isCursor ? 0xcc7700 : 0x556677));
        bg.on("pointerout", () => bg.setFillStyle(isCursor ? 0xaa5500 : bgColor));
        bg.on("pointerup", () => {
          if (isCursor) {
            this.historyCursorIdx = -1;
            this.isRewound = false;
            this.syncSprites(this.turnManager.getState());
          } else {
            this.historyCursorIdx = historyIndex;
            this.isRewound = true;
            this.snapSpritesToSnapshot(entry.entitySnapshot);
          }
          this.refreshHistoryBar();
        });
      }

      if (isCursor) {
        const g = this.add.graphics();
        g.lineStyle(3, 0xffaa00, 1);
        g.strokeRect(-(SLOT_SIZE / 2 + 2), -(SLOT_SIZE / 2 + 2), SLOT_SIZE + 4, SLOT_SIZE + 4);
        container.add(g);
      }

      if (isNow) {
        const glow = this.add.graphics();
        glow.lineStyle(3, 0x44ff88, 1);
        glow.strokeRect(-(SLOT_SIZE / 2 + 2), -(SLOT_SIZE / 2 + 2), SLOT_SIZE + 4, SLOT_SIZE + 4);
        container.add(glow);
        this.tweens.add({ targets: glow, alpha: 0.2, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }

      this.historySlots.push(container);
    });

    if (this.historyCursorIdx >= 0) {
      this.playBtnRef = this.add
        .text(width - 10, centerY, "▶ Play", { fontSize: "13px", color: "#ffcc00", backgroundColor: "#334455", padding: { x: 8, y: 4 } })
        .setOrigin(1, 0.5).setDepth(22).setInteractive({ useHandCursor: true });

      this.playBtnRef.on("pointerup", () => {
        if (this.turnManager.isBusy()) return;
        const cursor = this.historyCursorIdx;
        this.historyCursorIdx = -1;
        this.refreshHistoryBar();
        this.turnManager.replayFromIndex(cursor, () => {
          this.isRewound = false;
          this.syncSprites(this.turnManager.getState());
          this.refreshHistoryBar();
        });
      });
    }
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private setupUI(): void {
    const { width, height } = this.scale;

    this.uiText = this.add.text(10, BAR_HEIGHT + 6, "", { fontSize: "12px", color: "#ffffff" }).setDepth(10);

    this.add.text(10, height - 10, `Game: ${this.turnManager.getState().gameId}`, { fontSize: "12px", color: "#666666" }).setOrigin(0, 1).setDepth(10);

    this.endTurnBtn = this.add
      .text(width - 16, height - 16, "[ End Turn ]", { fontSize: "16px", color: "#ffdd88" })
      .setOrigin(1, 1).setDepth(10).setInteractive({ useHandCursor: true });
    this.endTurnBtn.on("pointerup", () => {
      if (this.turnManager.isLocalTurn()) this.turnManager.endTurn();
    });

    // Inventory button
    const invBtn = this.add
      .text(width - 16, height - 40, "[ Inventory ]", { fontSize: "14px", color: "#aaddff" })
      .setOrigin(1, 1).setDepth(10).setInteractive({ useHandCursor: true });
    invBtn.on("pointerup", () => this.toggleInventory());

    // Left-click to move
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      if (!this.turnManager.isLocalTurn()) return;
      if (pointer.y < BAR_HEIGHT) return;
      // Don't move if clicking on UI elements
      if (this.ctxMenu || this.invPanel) return;

      const state = this.turnManager.getState();
      const localId = this.localUnitId();
      const unit = state.entities[localId];
      if (!unit || unit.movementPoints <= 0) return;

      const tile = screenToTile(pointer.x, pointer.y, this.scale.width / 2, ORIGIN_Y);
      if (tile.x >= 0 && tile.x < state.mapWidth && tile.y >= 0 && tile.y < state.mapHeight) {
        this.turnManager.queueAction({ type: "MOVE", unitId: localId, to: tile });
      }
    });
  }

  private refreshUI(state: GameState): void {
    const isMyTurn = this.turnManager.isLocalTurn();
    const localId = this.localUnitId();
    const unit = state.entities[localId];

    const currentEntityId = this.turnManager.getCurrentEntityId();
    const currentEntity = currentEntityId ? state.entities[currentEntityId] : null;
    let turnLabel: string;
    if (currentEntity?.type === "player" && currentEntityId === localId) {
      turnLabel = ">> YOUR TURN <<";
    } else if (currentEntity?.type === "player") {
      turnLabel = "Waiting for opponent...";
    } else {
      turnLabel = `${currentEntity?.name ?? "NPC"} moving...`;
    }

    const combatLabel = state.combatActive ? "  ⚔ COMBAT" : "";
    this.uiText.setText([
      `You: ${this.playerSlot}  |  Round ${state.round}  |  ${turnLabel}${combatLabel}`,
      unit ? `MP: ${unit.movementPoints}  AP: ${unit.actionPoints}  HP: ${unit.hp}/${unit.maxHp}  STR:${unit.stats.strength} WIS:${unit.stats.wisdom} AGI:${unit.stats.agility}` : "(dead)",
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private localUnitId(): string {
    return this.playerSlot === "playerA" ? "player_a" : "player_b";
  }

  private getEquippedWeapon(entity: Entity): { id: string; name: string; range: number } | null {
    const state = this.turnManager.getState();
    const weaponId = entity.inventory.equipment.rightHand;
    if (!weaponId) return null;
    const item = state.items[weaponId];
    if (!item) return null;
    return { id: item.id, name: item.name, range: item.range ?? 1 };
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

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

function buildUpcoming(state: GameState, count: number): { label: string }[] {
  const result: { label: string }[] = [];
  let turnIdx = state.turnIndex + 1;
  let round = state.round;
  let order = [...state.turnOrder];

  while (result.length < count) {
    if (turnIdx >= order.length) {
      // Next round — rebuild turn order
      round++;
      const rng = new RNG(RNG.turnSeed(state.seed, round));
      order = buildTurnOrder(state, rng);
      turnIdx = 0;
    }
    const eid = order[turnIdx];
    const entity = state.entities[eid];
    if (entity && entity.hp > 0) {
      result.push({ label: entity.name });
    }
    turnIdx++;
  }
  return result;
}

function buildInitialState(session: GameSession): GameState {
  const { tiles, entities, items } = generateWorld(session.seed, MAP_SIZE, MAP_SIZE);
  return {
    gameId: session.gameId,
    round: 0,
    turnOrder: [],
    turnIndex: 0,
    entities,
    worldTiles: tiles,
    items,
    seed: session.seed,
    combatActive: false,
    mapWidth: MAP_SIZE,
    mapHeight: MAP_SIZE,
  };
}
