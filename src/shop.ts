import { buyPrice, potionSellPrice, shopItems, type ShopItem } from '../shared/shop';
import { shopAt } from '../shared/world';
import type { Action, Player, Snapshot } from '../shared/types';

/** Native IconPopup layout, backed exclusively by authoritative player state. */
export function mountShop(body: HTMLElement, send: (action: Action) => void, heading: HTMLElement) {
  body.innerHTML = `<p class="shop-balance" data-shop-balance></p>
    <nav class="shop-tabs" aria-label="Shop mode"><button data-shop-tab="buy" aria-pressed="true">Buy</button><button data-shop-tab="sell" aria-pressed="false">Sell</button></nav>
    <div class="shop-body"><div class="shop-grid" aria-label="Shop items"></div>
    <section class="shop-detail" aria-label="Selected item"><div class="shop-copy"><h2 data-shop-title>Choose an icon</h2><p data-shop-description>Tap an item to see its details.</p><p data-shop-notice role="status"></p></div><button data-shop-commit disabled>Select an icon</button></section></div>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => body.querySelector<T>(selector)!;
  let mode: 'buy' | 'sell' = 'buy', selected: ShopItem | undefined;
  let state: Snapshot | undefined, player: Player | undefined, gridKey = '', feedback = '';
  let pending: { gold: number; logId: number } | undefined;
  const quantity = (id: ShopItem) => !player ? 0 : id === 'potion' ? player.potions : id === 'mana' ? player.manaPotions : id === 'weapon' ? player.weapon : player.armor;
  const unavailable = (id: ShopItem) => {
    if (!state || !player) return 'Join an expedition to trade.';
    if (state.status !== 'playing' || player.hp <= 0) return 'You cannot trade right now.';
    if (!shopAt(state.map, player)) return 'Stand near a shop entrance to trade.';
    if (mode === 'sell') return id === 'weapon' || id === 'armor' ? 'Equipped items cannot be sold.' : !quantity(id) ? 'None remaining in your pack.' : '';
    return player.gold < buyPrice(player, id) ? 'Not enough gold.' : '';
  };
  function render() {
    if (!state || !player) return;
    const entrance = shopAt(state.map, player);
    const place = state.map.places?.find(p => p.doorX === entrance?.x && p.doorY === entrance?.y);
    if (entrance) heading.textContent = place?.name ?? 'Trading post';
    find('[data-shop-balance]').textContent = `${player.gold} gold · Pack ${player.potions + player.manaPotions} potions`;
    const items = shopItems.filter(item => mode === 'buy' || quantity(item.id) > 0);
    const key = mode + items.map(item => item.id).join();
    if (key !== gridKey) {
      gridKey = key;
      const grid = find('.shop-grid'); grid.replaceChildren();
      for (const item of items) {
        const tile = document.createElement('button'); tile.type = 'button'; tile.dataset.shopItem = item.id;
        tile.innerHTML = `<img src="${import.meta.env.BASE_URL}classic/${item.icon}.png" alt=""><span>${item.name}</span><small></small>`;
        tile.onclick = () => { selected = item.id; feedback = ''; render(); }; grid.append(tile);
      }
      if (!items.length) grid.textContent = 'No items here.';
    }
    for (const tile of body.querySelectorAll<HTMLButtonElement>('[data-shop-item]')) {
      const id = tile.dataset.shopItem as ShopItem, equipped = id === 'weapon' || id === 'armor';
      tile.setAttribute('aria-pressed', String(id === selected));
      tile.classList.toggle('unavailable', !!unavailable(id));
      tile.querySelector('small')!.textContent = mode === 'buy' ? `${buyPrice(player, id)} gold` : equipped ? 'Equipped' : `${potionSellPrice} gold · ×${quantity(id)}`;
    }
    const item = shopItems.find(item => item.id === selected);
    find('[data-shop-title]').textContent = item?.name ?? 'Choose an icon';
    find('[data-shop-description]').textContent = !item ? 'Tap an item to see its details.' : mode === 'buy' ? item.description : `${item.id === 'weapon' || item.id === 'armor' ? `Equipped +${quantity(item.id)}.` : `${quantity(item.id)} in your pack. Sell one potion at a time.`}`;
    find('[data-shop-notice]').textContent = [feedback, item ? unavailable(item.id) : !entrance ? 'Stand near a shop entrance to trade.' : ''].filter(Boolean).join(' ');
    const commit = find<HTMLButtonElement>('[data-shop-commit]');
    commit.textContent = !item ? 'Select an icon' : mode === 'sell' && (item.id === 'weapon' || item.id === 'armor') ? 'Equipped' : `${mode === 'buy' ? 'Buy' : 'Sell'} · ${mode === 'buy' ? buyPrice(player, item.id) : potionSellPrice} gold`;
    commit.disabled = !item || !!unavailable(item.id) || !!pending;
  }
  body.querySelectorAll<HTMLButtonElement>('[data-shop-tab]').forEach(tab => tab.onclick = () => {
    mode = tab.dataset.shopTab as 'buy' | 'sell'; selected = undefined; feedback = '';
    body.querySelectorAll('[data-shop-tab]').forEach(t => t.setAttribute('aria-pressed', String(t === tab))); render();
  });
  find<HTMLButtonElement>('[data-shop-commit]').onclick = () => {
    if (!selected || !state || !player || unavailable(selected) || pending) return;
    pending = { gold: player.gold, logId: state.nextLog };
    const action: Action = mode === 'buy' ? { type: 'buy', item: selected } : { type: 'sell', item: selected as 'potion' | 'mana' };
    send(action); render();
  };
  return {
    message(text: string) { feedback = text; pending = undefined; render(); },
    update(next: Snapshot, p: Player) {
      state = next; player = p;
      if (pending) {
        if (p.gold !== pending.gold) feedback = next.log.filter(entry => entry.id >= pending!.logId).at(-1)?.text ?? 'Trade complete.';
        // Every action gets a snapshot, including cooldown-rejected attempts.
        pending = undefined;
      }
      render();
    },
  };
}
