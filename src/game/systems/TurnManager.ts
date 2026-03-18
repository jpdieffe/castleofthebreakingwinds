import type { GameState, Action, TurnLog, PlayerSlot, RoundPhase, HistoryEntry } from "../../types";
import { applyActions, runNpcPhase, MOVEMENT_POINTS, ACTION_POINTS } from "../simulation/GameState";
import type { NpcPhaseResult } from "../simulation/GameState";
import { RNG } from "../simulation/RNG";
import { submitTurn, subscribeTurns } from "../../firebase/turnService";

export type AnimateCallback = (actions: Action[], phase: RoundPhase, onDone: () => void) => void;

export class TurnManager {
  private state: GameState;
  private pendingActions: Action[] = [];
  private unsubscribe: (() => void) | null = null;
  private localPlayer: PlayerSlot;
  private onStateChanged: (state: GameState) => void;
  private onAnimate: AnimateCallback;
  private history: HistoryEntry[] = [];
  private busy = false; // lock during animation
  private processedLogs = new Set<string>(); // dedup guard against Firestore re-delivery
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
  }

  start(): void {
    this.unsubscribe = subscribeTurns(this.state.gameId, (log) => {
      this.applyRemoteTurn(log);
    });
  }

  stop(): void {
    this.unsubscribe?.();
  }

  getState(): GameState { return this.state; }
  getHistory(): HistoryEntry[] { return [...this.history]; }
  isBusy(): boolean { return this.busy; }

  /** Snapshot current entity positions — used to record where entities were before each action set. */
  private takeSnapshot(): Record<string, { x: number; y: number }> {
    const snap: Record<string, { x: number; y: number }> = {};
    for (const [id, entity] of Object.entries(this.state.entities)) {
      snap[id] = { x: entity.pos.x, y: entity.pos.y };
    }
    return snap;
  }

  isLocalTurn(): boolean {
    return !this.busy && this.state.phase === this.localPlayer;
  }

  queueAction(action: Action): void {
    if (!this.isLocalTurn()) return;
    // Capture snapshot before the very first action of this turn
    if (!this.turnStartSnapshot) {
      this.turnStartSnapshot = this.takeSnapshot();
    }
    this.pendingActions.push(action);
    // Optimistic local apply for immediate feedback
    this.state = applyActions(this.state, [action]);
    this.onStateChanged(this.state);
  }

  async endTurn(): Promise<void> {
    if (!this.isLocalTurn()) return;
    this.pendingActions.push({ type: "END_TURN" });

    const npcSeed = RNG.turnSeed(this.state.seed, this.state.round);
    const log: TurnLog = {
      gameId: this.state.gameId,
      round: this.state.round,
      phase: this.state.phase as "playerA" | "playerB",
      playerId: this.localPlayer,
      actions: [...this.pendingActions],
      npcSeed,
      timestamp: Date.now(),
    };

    this.pendingActions = [];

    // Push the local player's own turn so both clients see the same history
    const phaseLabel = this.state.phase === "playerA" ? "P1" : "P2";
    const snapshot = this.turnStartSnapshot ?? this.takeSnapshot();
    this.turnStartSnapshot = null;
    this.pushHistory({ round: this.state.round, phase: this.state.phase as "playerA" | "playerB", label: phaseLabel, log, entitySnapshot: snapshot });

    // If playerB just ended, run enemy phase locally then advance to next round
    if (this.state.phase === "playerB") {
      this.busy = true;
      this.runEnemyPhase(npcSeed);
    } else {
      this.state = this.advancePhase(this.state);
      this.onStateChanged(this.state);
    }

    await submitTurn(log);
  }

  /** Replay all history entries from startIdx forward, one-by-one. Calls onDone on completion. */
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
      this.onAnimate(actions, entry.phase, playNext);
    };
    playNext();
  }

  //  Private 

  private applyRemoteTurn(log: TurnLog): void {
    const logKey = `${log.round}_${log.phase}`;
    if (this.processedLogs.has(logKey)) return;
    if (log.playerId === this.localPlayer) return;
    if (log.round !== this.state.round) return;
    if (log.phase !== this.state.phase) return;

    this.processedLogs.add(logKey);
    this.busy = true;
    const snapshot = this.takeSnapshot();
    this.onAnimate(log.actions, log.phase, () => {
      this.state = applyActions(this.state, log.actions);
      this.pushHistory({ round: log.round, phase: log.phase, label: log.phase === "playerA" ? "P1" : "P2", log, entitySnapshot: snapshot });

      if (log.phase === "playerB") {
        this.runEnemyPhase(log.npcSeed);
      } else {
        this.state = this.advancePhase(this.state);
        this.busy = false;
        this.onStateChanged(this.state);
      }
    });
  }

  /** Animate each enemy one-by-one, push one history entry per enemy, then advance phase. */
  private runEnemyPhase(npcSeed: number): void {
    const { entityTurns }: NpcPhaseResult = runNpcPhase(this.state, npcSeed);
    const currentRound = this.state.round;

    const runOne = (idx: number) => {
      if (idx >= entityTurns.length) {
        // All NPCs done — set phase to enemies so advancePhase rolls to next round
        this.state = { ...this.state, phase: "enemies" as const };
        this.state = this.advancePhase(this.state);
        this.busy = false;
        this.onStateChanged(this.state);
        return;
      }
      const { entityId, actions } = entityTurns[idx];
      const label = entityLabel(entityId);
      const npcSnap = this.takeSnapshot();
      this.onAnimate(actions, "enemies", () => {
        // Apply THIS NPC's actions to the live state so the next snapshot is up-to-date
        if (actions.length > 0) {
          for (const action of actions) {
            if (action.type === "MOVE") {
              const entity = this.state.entities[action.unitId];
              if (entity) {
                this.state = {
                  ...this.state,
                  entities: { ...this.state.entities, [action.unitId]: { ...entity, pos: action.to } },
                };
              }
            }
          }
        }
        this.pushHistory({ round: currentRound, phase: "enemies", label, log: null, actions, entitySnapshot: npcSnap });
        runOne(idx + 1);
      });
    };

    if (entityTurns.length === 0) {
      this.state = { ...this.state, phase: "enemies" as const };
      this.state = this.advancePhase(this.state);
      this.busy = false;
      this.onStateChanged(this.state);
      return;
    }

    runOne(0);
  }

  private advancePhase(state: GameState): GameState {
    const entities = { ...state.entities };

    if (state.phase === "playerA") {
      // Reset playerB AP/MP ready for their turn
      if (entities["player_b"]) {
        entities["player_b"] = { ...entities["player_b"], movementPoints: MOVEMENT_POINTS, actionPoints: ACTION_POINTS };
      }
      return { ...state, entities, phase: "playerB", activePlayer: "playerB" };
    }

    if (state.phase === "playerB") {
      // Enemy phase is handled inline; this shouldn't be called for playerB directly
      // but if called, move to enemies
      return { ...state, entities, phase: "enemies", activePlayer: "playerA" };
    }

    // After enemies: new round, reset playerA
    if (entities["player_a"]) {
      entities["player_a"] = { ...entities["player_a"], movementPoints: MOVEMENT_POINTS, actionPoints: ACTION_POINTS };
    }
    return { ...state, entities, phase: "playerA", activePlayer: "playerA", round: state.round + 1 };
  }

  private pushHistory(entry: HistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > 20) this.history.shift();
  }
}

/** Map an entity ID like "enemy_1" to a display label like "NPC1". */
function entityLabel(entityId: string): string {
  const m = entityId.match(/^enemy_(\d+)$/);
  return m ? `NPC${m[1]}` : entityId;
}
