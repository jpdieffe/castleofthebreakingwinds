import type { GameState, Action, TurnLog, PlayerSlot, HistoryEntry } from "../../types";
import { applyActions, runNpcTurn, buildTurnOrder, checkCombatEnd, checkAggroCombat, MOVEMENT_POINTS, ACTION_POINTS } from "../simulation/GameState";
import type { NpcTurnResult } from "../simulation/GameState";
import { RNG } from "../simulation/RNG";
import { submitTurn, subscribeTurns } from "../../firebase/turnService";

export type AnimateCallback = (actions: Action[], entityId: string, onDone: () => void) => void;

export class TurnManager {
  private state: GameState;
  private pendingActions: Action[] = [];
  private unsubscribe: (() => void) | null = null;
  private localPlayer: PlayerSlot;
  private onStateChanged: (state: GameState) => void;
  private onAnimate: AnimateCallback;
  private history: HistoryEntry[] = [];
  private busy = false;
  private processedLogs = new Set<string>();
  private turnStartSnapshot: Record<string, { x: number; y: number }> | null = null;

  constructor(
    initialState: GameState,
    localPlayer: PlayerSlot,
    onStateChanged: (state: GameState) => void,
    onAnimate: AnimateCallback
  ) {
    this.state = initialState;
    this.localPlayer = localPlayer;
    this.onStateChanged = onStateChanged;
    this.onAnimate = onAnimate;

    // Build initial turn order
    const rng = new RNG(RNG.turnSeed(initialState.seed, initialState.round));
    this.state = {
      ...this.state,
      turnOrder: buildTurnOrder(this.state, rng),
      turnIndex: 0,
    };
  }

  start(): void {
    this.unsubscribe = subscribeTurns(this.state.gameId, (log) => {
      this.applyRemoteTurn(log);
    });
    // If it's an NPC's turn at the start, kick it off
    this.maybeRunNpcTurn();
  }

  stop(): void {
    this.unsubscribe?.();
  }

  getState(): GameState { return this.state; }
  getHistory(): HistoryEntry[] { return [...this.history]; }
  isBusy(): boolean { return this.busy; }

  /** Which entity's turn is it right now? */
  getCurrentEntityId(): string | undefined {
    return this.state.turnOrder[this.state.turnIndex];
  }

  /** Is it the local player's turn (either player_a or player_b matching this.localPlayer)? */
  isLocalTurn(): boolean {
    if (this.busy) return false;
    const currentId = this.getCurrentEntityId();
    if (!currentId) return false;
    const entity = this.state.entities[currentId];
    if (!entity || entity.type !== "player") return false;
    const playerEntityId = this.localPlayer === "playerA" ? "player_a" : "player_b";
    return currentId === playerEntityId;
  }

  private takeSnapshot(): Record<string, { x: number; y: number }> {
    const snap: Record<string, { x: number; y: number }> = {};
    for (const [id, entity] of Object.entries(this.state.entities)) {
      snap[id] = { x: entity.pos.x, y: entity.pos.y };
    }
    return snap;
  }

  queueAction(action: Action): void {
    if (!this.isLocalTurn()) return;
    if (!this.turnStartSnapshot) {
      this.turnStartSnapshot = this.takeSnapshot();
    }
    this.pendingActions.push(action);
    this.state = applyActions(this.state, [action]);
    this.onStateChanged(this.state);
  }

  async endTurn(): Promise<void> {
    if (!this.isLocalTurn()) return;
    this.pendingActions.push({ type: "END_TURN" });

    const entityId = this.getCurrentEntityId()!;
    const npcSeed = RNG.turnSeed(this.state.seed, this.state.round * 100 + this.state.turnIndex);

    const log: TurnLog = {
      gameId: this.state.gameId,
      round: this.state.round,
      turnIndex: this.state.turnIndex,
      entityId,
      playerId: this.localPlayer,
      actions: [...this.pendingActions],
      npcSeed,
      timestamp: Date.now(),
    };

    const entity = this.state.entities[entityId];
    const label = entity?.name ?? entityId;
    const snapshot = this.turnStartSnapshot ?? this.takeSnapshot();
    this.turnStartSnapshot = null;
    this.pendingActions = [];

    this.pushHistory({ round: this.state.round, turnIndex: this.state.turnIndex, entityId, label, log, entitySnapshot: snapshot });

    this.advanceTurn();
    this.onStateChanged(this.state);

    await submitTurn(log);

    // After our turn, maybe NPCs go next
    this.maybeRunNpcTurn();
  }

  replayFromIndex(startIdx: number, onDone: () => void): void {
    if (this.busy) return;
    const entries = this.history.slice(startIdx);
    if (entries.length === 0) { onDone(); return; }
    this.busy = true;
    let i = 0;
    const playNext = () => {
      if (i >= entries.length) { this.busy = false; onDone(); return; }
      const entry = entries[i++];
      const actions = entry.log?.actions ?? entry.actions ?? [];
      this.onAnimate(actions, entry.entityId, playNext);
    };
    playNext();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private applyRemoteTurn(log: TurnLog): void {
    const logKey = `${log.round}_${log.turnIndex}`;
    if (this.processedLogs.has(logKey)) return;
    if (log.playerId === this.localPlayer) return;
    // Must match current turn
    if (log.round !== this.state.round || log.turnIndex !== this.state.turnIndex) return;

    this.processedLogs.add(logKey);
    this.busy = true;
    const snapshot = this.takeSnapshot();

    this.onAnimate(log.actions, log.entityId, () => {
      this.state = applyActions(this.state, log.actions);
      const entity = this.state.entities[log.entityId];
      const label = entity?.name ?? log.entityId;
      this.pushHistory({ round: log.round, turnIndex: log.turnIndex, entityId: log.entityId, label, log, entitySnapshot: snapshot });
      this.advanceTurn();
      this.busy = false;
      this.onStateChanged(this.state);
      this.maybeRunNpcTurn();
    });
  }

  /** Advance to the next turn index, or next round if at end of turn order. */
  private advanceTurn(): void {
    // Reset the current entity's AP/MP for next round
    let nextIndex = this.state.turnIndex + 1;

    if (nextIndex >= this.state.turnOrder.length) {
      // New round
      this.state = checkCombatEnd(this.state);
      this.state = checkAggroCombat(this.state);
      const newRound = this.state.round + 1;
      const rng = new RNG(RNG.turnSeed(this.state.seed, newRound));
      const newOrder = buildTurnOrder(this.state, rng);

      // Reset all participants' AP/MP
      const entities = { ...this.state.entities };
      for (const id of newOrder) {
        const e = entities[id];
        if (e) {
          entities[id] = { ...e, movementPoints: e.type === "player" ? MOVEMENT_POINTS : e.movementPoints, actionPoints: e.type === "player" ? ACTION_POINTS : e.actionPoints };
        }
      }

      this.state = { ...this.state, entities, round: newRound, turnOrder: newOrder, turnIndex: 0 };
    } else {
      // Reset next entity's AP/MP
      const nextId = this.state.turnOrder[nextIndex];
      const nextEntity = this.state.entities[nextId];
      if (nextEntity) {
        const mp = nextEntity.type === "player" ? MOVEMENT_POINTS : nextEntity.movementPoints;
        const ap = nextEntity.type === "player" ? ACTION_POINTS : nextEntity.actionPoints;
        this.state = {
          ...this.state,
          turnIndex: nextIndex,
          entities: { ...this.state.entities, [nextId]: { ...nextEntity, movementPoints: mp, actionPoints: ap } },
        };
      } else {
        this.state = { ...this.state, turnIndex: nextIndex };
      }
    }
  }

  /** If the current turn belongs to an NPC, run their AI automatically. */
  private maybeRunNpcTurn(): void {
    if (this.busy) return;
    const entityId = this.getCurrentEntityId();
    if (!entityId) return;
    const entity = this.state.entities[entityId];
    if (!entity || entity.type === "player") return;

    // It's an NPC turn — run it
    this.busy = true;
    const npcSeed = RNG.turnSeed(this.state.seed, this.state.round * 100 + this.state.turnIndex);
    const snapshot = this.takeSnapshot();
    const { state: newState, actions }: NpcTurnResult = runNpcTurn(this.state, entityId, npcSeed);

    this.onAnimate(actions, entityId, () => {
      this.state = newState;
      const label = entity.name ?? entityId;
      this.pushHistory({ round: this.state.round, turnIndex: this.state.turnIndex, entityId, label, log: null, actions, entitySnapshot: snapshot });
      this.advanceTurn();
      this.busy = false;
      this.onStateChanged(this.state);

      // Chain: maybe the next entity is also an NPC
      this.time(() => this.maybeRunNpcTurn(), 100);
    });
  }

  /** Simple setTimeout wrapper (not a Phaser timer — TurnManager has no Phaser dependency). */
  private time(fn: () => void, ms: number): void {
    setTimeout(fn, ms);
  }

  private pushHistory(entry: HistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > 50) this.history.shift();
  }
}
