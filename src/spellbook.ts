import { mountSlotPicker, type SlotAssignments } from './quick-slots';
import type { Player } from '../shared/types';

const spells = [
  { id: 'bolt', name: 'Magic Arrow', icon: '343', cost: 3, text: 'Aim, then tap any map tile to fire. Stops at walls or the first monster. Six-tile range.' },
  { id: 'heal', name: 'Heal', icon: '227', cost: 6, text: 'Restore up to 20 health to your adventurer.' },
  { id: 'fireball', name: 'Fireball', icon: 'bitmap-9', cost: 8, text: 'Blast the nearest monster in sight and other monsters within two tiles of it. Six-tile range.' },
] as const;
export function mountSpellbook(body: HTMLElement, cast: (id: 'bolt' | 'heal' | 'fireball') => void, assignments: SlotAssignments) {
  body.innerHTML = `<p data-spell-mana></p><div class="spell-grid">${spells.map(s => `<button data-spell="${s.id}" aria-pressed="false"><img src="${import.meta.env.BASE_URL}classic/${s.icon}.png" alt=""><strong>${s.name}</strong><span>${s.cost} mana</span></button>`).join('')}</div><section class="spell-detail"><h2 data-spell-title>Choose a spell</h2><p data-spell-description>Tap an icon to see its effect and mana cost.</p><button id="cast-spell" disabled>Select a spell</button><div data-slot-picker></div></section>`;
  const find = <T extends HTMLElement = HTMLElement>(s: string) => body.querySelector<T>(s)!;
  const picker = mountSlotPicker(find('[data-slot-picker]'), assignments);
  let selected: typeof spells[number] | undefined, player: Player | undefined, active = false;
  const refresh = () => {
    picker.select(selected?.id);
    const button = find<HTMLButtonElement>('#cast-spell');
    button.disabled = !selected || !player || !active || player.mana < selected.cost || (selected.id === 'heal' && player.hp === player.maxHp);
    button.textContent = !selected ? 'Select a spell' : !active ? 'Not ready to cast' : player && player.mana < selected.cost ? `Need ${selected.cost} mana` : selected.id === 'heal' && player?.hp === player?.maxHp ? 'Health is full' : selected.id === 'bolt' ? 'Aim Magic Arrow' : `Cast ${selected.name}`;
  };
  body.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach(button => button.onclick = () => {
    selected = spells.find(s => s.id === button.dataset.spell);
    body.querySelectorAll('[data-spell]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    find('[data-spell-title]').textContent = selected!.name; find('[data-spell-description]').textContent = selected!.text; refresh();
  });
  find('#cast-spell').onclick = () => { if (selected && !find<HTMLButtonElement>('#cast-spell').disabled) cast(selected.id); };
  return { update(p: Player, playing: boolean) { player = p; active = playing && p.hp > 0; find('[data-spell-mana]').textContent = `${p.mana} / ${p.maxMana} mana`; refresh(); } };
}
