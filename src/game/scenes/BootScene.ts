import Phaser from "phaser";

/**
 * BootScene: runs first, loads any assets needed for the menu,
 * then transitions to MainMenuScene.
 * Add heavy asset loading here as the game grows.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Nothing to load from disk — textures are generated in create()
  }

  create(): void {
    const g = this.add.graphics();

    const makeTexture = (key: string, color: number, w: number, h: number) => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    makeTexture("player_a",   0x4488ff, 32, 32);
    makeTexture("player_b",   0x44ff88, 32, 32);
    makeTexture("enemy",      0xff4444, 32, 32);
    makeTexture("tile_light", 0xccaa77, 64, 32);
    makeTexture("tile_dark",  0xaa8855, 64, 32);

    g.destroy();
    this.scene.start("MainMenuScene");
  }
}
