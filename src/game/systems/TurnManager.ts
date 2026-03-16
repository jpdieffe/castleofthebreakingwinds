import type { GameState, Action, TurnLog, PlayerSlot, RoundPhase, HistoryEntry } from "../../types";
import { applyActions, runNpcPhase, MOVEMENT_POINTS, ACTION_POINTS } from "../simulation/GameState";
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

  isLocalTurn(): boolean {
    return !this.busy && this.state.phase === this.localPlayer;
  }

  queueAction(action: Action): void {
    if (!this.isLocalTurn()) return;
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

    // If playerB just ended, run enemy phase locally then advance to next round
    if (this.state.phase === "playerB") {
      this.busy = true;
      this.onAnimate([], "enemies", () => {
        const stateAfterEnemies = runNpcPhase(this.state, npcSeed);
        this.pushHistory({ round: this.state.round, phase: "enemies", label: "Enemies", log: null });
        this.state = this.advancePhase(stateAfterEnemies);
        this.busy = false;
        this.onStateChanged(this.state);
      });
    } else {
      this.state = this.advancePhase(this.state);
      this.onStateChanged(this.state);
    }

    await submitTurn(log);
  }

  // Replay a history entry visually (does not change actual state)
  replayEntry(entry: HistoryEntry): void {
    if (!entry.log) return;
    this.busy = true;
    this.onAnimate(entry.log.actions, entry.phase as RoundPhase, () => {
      this.busy = false;
    });
  }

  //  Private 

  private applyRemoteTurn(log: TurnLog): void {
    if (log.playerId === this.localPlayer) return;
    if (log.round !== this.state.round) return;
    if (log.phase !== this.state.phase) return;

    this.busy = true;
    this.onAnimate(log.actions, log.phase, () => {
      this.state = applyActions(this.state, log.actions);
      this.pushHistory({ round: log.round, phase: log.phase, label: log.phase === "playerA" ? "P1" : "P2", log });

      if (log.phase === "playerB") {
        // Run enemy phase after both players have gone
        this.onAnimate([], "enemies", () => {
          const stateAfterEnemies = runNpcPhase(this.state, log.npcSeed);
          this.pushHistory({ round: this.state.round, phase: "enemies", label: "Enemies", log: null });
          this.state = this.advancePhase(stateAfterEnemies);
          this.busy = false;
          this.onStateChanged(this.state);
        });
      } else {
        this.state = this.advancePhase(this.state);
        this.busy = false;
        this.onStateChanged(this.state);
      }
    });
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
