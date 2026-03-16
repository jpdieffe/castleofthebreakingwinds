import Phaser from "phaser";
import { ensureSignedIn } from "../../firebase/auth";
import { createSession, joinSession } from "../../firebase/turnService";
import type { GameSession, PlayerSlot } from "../../types";

/**
 * MainMenuScene: lets a player create a new game or join an existing one.
 * Transitions to GameScene with session + playerSlot once ready.
 */
export class MainMenuScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 4, "Castle of the Breaking Winds", {
        fontSize: "28px",
        color: "#f0e0c0",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // ── New Game button ───────────────────────────────────────────────────────
    const newGameBtn = this.add
      .text(width / 2, height / 2 - 40, "[ New Game ]", {
        fontSize: "20px",
        color: "#ffdd88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    newGameBtn.on("pointerup", () => this.onNewGame());

    // ── Join Game button ──────────────────────────────────────────────────────
    const joinBtn = this.add
      .text(width / 2, height / 2 + 20, "[ Join Game ]", {
        fontSize: "20px",
        color: "#88ddff",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    joinBtn.on("pointerup", () => this.onJoinGame());

    this.statusText = this.add
      .text(width / 2, height / 2 + 80, "", {
        fontSize: "14px",
        color: "#aaaaaa",
        wordWrap: { width: width - 60 },
        align: "center",
      })
      .setOrigin(0.5);
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  private async onNewGame(): Promise<void> {
    this.statusText.setText("Signing in...");

    let user;
    try {
      user = await ensureSignedIn();
    } catch (e) {
      this.statusText.setText(`Auth error: ${e}`);
      return;
    }

    const gameId = generateGameId();
    const seed = (Math.random() * 0xffffffff) >>> 0;

    const session: GameSession = {
      gameId,
      seed,
      playerAUid: user.uid,
      playerBUid: null,
      currentTurn: 0,
      status: "waiting",
    };

    // Show code immediately — don't wait for Firebase
    this.statusText.setText(
      `Share this code with your friend:\n\n${gameId}\n\n(copy it, then click Start)`
    );

    const { width, height } = this.scale;

    const startBtn = this.add
      .text(width / 2, height / 2 + 140, "[ Start Game ]", {
        fontSize: "18px",
        color: "#88ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // Save to Firebase in background — show error if it fails
    createSession(session).catch((e) => {
      this.statusText.setText(`Firebase error: ${e}\n\nGame code: ${gameId}`);
    });

    startBtn.on("pointerup", () => {
      startBtn.destroy();
      this.scene.start("GameScene", {
        session,
        playerSlot: "playerA" as PlayerSlot,
      });
    });
  }

  private async onJoinGame(): Promise<void> {
    const gameId = window.prompt("Enter game code:");
    if (!gameId) return;

    this.statusText.setText("Joining...");
    const user = await ensureSignedIn();

    const session = await joinSession(gameId.trim(), user.uid);
    if (!session) {
      this.statusText.setText("Game not found or already full.");
      return;
    }

    this.scene.start("GameScene", {
      session,
      playerSlot: "playerB" as PlayerSlot,
    });
  }
}

function generateGameId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
