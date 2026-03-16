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
    // Placeholder — create a simple coloured rectangle as a stand-in sprite
    // until real sprite sheets are added
    const graphics = this.make.graphics({ x: 0, y: 0 });

    // Player A sprite (blue square)
    graphics.fillStyle(0x4488ff);
    graphics.fillRect(0, 0, 32, 32);
    graphics.generateTexture("player_a", 32, 32);

    // Player B sprite (green square)
    graphics.clear();
    graphics.fillStyle(0x44ff88);
    graphics.fillRect(0, 0, 32, 32);
    graphics.generateTexture("player_b", 32, 32);

    // Enemy sprite (red square)
    graphics.clear();
    graphics.fillStyle(0xff4444);
    graphics.fillRect(0, 0, 32, 32);
    graphics.generateTexture("enemy", 32, 32);

    // Tile sprites (light and dark for the checkerboard)
    graphics.clear();
    graphics.fillStyle(0xccaa77);
    graphics.fillRect(0, 0, 64, 32);
    graphics.generateTexture("tile_light", 64, 32);

    graphics.clear();
    graphics.fillStyle(0xaa8855);
    graphics.fillRect(0, 0, 64, 32);
    graphics.generateTexture("tile_dark", 64, 32);

    graphics.destroy();
  }

  create(): void {
    this.scene.start("MainMenuScene");
  }
}
