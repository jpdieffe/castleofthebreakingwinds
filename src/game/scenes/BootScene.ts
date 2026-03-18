import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {}

  create(): void {
    const g = this.add.graphics();

    const make = (key: string, color: number, w: number, h: number) => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    // Players
    make("player_a",     0x4488ff, 32, 32);
    make("player_b",     0x44ff88, 32, 32);

    // Enemies
    make("enemy",        0xff4444, 32, 32);

    // Friendly NPCs
    make("npc_friendly", 0xffcc44, 32, 32);

    // Terrain tiles (isometric diamond shapes)
    make("tile_grass",   0x55aa44, 64, 32);
    make("tile_grass2",  0x66bb55, 64, 32);
    make("tile_stone",   0x999999, 64, 32);
    make("tile_water",   0x3388cc, 64, 32);
    make("tile_wall",    0x554433, 64, 32);

    // Structures
    make("struct_tree",  0x227722, 24, 32);
    make("struct_rock",  0x888888, 24, 20);
    make("struct_bush",  0x44aa33, 20, 16);
    make("struct_ruins", 0x776655, 28, 24);
    make("struct_well",  0x6688aa, 20, 24);

    // Ground item marker
    make("ground_item",  0xffff44, 12, 12);

    g.destroy();
    this.scene.start("MainMenuScene");
  }
}
