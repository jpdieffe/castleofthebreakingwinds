import type { GameState, Action, TurnLog, PlayerSlot } from "../../types";
import { applyActions, runNpcPhase, MOVEMENT_POINTS, ACTION_POINTS } from "../simulation/GameState";
import { RNG } from "../simulation/RNG";
import { submitTurn, subscribeTurns } from "../../firebase/turnService";

/**
 * TurnManager sits between the Phaser scene and Firestore.
 * It owns the authoritative local GameState and drives the turn loop.
 */
export class TurnManager {
  private state: GameState;
  private pendingActions: Action[] = [];
  private unsubscribe: (() => void) | null = null;
  private localPlayer: PlayerSlot;
  private onStateChanged: (state: GameState) => void;

  constructor(
    initialState: GameState,
    localPlayer: PlayerSlot,
    onStateChanged: (state: GameState) => void
  ) {
    this.state = initialState;
    this.localPlayer = localPlayer;
    this.onStateChanged = onStateChanged;
  }

  /** Call once the scene is ready to start receiving turns. */
  start(): void {
    this.unsubscribe = subscribeTurns(this.state.gameId, (log) => {
      this.applyRemoteTurn(log);
    });
  }

  stop(): void {
    this.unsubscribe?.();
  }

  getState(): GameState {
    return this.state;
  }

  isLocalTurn(): boolean {
    return this.state.activePlayer === this.localPlayer;
  }

  /** Queue an action during the local player's turn. */
  queueAction(action: Action): void {
    if (!this.isLocalTurn()) return;
    this.pendingActions.push(action);
    // Optimistically apply for immediate visual feedback
    this.state = applyActions(this.state, [action]);
    this.onStateChanged(this.state);
  }

  /** Finalise the local player's turn and push to Firestore. */
  async endTurn(): Promise<void> {
    if (!this.isLocalTurn()) return;

    this.pendingActions.push({ type: "END_TURN" });

    const npcSeed = RNG.turnSeed(this.state.seed, this.state.turn);

    const log: TurnLog = {
      gameId: this.state.gameId,
      turn: this.state.turn,
      playerId: this.localPlayer,
      actions: [...this.pendingActions],
      npcSeed,
      timestamp: Date.now(),
    };

    // Run NPC phase locally
    this.state = runNpcPhase(this.state, npcSeed);
    this.advanceTurn();
    this.pendingActions = [];
    this.onStateChanged(this.state);

    await submitTurn(log);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private applyRemoteTurn(log: TurnLog): void {
    // Ignore turns we've already processed or turns from ourselves
    if (log.playerId === this.localPlayer) return;
    if (log.turn !== this.state.turn) return;

    this.state = applyActions(this.state, log.actions);
    this.state = runNpcPhase(this.state, log.npcSeed);
    this.advanceTurn();
    this.onStateChanged(this.state);
  }

  private advanceTurn(): void {
    // Reset AP/MP for the next active player's units after both have moved
    const nextPlayer =
      this.state.activePlayer === "playerA" ? "playerB" : "playerA";
    const nextTurn =
      nextPlayer === "playerA" ? this.state.turn + 1 : this.state.turn;

    const entities = { ...this.state.entities };
    const nextUnitId = nextPlayer === "playerA" ? "player_a" : "player_b";
    if (entities[nextUnitId]) {
      entities[nextUnitId] = {
        ...entities[nextUnitId],
        movementPoints: MOVEMENT_POINTS,
        actionPoints: ACTION_POINTS,
      };
    }

    this.state = {
      ...this.state,
      turn: nextTurn,
      activePlayer: nextPlayer,
      entities,
    };
  }
}
