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
export function mountInventory(body: HTMLElement, send: (action: Action) => void, close: () => void) {
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
          <div class="inventory-items" data-store hidden>
            ${(['potion', 'mana', 'weapon', 'armor'] as const).map((kind, i) => `<button type="button" class="inventory-row" data-buy="${kind}"><img src="${asset([231, 233, 111, 117][i])}" alt=""><span></span><small></small></button>`).join('')}
          </div>
          <p class="container-note" data-trade-note></p>
        </section>
        <section class="inventory-child" aria-labelledby="inventory-pack-title"><h2 id="inventory-pack-title"><img src="${asset(143)}" alt="">Small Pack<span data-pack-count></span></h2>
          <div class="inventory-items">
            <div class="inventory-row" data-potion="potion"><img src="${asset(231)}" alt=""><span>Healing potion<small data-count></small></span><button type="button" aria-label="Drink healing potion">Drink</button></div>
            <div class="inventory-row" data-potion="mana"><img src="${asset(233)}" alt=""><span>Mana potion<small data-count></small></span><button type="button" aria-label="Drink mana potion">Drink</button></div>
          </div>
          <p class="container-note">Select Drink to use a potion.</p>
        </section>
      </div>
    </div>
    <div class="inventory-description"><span data-inventory-message role="status">Combat continues while inventory is open.</span><span data-vitals></span></div>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => body.querySelector<T>(selector)!;
  find('[data-exit]').onclick = close;
  body.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button => {
    button.onclick = () => send({ type: 'buy', item: button.dataset.buy as 'potion' | 'mana' | 'weapon' | 'armor' });
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
      find('[data-character]').textContent = p.name;
      find('[data-stats]').textContent = `Level ${p.rank} · XP ${p.xp}/${p.rank * 45} · ${p.gold} gold`;
      find('[data-vitals]').textContent = `HP ${p.hp}/${p.maxHp} · MP ${p.mana}/${p.maxMana}`;
      setSlot('weapon', 'Sword', 111, `+${p.weapon}`);
      setSlot('armor', 'Armor', p.armor ? 117 : undefined, p.armor ? `+${p.armor}` : 'None');
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
      const shop = state.map.shop, trading = !!shop && Math.max(Math.abs(p.x - shop.x), Math.abs(p.y - shop.y)) <= 2;
      find('[data-floor-title]').textContent = trading ? 'Store · Village well' : 'Floor';
      find('[data-store]').hidden = !trading; find('[data-floor]').hidden = trading;
      find('[data-trade-note]').textContent = trading ? 'Click an item to buy. E at the well restores health and mana.' : 'Walk over items to collect them. Trade beside a village well.';
      const prices = { potion: 10, mana: 10, weapon: 35 * p.weapon, armor: 30 * (p.armor + 1) };
      const labels = { potion: 'Healing potion', mana: 'Mana potion', weapon: 'Improve sword', armor: 'Improve armor' };
      for (const kind of ['potion', 'mana', 'weapon', 'armor'] as const) {
        const button = find<HTMLButtonElement>(`[data-buy="${kind}"]`), price = prices[kind];
        button.querySelector('span')!.textContent = labels[kind];
        button.querySelector('small')!.textContent = `${price} gold`;
        button.setAttribute('aria-label', `${labels[kind]} · ${price} gold`);
        button.disabled = !active || !trading || p.gold < price;
        button.title = p.gold < price ? `You need ${price - p.gold} more gold.` : `Buy for ${price} gold.`;
      }
      const floor = state.map.loot.filter(item => item.x === p.x && item.y === p.y);
      const key = JSON.stringify(floor);
      if (key !== floorKey) {
        floorKey = key;
        find('[data-floor]').replaceChildren();
        if (!floor.length) { const note = document.createElement('p'); note.textContent = 'Floor is empty.'; find('[data-floor]').append(note); }
        for (const item of floor) {
          const row = document.createElement('div'); row.className = 'inventory-row';
          const img = document.createElement('img'); img.src = asset({ gold: 153, potion: 231, mana: 233, weapon: 111, armor: 117 }[item.kind]); img.alt = '';
          const label = document.createElement('span'); label.textContent = `${item.amount} ${item.kind}`; row.append(img, label); find('[data-floor]').append(row);
        }
      }
    },
  };
}
