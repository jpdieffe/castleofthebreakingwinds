import { art } from './art.ts';
import type { Player } from './types.ts';

export type ShopItem = 'potion' | 'mana' | 'weapon' | 'armor';
export const shopItems = [
  { id: 'potion', name: 'Healing potion', icon: art.potion, description: 'Restores up to 35 health when used. Adds one potion to your pack.' },
  { id: 'mana', name: 'Mana potion', icon: art.mana, description: 'Restores up to 20 mana when used. Adds one potion to your pack.' },
  { id: 'weapon', name: 'Short sword upgrade', icon: art.sword, description: 'Improves your sword by one level. Equips automatically.' },
  { id: 'armor', name: 'Armor upgrade', icon: art.armor, description: 'Improves your armor by one level. Equips automatically.' },
] as const;
export const buyPrice = (p: Player, item: ShopItem) => ({ potion: 10, mana: 10, weapon: 35 * p.weapon, armor: 30 * (p.armor + 1) })[item];
// The mobile game's normal-difficulty resale rate: one third of purchase value.
export const potionSellPrice = 3;
