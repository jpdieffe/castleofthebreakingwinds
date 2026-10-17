import type { Level, Tile } from '../shared/types';

// Palette and tile shapes from CastleWinds_Mobile's BoardView.drawScene.
export const mapColors = {
  unseen: '#0a1219', wall: '#62686b', floor: '#dfdfd5', grass: '#008000',
  road: '#a3a164', tree: '#006500', water: '#184a91',
};

export function terrainColor(tile: Tile, raw?: number, town = false) {
  if (raw === 3) return mapColors.road;
  if (tile === 'floor' || tile === 'door' || tile === 'open') return town ? mapColors.grass : mapColors.floor;
  // Multi-cell buildings have opaque green backgrounds in the original art.
  if (raw !== undefined && raw >= 100 && raw <= 123) return mapColors.grass;
  return mapColors[tile];
}

export function drawTerrain(ctx: CanvasRenderingContext2D, tile: Tile, raw: number | undefined, town: boolean, x: number, y: number) {
  ctx.fillStyle = terrainColor(tile, raw, town); ctx.fillRect(x, y, 32, 32);
  if (tile === 'wall' && !town && !(raw !== undefined && raw >= 100)) {
    ctx.fillStyle = '#888e8f'; ctx.fillRect(x, y, 32, 1); ctx.fillRect(x, y, 1, 32);
    ctx.fillStyle = '#454d50'; ctx.fillRect(x, y + 31, 32, 1);
  }
  if (tile === 'tree') {
    ctx.fillStyle = '#005400'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 11.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#176e09'; ctx.beginPath(); ctx.arc(x + 12.8, y + 11.2, 7.36, 0, Math.PI * 2); ctx.fill();
  }
  if (tile === 'floor' && raw !== 3) {
    ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(x, y, 32, 1); ctx.fillRect(x, y, 1, 32);
  }
}

// Apply the mobile hamlet's red-roof artwork at render time, including old saves.
// Footprints and collision tiles remain those of the recovered online maps.
export function buildingArt(map: Level, image: string) {
  if (map.id !== 0) return image;
  return ({ 'bitmap-191': 'bitmap-241', 'bitmap-192': 'bitmap-242', 'bitmap-193': 'bitmap-243', 'bitmap-194': 'bitmap-243' } as Record<string, string>)[image] ?? image;
}
