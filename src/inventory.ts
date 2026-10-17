import { shopAt } from '../shared/world';
import { mountSlotPicker, type SlotAssignments } from './quick-slots';
import { art } from '../shared/art';
import type { Action, Player, Snapshot } from '../shared/types';

const asset = (id: number | string) => `${import.meta.env.BASE_URL}classic/${id}.png`;
const slots = [
  ['armor', 'Armor', 1, 1], ['neck', 'Neckwear', 2, 1], ['cloak', 'Overgarment', 3, 1],
  ['helmet', 'Helmet', 4, 1], ['shield', 'Shield', 5, 1],
  ['bracers', 'Bracers', 1, 2], ['gauntlets', 'Gauntlets', 5, 2],
  ['weapon', 'Weapon', 1, 3], ['hand', 'Free Hand', 5, 3],
  ['right-ring', 'Right Ring', 1, 4], ['left-ring', 'Left Ring', 5, 4],
  ['belt', 'Belt', 1, 5], ['boots', 'Boots', 5, 5],
  ['pack', 'Small Pack', 1, 6], ['purse', 'Purse', 5, 6],
] as const;

/** A view of authoritative player state; opening inventory never creates or equips items. */
export function mountInventory(body: HTMLElement, send: (action: Action) => void, close: () => void, assignments: SlotAssignments, trade: () => void) {
  body.innerHTML = `<nav class="inventory-menu" aria-label="Inventory menu"><button type="button" data-exit>Exit!</button><span>Equipment &amp; belongings</span></nav>
    <div class="inventory-summary"><strong data-character></strong><span data-stats></span></div>
    <div class="inventory-layout">
      <section class="paper-doll" aria-label="Equipped items">
        <img class="inventory-figure" src="${import.meta.env.BASE_URL}classic/inventory-1.svg" alt="Original Castle of the Winds equipment outline">
        ${slots.map(([id, label, col, row]) => `<div class="equipment-slot" data-slot="${id}" style="grid-column:${col};grid-row:${row}" aria-label="${label}: empty"><img hidden alt=""><span>${label}</span><small hidden></small></div>`).join('')}
        <div class="equipment-caption">Equipped<br><span>Sword &amp; armor upgrades equip automatically.</span></div>
      </section>
      <div class="inventory-containers">
        <section class="inventory-child" aria-labelledby="inventory-floor-title"><h2 id="inventory-floor-title"><img src="${asset(2)}" alt=""><span data-floor-title>Floor</span></h2>
          <div class="inventory-items" data-floor></div>
          <button type="button" data-open-shop hidden>Trade at shop</button>
          <p class="container-note" data-trade-note></p>
        </section>
        <section class="inventory-child" aria-labelledby="inventory-pack-title"><h2 id="inventory-pack-title"><img src="${asset(143)}" alt="">Small Pack<span data-pack-count></span></h2>
          <div class="inventory-items">
            <div class="inventory-row" data-potion="potion"><img src="${asset(art.potion)}" alt=""><span>Healing potion<small data-count></small></span><button type="button" aria-label="Drink healing potion">Drink</button></div>
            <div class="inventory-row" data-potion="mana"><img src="${asset(233)}" alt=""><span>Mana potion<small data-count></small></span><button type="button" aria-label="Drink mana potion">Drink</button></div>
          </div>
          <p class="container-note">Select a potion to assign quick slots, or Drink to use it.</p>
        </section>
      </div>
    </div>
    <section class="inventory-selection"><strong data-selected-title>Choose an item</strong><p data-selected-detail>Tap equipment, or a potion to inspect it.</p><button data-selected-action disabled>Select an item</button><div data-slot-picker></div></section>
    <div class="inventory-description"><span data-inventory-message role="status">Combat continues while inventory is open.</span><span data-vitals></span></div>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => body.querySelector<T>(selector)!;
  const picker = mountSlotPicker(find('[data-slot-picker]'), assignments);
  let selected: { kind: 'pack' | 'slot'; key: string } | undefined;
  let current: Snapshot | undefined, player: Player | undefined;
  function select(kind: 'pack' | 'slot', key: string) { selected = { kind, key }; updateSelection(); }
  function updateSelection() {
    const quickItem = selected?.kind === 'pack' ? selected.key as 'potion' | 'mana' : undefined;
    picker.select(quickItem); find('.inventory-selection').classList.toggle('has-quick-item', !!quickItem);
    const button = find<HTMLButtonElement>('[data-selected-action]'); button.disabled = true; button.onclick = null;
    if (!selected || !player || !current) return;
    const p = player, active = current.status === 'playing' && p.hp > 0;
    body.querySelectorAll('[data-buy], [data-potion], [data-slot]').forEach(el => el.classList.toggle('selected-item', el.getAttribute(selected!.kind === 'pack' ? 'data-potion' : 'data-slot') === selected!.key));
    if (selected.kind === 'slot') {
      const slot = find(`[data-slot="${selected.key}"]`);
      find('[data-selected-title]').textContent = slot.getAttribute('aria-label');
      find('[data-selected-detail]').textContent = selected.key === 'weapon' || selected.key === 'armor' ? 'Equipped. Buy an upgrade at the shop entrance or collect better equipment while exploring.' : selected.key === 'pack' ? 'Your healing and mana potions are in the Small Pack pane.' : selected.key === 'purse' ? 'Gold buys potions and equipment upgrades at the shop entrance.' : 'This slot is empty.';
      button.textContent = 'Inspected';
    } else if (selected.kind === 'pack') {
      const type = selected.key as 'potion' | 'mana', count = type === 'potion' ? p.potions : p.manaPotions, full = type === 'potion' ? p.hp === p.maxHp : p.mana === p.maxMana;
      find('[data-selected-title]').textContent = type === 'potion' ? 'Healing potion' : 'Mana potion';
      find('[data-selected-detail]').textContent = `${count} in your pack. Restores up to ${type === 'potion' ? '35 health' : '20 mana'}.`;
      button.textContent = !count ? 'None remaining' : full ? `${type === 'potion' ? 'Health' : 'Mana'} is full` : 'Drink potion';
      button.disabled = !active || !count || full; button.onclick = () => send({ type });
    }
  }
  find('[data-exit]').onclick = close;
  find('[data-open-shop]').onclick = trade;
  body.querySelectorAll<HTMLElement>('[data-potion], [data-slot]').forEach(el => {
    el.tabIndex = 0;
    const inspect = () => select(el.dataset.slot ? 'slot' : 'pack', el.dataset.slot ?? el.dataset.potion!);
    el.onclick = inspect; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(); } };
  });
  for (const type of ['potion', 'mana'] as const) find(`[data-potion="${type}"] button`).onclick = () => send({ type });
  function setSlot(id: string, label: string, icon?: number, detail = '') {
    const slot = find(`[data-slot="${id}"]`), img = slot.querySelector('img')!;
    slot.querySelector('span')!.textContent = label;
    const small = slot.querySelector('small')!; small.textContent = detail; small.hidden = !detail;
    img.hidden = !icon; if (icon) img.src = asset(icon);
    slot.setAttribute('aria-label', `${label}${detail ? `: ${detail}` : ': empty'}`);
    slot.title = icon ? `${label}${detail ? `: ${detail}` : ''}` : `${label}: empty`;
  }
  let floorKey = '';
  return {
    message(text: string) { find('[data-inventory-message]').textContent = text; },
    update(state: Snapshot, p: Player) {
      current = state; player = p;
      find('[data-character]').textContent = p.name;
      find('[data-stats]').textContent = `Level ${p.rank} · XP ${p.xp}/${p.rank * 45} · ${p.gold} gold`;
      find('[data-vitals]').textContent = `HP ${p.hp}/${p.maxHp} · MP ${p.mana}/${p.maxMana}`;
      setSlot('weapon', 'Short sword', art.sword, `+${p.weapon}`);
      setSlot('armor', 'Armor', p.armor ? art.armor : undefined, p.armor ? `+${p.armor}` : 'None');
      setSlot('pack', 'Small Pack', 143, `${p.potions + p.manaPotions} potions`);
      setSlot('purse', 'Purse', 157, `${p.gold} gold`);
      find('[data-pack-count]').textContent = `${p.potions + p.manaPotions} items`;
      const active = state.status === 'playing' && p.hp > 0;
      for (const [type, count, full] of [['potion', p.potions, p.hp >= p.maxHp], ['mana', p.manaPotions, p.mana >= p.maxMana]] as const) {
        const row = find(`[data-potion="${type}"]`), button = row.querySelector('button')!;
        row.querySelector('[data-count]')!.textContent = `Quantity: ${count}`;
        button.disabled = !active || count === 0 || full;
        button.title = !active ? 'Resume adventuring to use items.' : !count ? 'None remaining.' : full ? `Your ${type === 'potion' ? 'health' : 'mana'} is full.` : 'Drink one potion.';
      }
      const trading = !!shopAt(state.map,p);
      find('[data-open-shop]').hidden = !trading;
      find('[data-trade-note]').textContent = trading ? 'Use Trade to browse the shop.' : 'Walk over items to collect them. Trade beside a shop entrance.';
      const floor = state.map.loot.filter(item => item.x === p.x && item.y === p.y);
      const key = JSON.stringify(floor);
      if (key !== floorKey) {
        floorKey = key;
        find('[data-floor]').replaceChildren();
        if (!floor.length) { const note = document.createElement('p'); note.textContent = 'Floor is empty.'; find('[data-floor]').append(note); }
        for (const item of floor) {
          const row = document.createElement('div'); row.className = 'inventory-row';
          const img = document.createElement('img'); img.src = asset({ gold: art.gold, potion: art.potion, mana: art.mana, weapon: art.sword, armor: art.armor }[item.kind]); img.alt = '';
          const label = document.createElement('span'); label.textContent = `${item.amount} ${item.kind}`; row.append(img, label); find('[data-floor]').append(row);
        }
      }
      updateSelection();
    },
  };
}
