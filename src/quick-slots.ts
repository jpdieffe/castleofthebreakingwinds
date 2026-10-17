export const quickActions = {
  bolt: { name: 'Magic Arrow', icon: '343', cost: 3 },
  heal: { name: 'Heal', icon: '227', cost: 6 },
  fireball: { name: 'Fireball', icon: 'bitmap-9', cost: 8 },
  potion: { name: 'Healing potion', icon: '227', cost: 0 },
  mana: { name: 'Mana potion', icon: '233', cost: 0 },
} as const;
export type QuickAction = keyof typeof quickActions;
export type QuickSlot = 0 | 1;
export interface SlotAssignments {
  get(slot: QuickSlot): QuickAction;
  assign(slot: QuickSlot, action: QuickAction): void;
}
const storageKey = 'castle-quick-slots-v1';
export function createQuickSlots(): SlotAssignments {
  let slots: [QuickAction, QuickAction] = ['bolt', 'potion'];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved) && saved.length === 2 && saved.every(id => typeof id === 'string' && Object.hasOwn(quickActions, id))) slots = saved as typeof slots;
  } catch { /* Storage may be unavailable; keep usable defaults. */ }
  return {
    get: slot => slots[slot],
    assign(slot, action) {
      slots[slot] = action;
      try { localStorage.setItem(storageKey, JSON.stringify(slots)); } catch { /* Keep the assignment for this session. */ }
    },
  };
}

/** Selection never casts a spell or consumes an item. */
export function mountSlotPicker(container: HTMLElement, assignments: SlotAssignments) {
  container.classList.add('slot-picker');
  container.innerHTML = '<span>Quick access</span><div><button type="button" data-assign-slot="0">Assign to slot 1</button><button type="button" data-assign-slot="1">Assign to slot 2</button></div>';
  let selected: QuickAction | undefined;
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-assign-slot]')];
  const refresh = () => {
    container.hidden = !selected;
    buttons.forEach((button, slot) => {
      const assigned = !!selected && assignments.get(slot as QuickSlot) === selected;
      button.setAttribute('aria-pressed', String(assigned));
      button.textContent = assigned ? `Assigned to slot ${slot + 1}` : `Assign to slot ${slot + 1}`;
    });
  };
  buttons.forEach((button, slot) => button.onclick = () => {
    if (selected) assignments.assign(slot as QuickSlot, selected);
    refresh();
  });
  refresh();
  return { select(action?: QuickAction) { selected = action; refresh(); } };
}
