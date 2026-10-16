import { act, addPlayer, createGame } from '../server/engine.ts';
import type { GameState, Level } from '../shared/types.ts';

export function arena(): Level {
  const width = 24, height = 18;
  return { id: 0, name: 'Test chamber', width, height,
    tiles: Array.from({ length: width * height }, (_, i) => i % width === 0 || i % width === width - 1 || i < width || i >= width * (height - 1) ? 'wall' : 'floor'),
    decorations: [], enemies: [], loot: [], portals: [], spawn: { x: 5, y: 5 }, explored: Array.from({ length: width * height }, (_, i) => i), safe: false };
}
export function gameFixture(): GameState {
  const game = createGame('ABC123', 12345); game.levels[0] = arena();
  const a = addPlayer(game, 'a', 'Astrid'), b = addPlayer(game, 'b', 'Bjorn');
  Object.assign(a, { x: 5, y: 5 }); Object.assign(b, { x: 7, y: 5 });
  act(game, a, { type: 'ready' }); act(game, b, { type: 'ready' });
  return game;
}
