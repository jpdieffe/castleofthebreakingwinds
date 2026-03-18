import type { Item } from "../../types";

/** Master item definitions. IDs are used everywhere; objects are looked up from here. */
export const ITEMS: Record<string, Item> = {
  // ─── Melee weapons ─────────────────────────────────────────────────────────
  sword_iron: {
    id: "sword_iron", name: "Iron Sword", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "melee", weaponType: "sword", damage: 6, range: 1, statScaling: "strength",
    description: "A sturdy iron blade.",
  },
  mace_iron: {
    id: "mace_iron", name: "Iron Mace", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "melee", weaponType: "mace", damage: 7, range: 1, statScaling: "strength",
    description: "A heavy mace that crushes armor.",
  },
  axe_iron: {
    id: "axe_iron", name: "Iron Axe", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "melee", weaponType: "axe", damage: 8, range: 1, statScaling: "strength",
    description: "A brutal axe. Slow but devastating.",
  },
  club_wood: {
    id: "club_wood", name: "Wooden Club", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "melee", weaponType: "club", damage: 4, range: 1, statScaling: "strength",
    description: "A crude wooden club.",
  },
  dagger_iron: {
    id: "dagger_iron", name: "Iron Dagger", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "melee", weaponType: "dagger", damage: 4, range: 1, statScaling: "strength",
    description: "Quick to strike, easy to conceal.",
  },

  // ─── Ranged magic weapons ──────────────────────────────────────────────────
  staff_oak: {
    id: "staff_oak", name: "Oak Staff", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "ranged", weaponType: "staff", damage: 5, range: 5, statScaling: "wisdom",
    description: "Channels magic from afar.",
  },
  wand_spark: {
    id: "wand_spark", name: "Spark Wand", itemType: "weapon", equipSlot: "rightHand",
    weaponCategory: "ranged", weaponType: "wand", damage: 4, range: 4, statScaling: "wisdom",
    description: "Crackles with minor electricity.",
  },

  // ─── Scrolls (consumable) ─────────────────────────────────────────────────
  scroll_fireball: {
    id: "scroll_fireball", name: "Scroll of Fireball", itemType: "consumable",
    weaponCategory: "scroll", weaponType: "fireball", damage: 12, range: 6, statScaling: "wisdom",
    consumable: true, description: "Hurls a ball of fire. Single use.",
  },
  scroll_waterball: {
    id: "scroll_waterball", name: "Scroll of Waterball", itemType: "consumable",
    weaponCategory: "scroll", weaponType: "waterball", damage: 10, range: 6, statScaling: "wisdom",
    consumable: true, description: "Launches a sphere of water. Single use.",
  },
  scroll_lightning: {
    id: "scroll_lightning", name: "Scroll of Lightning", itemType: "consumable",
    weaponCategory: "scroll", weaponType: "lightning", damage: 14, range: 7, statScaling: "wisdom",
    consumable: true, description: "Calls down a lightning bolt. Single use.",
  },

  // ─── Armor ─────────────────────────────────────────────────────────────────
  helmet_iron: {
    id: "helmet_iron", name: "Iron Helm", itemType: "armor", equipSlot: "helmet",
    defense: 2, description: "Basic head protection.",
  },
  chest_leather: {
    id: "chest_leather", name: "Leather Chest", itemType: "armor", equipSlot: "chest",
    defense: 3, description: "Light leather armor.",
  },
  boots_leather: {
    id: "boots_leather", name: "Leather Boots", itemType: "armor", equipSlot: "boots",
    defense: 1, description: "Comfortable and sturdy.",
  },
};

export function getItem(id: string): Item | undefined {
  return ITEMS[id];
}
