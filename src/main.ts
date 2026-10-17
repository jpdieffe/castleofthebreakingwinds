import './style.css';
import './mobile.css';
import { PeerSession } from './peer-session';
import { mountInventory } from './inventory';
import { mountSpellbook } from './spellbook';
import { touchMap } from './touch-map';
import { createQuickSlots, quickActions, type SlotAssignments, type QuickSlot } from './quick-slots';
import { drawTerrain, mapColors, nativeColor, buildingArt } from './map-style';
import { shopAt } from '../shared/world';
import { art, creatureArt } from '../shared/art';
import type { Action, Player, ServerMessage, Snapshot } from '../shared/types';

const base = import.meta.env.BASE_URL;
const icon = (id: number | string) => `${base}classic/${id}.png`;
const quickSlots = createQuickSlots();
const slotAssignments: SlotAssignments = {
  get: slot => quickSlots.get(slot),
  assign(slot, action) { quickSlots.assign(slot, action); aimArrow(false); toast(`${quickActions[action].name} assigned to slot ${slot + 1}.`); },
};
const query = new URLSearchParams(location.search);
const defaultServer = 'peer';
let serverUrl = query.get('server') || defaultServer;
let socket: WebSocket | PeerSession | undefined, state: Snapshot | undefined, playerId = '', reconnectTimer = 0;
let manualClose = false, pending = false, reconnectCount = 0, lastMessage = Date.now();
let destination: { x: number; y: number } | undefined;
let aimingArrow = false, animationFrame = 0;
const mobileMedia = matchMedia('(max-width: 1000px), (pointer: coarse)');
let viewColumns = 23, viewRows = 17, mapZoom = 1;
let touchMove: [number, number] | undefined;
const arrowStarts = new Map<string, number>();
let saved: { code: string; token: string; playerId: string; server: string } | undefined;
try { saved = JSON.parse(sessionStorage.getItem('castle-session') || 'null') || undefined; } catch { sessionStorage.removeItem('castle-session'); }
// Old dedicated-server sessions must not trap returning Pages visitors in the retired default.
if (saved && saved.server !== 'peer' && !query.has('server')) { saved = undefined; sessionStorage.removeItem('castle-session'); }
const images = new Map<string, HTMLImageElement>();
const image = (id: number | string) => {
  const key = String(id);
  if (!images.has(key)) { const img = new Image(); img.src = icon(id); img.onload = () => draw(); images.set(key, img); }
  return images.get(key)!;
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header class="masthead"><div><span class="edition">SOLO &amp; TWO-PLAYER EXPEDITIONS</span><h1>Castle of the Winds</h1></div><span class="connection" id="connection">Not connected</span></header>
<main class="window"><div class="titlebar"><img src="${icon(2)}" alt=""><span>Castle of the Winds — A Question of Vengeance</span><span class="window-mark">◆</span></div>
<nav class="menubar" aria-label="Game menu"><button id="new-menu">Expedition</button><button data-dialog="inventory">Inventory <kbd>I</kbd></button><button data-dialog="journal">Journal <kbd>J</kbd></button><button data-dialog="help">Help <kbd>?</kbd></button><span id="room-label"></span><button id="share" hidden>Copy invite</button><button id="leave" hidden>Leave</button></nav>
<div class="toolbar" aria-label="Actions">
${([['attack',art.sword,'Attack','Space'],['bolt',343,'Magic Arrow','1'],['heal',227,'Heal','2'],['fireball',339,'Fireball','3'],['potion',art.potion,'Potion','H'],['mana',233,'Mana','Q'],['interact',7,'Use / stairs','E'],['revive',269,'Revive','R']] as const).map(([action,id,name,key]) => `<button data-action="${action}"><img src="${icon(id)}" alt="">${name} <kbd>${key}</kbd></button>`).join('')}
</div><div class="game-layout"><section class="viewport-pane" aria-label="Dungeon"><div class="pane-title"><span id="location">The northern hamlet</span><span id="area-info">Original artwork · online co-op</span></div>
<div class="canvas-wrap"><canvas id="world" width="736" height="544" tabindex="0" aria-label="Game map. Use arrows or WASD to move, Space to attack, E to use stairs."></canvas>
<section id="lobby" class="lobby" aria-label="Join an expedition"><img class="original-logo" src="${icon('bitmap-10')}" alt="Castle of the Winds original logo"><h2>Adventure alone.<br>Or bring a companion.</h2><p>Play solo immediately, or host an expedition and share your room code with a friend.</p>
<form id="lobby-form"><label for="name">Adventurer’s name</label><input id="name" maxlength="20" required autocomplete="nickname" placeholder="Enter your name"><button type="button" id="solo" class="primary">Play solo</button><button type="submit" id="create" class="primary">Host expedition</button><div class="or">or join a friend</div><div class="join-row"><label class="sr-only" for="code">Expedition code</label><input id="code" maxlength="6" placeholder="6-character code" autocomplete="off" autocapitalize="characters"><button type="button" id="join">Join</button></div><details id="connection-settings"><summary>Advanced: dedicated server</summary><label for="server">Server address</label><input id="server" placeholder="peer"><p>Leave as peer for browser-to-browser play. Optional: a dedicated wss:// server.</p></details></form><p id="lobby-status" role="status"></p><small>Browser reconstruction using recovered Castle1 resources.<br>Rick Saada / SaadaSoft · Art: Paul Canniff · Publisher: Epic MegaGames</small></section>
<section id="party-overlay" class="party-overlay" hidden><strong id="party-heading"></strong><p id="party-message"></p><button id="ready" class="primary">Ready to adventure</button><button id="restart" hidden>Begin again</button></section></div>
<div class="map-footer"><span id="position">Explore together. Move with WASD or arrow keys.</span><span id="world-clock">Enemies move every 1.4 seconds</span></div></section>
<aside><div class="pane-title">Your expedition <span id="party-size">1 OR 2 PLAYERS</span></div><div id="party"><div class="empty-party"><img src="${icon(art.hero)}" alt="Adventurer">Every journey begins<br>with a first step.</div></div><div class="pane-title">Area map <span id="map-sharing">EXPLORED</span></div><canvas id="minimap" width="230" height="170" aria-label="Shared explored map"></canvas><div class="quest"><span class="eyebrow">A QUESTION OF VENGEANCE</span><h3 id="quest-title">Find the road north</h3><p id="quest-text">Meet at the stairs, then press E to travel together. Rest and trade beside the village well.</p></div><div class="legend"><span><i class="gold-dot"></i>You</span><span id="partner-legend"><i class="blue-dot"></i>Partner</span><span><i class="red-dot"></i>Enemy</span></div></aside></div>
<section class="chronicle"><div class="pane-title">Adventure log <span id="simulation-status">WAITING FOR ADVENTURERS</span></div><div id="log" role="log" aria-live="polite"><p>Welcome to the north. Invite a friend to begin.</p></div></section><div class="touch-controls"><div class="dpad">${[['0,-1','↑','north'],['-1,0','←','west'],['0,1','↓','south'],['1,0','→','east']].map(([dir,label,name]) => `<button data-direction="${dir}" aria-label="Move ${name}">${label}</button>`).join('')}</div><span>Click an explored tile to walk there.</span></div></main>
<footer class="page-footer"><span>CLASSIC WORLD. SHARED ADVENTURE.</span><span>Original resources recovered from CASTLE1.EXE · Co-op reconstruction</span></footer><div id="toast" role="status" hidden></div><dialog id="dialog"><div class="titlebar"><span id="dialog-title"></span><button id="close-dialog" aria-label="Close dialog">×</button></div><div id="dialog-body"></div></dialog>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('world'), ctx = canvas.getContext('2d')!;
const mini = el<HTMLCanvasElement>('minimap'), mc = mini.getContext('2d')!;
const dialog = el<HTMLDialogElement>('dialog');
let inventoryView: ReturnType<typeof mountInventory> | undefined;
let spellbookView: ReturnType<typeof mountSpellbook> | undefined;
function closeDialog() { dialog.close(); canvas.focus(); }
dialog.addEventListener('close', () => { inventoryView = undefined; spellbookView = undefined; dialog.classList.remove('inventory-dialog'); canvas.focus(); });
dialog.setAttribute('aria-labelledby', 'dialog-title');
document.querySelector('.window')!.insertAdjacentHTML('afterbegin', `<header class="mobile-heading"><div><small>CASTLE OF THE WINDS</small><h2 id="mobile-location">Adventure together</h2><div id="mobile-vitals"></div><div id="mobile-partner"></div></div><button data-dialog="menu" aria-label="Game menu">☰</button></header>`);
el('world').parentElement!.insertAdjacentHTML('beforeend', `<div class="map-tools"><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="cancel-aim" hidden>Cancel aim</button></div><span class="map-hint">Tap to walk · Pinch to zoom</span>`);
document.querySelector('.touch-controls')!.innerHTML = `<div class="mobile-feedback"><span id="mobile-status"></span><p id="mobile-log"></p></div><div class="movement-panel"><div class="dpad">${[[-1,-1,'↖','northwest'],[0,-1,'↑','north'],[1,-1,'↗','northeast'],[-1,0,'←','west'],[0,0,'⚔','attack'],[1,0,'→','east'],[-1,1,'↙','southwest'],[0,1,'↓','south'],[1,1,'↘','southeast']].map(([dx,dy,label,name]) => `<button ${name === 'attack' ? 'id="touch-attack" aria-label="Melee attack"' : `data-direction="${dx},${dy}" aria-label="Move ${name}"`}>${label}</button>`).join('')}</div><div class="touch-actions"><button id="touch-interact">Action</button><button id="touch-arrow" class="quick-slot" data-quick-slot="0" aria-label="Quick slot 1: Magic Arrow"></button><button id="touch-potion" class="quick-slot" data-quick-slot="1" aria-label="Quick slot 2: Healing potion"></button></div></div>`;
document.querySelector('.window')!.insertAdjacentHTML('beforeend', `<nav class="mobile-tabs" aria-label="Adventure screens"><button data-mobile-dialog="inventory">Pack</button><button data-mobile-dialog="spells">Spells</button><button data-mobile-dialog="hero">Hero</button><button data-mobile-dialog="journal">Journal</button></nav>`);
function mobileLayout() { document.body.classList.toggle('mobile-ui', mobileMedia.matches); }
mobileLayout(); mobileMedia.addEventListener('change', () => { mobileLayout(); held.clear(); destination = undefined; draw(); });
el<HTMLInputElement>('server').value = serverUrl;
el<HTMLInputElement>('code').value = query.get('room')?.slice(0, 6).toUpperCase() || '';
el<HTMLInputElement>('name').value = localStorage.getItem('castle-name') || '';
let toastTimer = 0;
function toast(message: string) { if (dialog.open) { if (inventoryView) inventoryView.message(message); else { let note = dialog.querySelector<HTMLElement>('.dialog-notice'); if (!note) { note = document.createElement('p'); note.className = 'dialog-notice'; note.setAttribute('role', 'status'); el('dialog-body').append(note); } note.textContent = message; } } el('toast').textContent = message; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el('toast').hidden = true; }, 4000); }
function connection(text: string, connected = false) { el('connection').textContent = text; el('connection').classList.toggle('connected', connected); }
function lobbyMessage(text: string) { el('lobby-status').textContent = text; }
function busy(value: boolean) { pending = value; el<HTMLButtonElement>('solo').disabled = value; el<HTMLButtonElement>('create').disabled = value; el<HTMLButtonElement>('join').disabled = value; }
function connect(message: object, resume = false) {
  clearTimeout(reconnectTimer);
  try {
    if (serverUrl !== 'peer') {
      const url = new URL(serverUrl);
      if (!['ws:', 'wss:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) throw new Error('Use a wss:// game server on secure websites. Locally, use ws://localhost:8787/ws.');
    }
  } catch (error) { busy(false); lobbyMessage(error instanceof Error ? error.message : 'Enter a valid game server URL.'); return; }
  manualClose = false; busy(true); connection(resume ? 'Reconnecting…' : 'Connecting…');
  const ws = serverUrl === 'peer' ? new PeerSession() : new WebSocket(serverUrl); socket = ws;
  const timeout = window.setTimeout(() => { if (pending) ws.close(); }, 20000);
  ws.onopen = () => { ws.send(JSON.stringify(message)); lastMessage = Date.now(); };
  ws.onmessage = (event: { data: string }) => {
    if (socket !== ws) return;
    lastMessage = Date.now(); const response = JSON.parse(event.data) as ServerMessage;
    if (response.type === 'welcome') {
      clearTimeout(timeout); busy(false); reconnectCount = 0; playerId = response.playerId;
      saved = { code: response.code, token: response.token, playerId, server: serverUrl };
      sessionStorage.setItem('castle-session', JSON.stringify(saved)); localStorage.setItem('castle-server', serverUrl);
      el('lobby').hidden = true; el('share').hidden = false; el('leave').hidden = false;
      document.querySelector('.window')!.classList.add('in-game');
      el('room-label').textContent = `ROOM ${response.code}`; connection(serverUrl === 'peer' ? 'Browser co-op · WebRTC' : 'Connected', true); canvas.focus();
    } else if (response.type === 'state') { state = response.state; render(); }
    else {
      busy(false); lobbyMessage(response.message); toast(response.message);
      if (resume && response.fatal && !state) { saved = undefined; sessionStorage.removeItem('castle-session'); }
      if (response.fatal) { manualClose = true; connection('Disconnected'); }
    }
  };
  ws.onerror = () => { lobbyMessage(serverUrl === 'peer' ? 'Cannot reach matchmaking. Check your internet connection and try again.' : 'Cannot reach the game server. Check its address and that it is running.'); };
  ws.onclose = (event: { code: number }) => {
    clearTimeout(timeout); if (socket !== ws) return;
    busy(false); connection('Disconnected'); destination = undefined;
    if (state && state.status === 'playing') { state.status = 'paused'; render(); }
    if (event.code === 4001) { manualClose = true; toast('This adventurer was resumed in another window.'); }
    if (!manualClose && saved) {
      connection('Reconnecting… world paused');
      reconnectTimer = window.setTimeout(() => { if (saved) { serverUrl = saved.server; connect({ type: 'resume', code: saved.code, token: saved.token }, true); } }, Math.min(4000, 500 * 2 ** reconnectCount++));
    } else if (!manualClose) lobbyMessage(serverUrl === 'peer' ? 'Connection closed. Check the room code and that your friend has the host tab open. Some networks block direct connections; try another network.' : 'Connection closed. Check the server address, then try again.');
  };
}
function enter(type: 'solo' | 'create' | 'join') {
  if (pending) return;
  const name = el<HTMLInputElement>('name').value.trim();
  if (!name) { el<HTMLInputElement>('name').reportValidity(); return; }
  serverUrl = el<HTMLInputElement>('server').value.trim() || 'peer'; const code = el<HTMLInputElement>('code').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z0-9]{6}$/.test(code)) { lobbyMessage('Enter a six-character expedition code.'); return; }
  if (type === 'solo') serverUrl = 'peer';
  localStorage.setItem('castle-name', name); lobbyMessage('Connecting to your expedition…');
  if (socket) { manualClose = true; socket.onclose = null; socket.close(); }
  connect({ type, name, code });
}
el('lobby-form').addEventListener('submit', e => { e.preventDefault(); enter('create'); });
el('join').onclick = () => enter('join');
el('solo').onclick = () => enter('solo');
function send(action: Action) { if (socket?.readyState === WebSocket.OPEN && state) socket.send(JSON.stringify({ type: 'action', action })); }
el('ready').onclick = () => send({ type: 'ready' }); el('restart').onclick = () => send({ type: 'restart' });
function aimArrow(active: boolean) {
  aimingArrow = active; destination = undefined; held.clear(); touchMove = undefined;
  canvas.classList.toggle('aiming-arrow', active);
  document.querySelector('[data-action="bolt"]')!.setAttribute('aria-pressed', String(active));
  el('cancel-aim').hidden = !active;
  if (state) render();
}
function chooseAction(type: Action['type']) {
  if (type === 'bolt') {
    if (state?.status !== 'playing' || !me()?.hp) { toast('Start your adventure before aiming.'); return; }
    aimArrow(!aimingArrow);
  } else { aimArrow(false); send({ type } as Action); }
}
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => { button.onclick = () => { chooseAction(button.dataset.action as Action['type']); canvas.focus(); }; });
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => {
  const move = () => { aimArrow(false); const [dx, dy] = button.dataset.direction!.split(',').map(Number); touchMove = [dx, dy]; send({ type: 'move', dx, dy }); };
  button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); move(); };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => { touchMove = undefined; };
  button.onclick = e => { if (!e.detail) { move(); touchMove = undefined; } };
});
el('touch-attack').onclick = () => chooseAction('attack');
document.querySelectorAll<HTMLButtonElement>('[data-quick-slot]').forEach(button => { button.onclick = () => chooseAction(quickSlots.get(Number(button.dataset.quickSlot) as QuickSlot)); });
el('touch-interact').onclick = () => {
  const p = me();
  if (p && state && shopAt(state.map,p)) void openDialog('inventory');
  else chooseAction('interact');
};
el('cancel-aim').onclick = () => aimArrow(false);
function zoomMap(factor: number) { destination = undefined; mapZoom = Math.max(0.65, Math.min(2, mapZoom * factor)); draw(); }
el('zoom-in').onclick = () => zoomMap(1.2); el('zoom-out').onclick = () => zoomMap(1 / 1.2);
el('leave').onclick = () => {
  aimArrow(false); arrowStarts.clear();
  manualClose = true; clearTimeout(reconnectTimer);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' })); socket?.close();
  saved = undefined; state = undefined; playerId = ''; sessionStorage.removeItem('castle-session');
  el('lobby').hidden = false; el('party-overlay').hidden = true; el('share').hidden = true; el('leave').hidden = true;
  document.querySelector('.window')!.classList.remove('in-game');
  el('room-label').textContent = ''; el('party').textContent = ''; lobbyMessage('You left the expedition.'); draw();
};
el('share').onclick = async () => {
  if (!state) return;
  const url = new URL(location.href); url.search = ''; url.searchParams.set('room', state.code); if (serverUrl !== 'peer') url.searchParams.set('server', serverUrl);
  try { await navigator.clipboard.writeText(url.href); toast('Invite link copied. Send it to your companion.'); }
  catch { await openDialog('invite'); el('dialog-body').textContent = `Share code ${state.code}${serverUrl === 'peer' ? '. Keep the host tab open.' : ` and server ${serverUrl}.`}`; }
};
el('new-menu').onclick = () => { if (state?.mode === 'solo') toast('Solo expedition. Leave to return to the menu.'); else if (state) toast(`Expedition ${state.code}. Copy invite to bring a companion, or Leave to start another.`); else el<HTMLInputElement>('name').focus(); };

function me(): Player | undefined { return state?.players.find(p => p.id === playerId); }
function render() {
  if (!state) return;
  if (aimingArrow && (state.status !== 'playing' || !me()?.hp)) {
    aimingArrow = false; canvas.classList.remove('aiming-arrow');
    document.querySelector('[data-action="bolt"]')!.setAttribute('aria-pressed', 'false');
    el('cancel-aim').hidden = true;
  }
  for (const id of arrowStarts.keys()) if (!state.arrows?.some(a => a.id === id)) arrowStarts.delete(id);
  const solo = state.mode === 'solo';
  el('party-size').textContent = solo ? 'SOLO' : '2 PLAYERS';
  el('map-sharing').textContent = solo ? 'EXPLORED' : 'SHARED';
  el('partner-legend').hidden = solo;
  document.querySelector<HTMLButtonElement>('[data-action=revive]')!.hidden = solo;
  el('share').hidden = solo;
  el('room-label').textContent = solo ? 'SOLO EXPEDITION' : `ROOM ${state.code}`;
  if (solo) connection('Solo play', true);
  const player = me(); el('location').textContent = state.map.name;
  el('area-info').textContent = state.map.safe ? 'SAFE HAVEN' : `AREA ${state.level + 1} / 13`;
  el('position').textContent = player ? `${player.name} · ${player.x}, ${player.y} · ${aimingArrow ? 'Magic Arrow: click to fire (3 MP). Esc cancels.' : 'Click to walk'}` : '';
  el('position').dataset.x = String(player?.x); el('position').dataset.y = String(player?.y);
  el('world-clock').textContent = `${Math.floor(state.time / 60000)}:${String(Math.floor(state.time / 1000) % 60).padStart(2, '0')} · enemies: 1.4s / step`;
  el('simulation-status').textContent = { waiting: 'FORMING PARTY', playing: 'REAL TIME', paused: 'PAUSED · RECONNECTING', defeated: 'EXPEDITION FALLEN', won: 'VENGEANCE IS YOURS' }[state.status];
  const party = el('party'); party.replaceChildren();
  state.players.forEach(p => {
    const card = document.createElement('article'); card.className = `player-card ${p.id === playerId ? 'you' : ''}`;
    const portrait = document.createElement('img'); portrait.src = icon(p.slot === 0 ? art.hero : art.companion); portrait.alt = '';
    const title = document.createElement('strong'); title.textContent = `${p.name} ${p.id === playerId ? '(you)' : ''}`;
    const detail = document.createElement('span'); detail.textContent = `Level ${p.rank} · ${!p.connected ? 'Reconnecting' : p.hp <= 0 ? 'Down — needs revival' : p.ready ? 'Ready' : 'Preparing'}`;
    const heading = document.createElement('div'); heading.append(title, detail); const head = document.createElement('div'); head.className = 'player-heading'; head.append(portrait, heading);
    const health = document.createElement('div'); health.className = 'stat health'; health.innerHTML = `<label>HP</label><meter min="0" max="${p.maxHp}" value="${p.hp}" aria-label="Health"></meter><span>${p.hp}/${p.maxHp}</span>`;
    const mana = document.createElement('div'); mana.className = 'stat mana'; mana.innerHTML = `<label>MP</label><meter min="0" max="${p.maxMana}" value="${p.mana}" aria-label="Mana"></meter><span>${p.mana}/${p.maxMana}</span>`;
    const items = document.createElement('div'); items.className = 'pocket'; items.textContent = `${p.gold} gold · ${p.potions} potions · ${p.manaPotions} mana`;
    card.append(head, health, mana, items); party.append(card);
  });
  if (!solo && state.players.length < 2) { const waiting = document.createElement('div'); waiting.className = 'waiting-seat'; waiting.textContent = 'Companion wanted. Share your room code.'; party.append(waiting); }
  const visibleLog = state.log.slice(-5), lastLogId = String(visibleLog.at(-1)?.id);
  if (el('log').dataset.last !== lastLogId) { el('log').replaceChildren(...visibleLog.map(entry => { const p = document.createElement('p'); p.textContent = entry.text; return p; })); el('log').dataset.last = lastLogId; el('log').scrollTop = el('log').scrollHeight; }
  el('party-overlay').hidden = state.status === 'playing'; el('ready').hidden = state.status !== 'waiting' || !!player?.ready; el('restart').hidden = !['won', 'defeated'].includes(state.status);
  el('party-heading').textContent = { waiting: `Expedition ${state.code}`, paused: 'Waiting for your companion', defeated: 'Your expedition has fallen', won: 'Vengeance is yours', playing: '' }[state.status];
  el('party-message').textContent = state.status === 'waiting' ? `${state.players.length}/2 adventurers. ${player?.ready ? 'You are ready. Waiting for your companion.' : 'Share the invite, then both choose Ready.'}` : state.status === 'paused' ? 'Combat is paused. Reconnecting keeps your position, equipment, and progress.' : state.status === 'won' ? 'You defeated Hrungnir together. The north will remember.' : 'You can begin again with the same companion.';
  if (solo) el('party-message').textContent = state.status === 'won' ? 'You defeated Hrungnir. The north will remember.' : 'Your expedition has ended. Choose Begin again to restart.';
  el('quest-title').textContent = state.level === 0 ? 'Find the road north' : state.level < 4 ? 'Descend into the mine' : state.level === 4 ? 'Find Hrungnir’s stronghold' : 'Defeat the Hill Giant Lord';
  el('quest-text').textContent = player?.hp === 0 ? 'You are down. Your companion must stand beside you and press R with a healing potion.' : state.map.safe ? 'E at the sanctuary restores health and mana. Trade from your inventory. Gather at the stairs to travel.' : 'Bump an enemy or press Space to attack. Use 1–3 for spells. Stay together at the stairs; E travels.';
  if (solo) el('quest-text').textContent = player?.hp === 0 ? 'Your adventure has ended. Choose Begin again to restart.' : state.map.safe ? 'E at the sanctuary restores health and mana. Trade from your inventory. Use E near stairs to travel.' : 'Bump an enemy or press Space to attack. Use 1, 2, 3 for spells. E near stairs travels to the next area.';
  if (dialog.open && player) inventoryView?.update(state, player);
  if (dialog.open && player) spellbookView?.update(player, state.status === 'playing');
  el('mobile-location').textContent = state.map.name;
  el('mobile-vitals').textContent = player ? `♥ ${player.hp}/${player.maxHp}   ✦ ${player.mana}/${player.maxMana}   ◈ ${player.gold} gold` : '';
  const partner = state.players.find(p => p.id !== playerId);
  el('mobile-partner').textContent = partner ? `${partner.name} · HP ${partner.hp}/${partner.maxHp} · ${partner.connected ? 'Connected' : 'Reconnecting'}` : solo ? 'Solo adventure' : 'Waiting for your companion';
  el('mobile-status').textContent = aimingArrow ? 'MAGIC ARROW · Tap a tile to shoot' : `LEVEL ${player?.rank ?? 1} · ${el('simulation-status').textContent}`;
  el('mobile-log').textContent = state.log.at(-1)?.text ?? '';
  const near = (p: { x: number; y: number }, radius: number) => !!player && Math.max(Math.abs(player.x - p.x), Math.abs(player.y - p.y)) <= radius;
  el('touch-interact').textContent = player && shopAt(state.map,player) ? 'Trade' : (state.map.restPoints??[]).some(p=>near(p,2)) ? 'Rest' : state.map.portals.some(p => near(p, 1)) ? 'Travel' : 'Action';
  document.querySelectorAll<HTMLButtonElement>('[data-quick-slot]').forEach(button => {
    const slot = Number(button.dataset.quickSlot) as QuickSlot, action = quickSlots.get(slot), info = quickActions[action];
    const count = action === 'potion' ? player?.potions ?? 0 : action === 'mana' ? player?.manaPotions ?? 0 : undefined;
    if (button.dataset.assigned !== action) {
      button.dataset.assigned = action;
      button.innerHTML = `<span class="quick-number">${slot + 1}</span><img src="${icon(info.icon)}" alt=""><span class="quick-count"></span>`;
    }
    button.querySelector('.quick-count')!.textContent = count === undefined ? '' : String(count);
    const label = `Quick slot ${slot + 1}: ${info.name}${count === undefined ? ` (${info.cost} mana)` : ` (${count} remaining)`}`;
    button.setAttribute('aria-label', label); button.title = label;
    button.setAttribute('aria-pressed', String(action === 'bolt' && aimingArrow));
    button.disabled = state!.status !== 'playing' || !player?.hp || (count !== undefined ? count === 0 || (action === 'potion' ? player.hp === player.maxHp : player.mana === player.maxMana) : player.mana < info.cost || (action === 'heal' && player.hp === player.maxHp));
  });
  document.querySelector('.map-hint')!.textContent = aimingArrow ? 'Tap to fire · Cancel aim to walk' : 'Tap to walk · Pinch to zoom';
  draw();
}

let viewX = 0, viewY = 0;
function sprite(id: string | number, x: number, y: number, w = 32, h = 32) { const img = image(id); if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h); }
function draw() {
  cancelAnimationFrame(animationFrame); animationFrame = 0;
  if (mobileMedia.matches && state) {
    const box = document.querySelector('.canvas-wrap')!.getBoundingClientRect(), tile = 34 * mapZoom;
    viewColumns = Math.max(3, Math.floor(box.width / tile)); viewRows = Math.max(3, Math.floor(box.height / tile));
  } else { viewColumns = 23; viewRows = 17; }
  const pixelScale=Math.max(1,Math.ceil(devicePixelRatio)), logicalWidth=viewColumns*32, logicalHeight=viewRows*32;
  if (canvas.width !== logicalWidth*pixelScale || canvas.height !== logicalHeight*pixelScale) { canvas.width=logicalWidth*pixelScale; canvas.height=logicalHeight*pixelScale; }
  ctx.setTransform(pixelScale,0,0,pixelScale,0,0);
  canvas.style.setProperty('--map-ratio', String(viewColumns / viewRows));
  canvas.dataset.columns = String(viewColumns); canvas.dataset.rows = String(viewRows);
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = mapColors.unseen; ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  if (!state) { for (let y = 0; y < 17; y++) for (let x = 0; x < 23; x++) { ctx.fillStyle = (x + y) % 2 ? '#243b32' : '#273e35'; ctx.fillRect(x * 32, y * 32, 32, 32); } return; }
  const map = state.map, player = me() ?? state.players[0]; if (!player) return;
  viewX = Math.max(0, Math.min(map.width - viewColumns, player.x - Math.floor(viewColumns / 2))); viewY = Math.max(0, Math.min(map.height - viewRows, player.y - Math.floor(viewRows / 2)));
  canvas.dataset.viewX = String(viewX); canvas.dataset.viewY = String(viewY);
  const explored = new Set(map.explored), visible = new Set(map.visible ?? map.explored);
  for (let sy = 0; sy < viewRows; sy++) for (let sx = 0; sx < viewColumns; sx++) {
    const x = sx + viewX, y = sy + viewY, index = y * map.width + x;
    if (x >= map.width || y >= map.height || !explored.has(index)) continue;
    const tile = map.tiles[index], raw = map.rawTiles?.[index];
    // Like the mobile room view, show wall faces bordering passages;
    // solid rock beyond those faces stays dark instead of filling the screen.
    if (tile === 'wall' && !map.rawTiles && !map.mobileTiles && ![-1, 0, 1].some(dy => [-1, 0, 1].some(dx => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && map.tiles[ny * map.width + nx] !== 'wall';
    }))) continue;
    if(map.mobileTiles) {
      ctx.fillStyle=nativeColor(map,index); ctx.fillRect(sx*32,sy*32,32,32);
      if(['wall','tree','bridge'].includes(tile))drawTerrain(ctx,tile,undefined,map.safe,sx*32,sy*32);
      if(map.mobileTiles[index]===1||map.mobileTiles[index]===13) {ctx.fillStyle='rgba(0,0,0,.05)';ctx.fillRect(sx*32,sy*32,32,1);ctx.fillRect(sx*32,sy*32,1,32);}
      const feature: Record<number,number>={8:141,10:12,12:54,16:12,17:20,18:403,19:157};
      const id=feature[map.mobileTiles[index]];if(id)sprite(id,sx*32,sy*32);
    } else drawTerrain(ctx, tile, raw, map.safe, sx * 32, sy * 32);
    if (tile === 'door') sprite(4, sx * 32, sy * 32); if (tile === 'open' && !map.mobileTiles) sprite(6, sx * 32, sy * 32); if (raw === 86) sprite(65, sx * 32, sy * 32);
  }
  for (const d of map.decorations) if (explored.has(d.y * map.width + d.x)) {
    const img = image(buildingArt(map, d.image));
    if (!img.complete || !img.naturalWidth) continue;
    if(map.mobileTiles) {ctx.drawImage(img,(d.x-viewX)*32,(d.y-viewY)*32,d.width*32,d.height*32);continue;}
    const scale = Math.min(d.width * 32 / img.naturalWidth, d.height * 32 / img.naturalHeight);
    const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
    ctx.drawImage(img, (d.x - viewX) * 32 + (d.width * 32 - width) / 2, (d.y - viewY) * 32 + d.height * 32 - height, width, height);
  }
  const screen = (p: { x: number; y: number }) => ({ x: (p.x - viewX) * 32, y: (p.y - viewY) * 32 });
  if (map.shop && !map.mobileTiles) { const p = screen(map.shop); sprite(12, p.x, p.y); }
  map.portals.forEach(portal => { if (!explored.has(portal.y * map.width + portal.x)) return; const p = screen(portal); if(map.mobileTiles?.[portal.y*map.width+portal.x]!==12)sprite(portal.to > state!.level ? 10 : 8, p.x, p.y); if(!map.mobileTiles) {ctx.strokeStyle = '#e9ce55'; ctx.strokeRect(p.x + 1, p.y + 1, 30, 30); } });
  map.loot.forEach(item => { if (!visible.has(item.y * map.width + item.x)) return; const p = screen(item); sprite({ gold: art.gold, potion: art.potion, mana: art.mana, weapon: art.sword, armor: art.armor }[item.kind], p.x, p.y); });
  map.enemies.filter(e => e.hp > 0 && visible.has(e.y * map.width + e.x)).forEach(e => { const p = screen(e); sprite(map.mobileTiles ? e.icon : creatureArt[e.name] ?? e.icon, p.x, p.y); if (e.hp < e.maxHp) { ctx.fillStyle = '#441b22'; ctx.fillRect(p.x + 3, p.y + 28, 26, 3); ctx.fillStyle = '#d36e63'; ctx.fillRect(p.x + 3, p.y + 28, 26 * e.hp / e.maxHp, 3); } });
  if(map.mobileTiles) for(let sy=0;sy<viewRows;sy++)for(let sx=0;sx<viewColumns;sx++) {
    const index=(sy+viewY)*map.width+sx+viewX;if(explored.has(index)&&!visible.has(index)){ctx.fillStyle=map.safe?'#0a121933':'#0a121999';ctx.fillRect(sx*32,sy*32,32,32);}
  }
  state.players.forEach(p => { const s = screen(p); ctx.strokeStyle = p.id === playerId ? '#dfbe7688' : '#63e6ff'; ctx.lineWidth = 2; ctx.strokeRect(s.x + 1, s.y + 1, 30, 30); ctx.lineWidth = 1; sprite(p.hp ? p.slot === 0 ? art.hero : art.companion : 52, s.x, s.y); });
  if (map.safe) {
    const label = (text: string, x: number, y: number) => {
      if (!explored.has(y * map.width + x)) return;
      const p = screen({ x, y }); if (p.y < 14 || p.y > logicalHeight || p.x < 0 || p.x >= logicalWidth) return;
      ctx.font = 'bold 9px Tahoma, sans-serif';
      const width = ctx.measureText(text).width, left = Math.max(3, Math.min(logicalWidth - width - 7, p.x + 16 - width / 2));
      ctx.fillStyle = '#102029dd'; ctx.fillRect(left - 3, p.y - 13, width + 6, 13);
      ctx.fillStyle = '#e0e5e2'; ctx.fillText(text, left, p.y - 3);
    };
    if(map.places) { for(const place of map.places) label(place.sign,place.x+Math.floor(place.width/2),place.y); if(map.id===0)label('BURNED FARM',18,26); }
    else { if (map.shop) label('TRADE / REST', map.shop.x, map.shop.y); for (const portal of map.portals) label(portal.to > state.level ? 'ROAD NORTH' : 'RETURN', portal.x, portal.y); }
  }
  let animating = false;
  for (const arrow of state.arrows ?? []) {
    if (arrow.level !== state.level) continue;
    if (!arrowStarts.has(arrow.id)) arrowStarts.set(arrow.id, performance.now());
    const t = (performance.now() - arrowStarts.get(arrow.id)!) / arrow.duration;
    if (t >= 1) continue;
    animating = true;
    const from = screen(arrow.from), to = screen(arrow.to), dx = to.x - from.x, dy = to.y - from.y;
    const x = from.x + 16 + dx * t, y = from.y + 16 + dy * t;
    ctx.save(); ctx.strokeStyle = '#8cf4ff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3;
    ctx.shadowColor = '#19bfff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(from.x + 16 + dx * Math.max(0, t - 0.2), from.y + 16 + dy * Math.max(0, t - 0.2)); ctx.lineTo(x, y); ctx.stroke();
    ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-2, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  if (animating) animationFrame = requestAnimationFrame(draw);
  if (destination) { const p = screen(destination); ctx.strokeStyle = '#fff'; ctx.strokeRect(p.x + 4, p.y + 4, 24, 24); }
  mc.fillStyle = mapColors.unseen; mc.fillRect(0, 0, mini.width, mini.height); const size = Math.min(mini.width / map.width, mini.height / map.height);
  map.explored.forEach(index => { const x = index % map.width, y = Math.floor(index / map.width); mc.fillStyle = nativeColor(map,index); mc.fillRect(x * size, y * size, Math.ceil(size), Math.ceil(size)); });
  map.portals.forEach(p => { if (explored.has(p.y * map.width + p.x)) { mc.fillStyle = 'white'; mc.fillRect(p.x * size, p.y * size, size, size); } });
  state.players.forEach(p => { mc.fillStyle = p.id === playerId ? '#ffe953' : '#63e6ff'; mc.fillRect(p.x * size, p.y * size, Math.max(3, size), Math.max(3, size)); });
}

const held = new Set<string>();
const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1] };
const hotkeys: Record<string, Action['type']> = { ' ': 'attack', '1': 'bolt', '2': 'heal', '3': 'fireball', h: 'potion', q: 'mana', e: 'interact', r: 'revive' };
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || dialog.open || !state) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === 'Escape') { e.preventDefault(); aimArrow(false); return; }
  if (directions[key]) { e.preventDefault(); if (aimingArrow) aimArrow(false); destination = undefined; if (!held.has(key)) { const [dx, dy] = directions[key]; send({ type: 'move', dx, dy }); } held.add(key); }
  if (hotkeys[key]) { e.preventDefault(); if (!e.repeat) chooseAction(hotkeys[key]); }
  if (key === 'i' || key === 'j' || key === '?') void openDialog(key === 'i' ? 'inventory' : key === 'j' ? 'journal' : 'help');
});
window.addEventListener('keyup', e => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => { held.clear(); touchMove = undefined; destination = undefined; });
document.addEventListener('visibilitychange', () => { held.clear(); touchMove = undefined; destination = undefined; });
function mapTap(clientX: number, clientY: number) {
  if (!state || state.status !== 'playing') return;
  const { x, y } = mapPoint(clientX, clientY);
  if (aimingArrow) {
    destination = undefined;
    if ((me()?.mana ?? 0) < 3) toast('Magic Arrow costs 3 mana.');
    else send({ type: 'bolt', x, y });
    canvas.focus(); return;
  }
  if (state.map.explored.includes(y * state.map.width + x)) destination = { x, y }; canvas.focus();
}
function mapPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.floor((clientX - rect.left) / rect.width * viewColumns) + viewX, y: Math.floor((clientY - rect.top) / rect.height * viewRows) + viewY };
}
canvas.onclick = e => { if (performance.now() - Number(canvas.dataset.lastTouch ?? -1000) > 500 && (!(e as PointerEvent).pointerType || (e as PointerEvent).pointerType === 'mouse')) mapTap(e.clientX, e.clientY); };
touchMap(canvas, mapTap, (x, y) => {
  if (!state) return; destination = undefined;
  const p = mapPoint(x, y), index = p.y * state.map.width + p.x;
  if (!state.map.explored.includes(index)) { toast('Unexplored ground.'); return; }
  const enemy = state.map.enemies.find(e => e.hp > 0 && e.x === p.x && e.y === p.y);
  toast(enemy ? `${enemy.name} · ${enemy.hp}/${enemy.maxHp} HP` : state.map.portals.find(e => e.x === p.x && e.y === p.y)?.label ?? `${state.map.tiles[index]} · ${p.x}, ${p.y}`);
}, zoomMap);
new ResizeObserver(() => draw()).observe(document.querySelector('.canvas-wrap')!);
canvas.oncontextmenu = e => { if (aimingArrow) { e.preventDefault(); aimArrow(false); } };
function walk() {
  if (aimingArrow || dialog.open || !state || state.status !== 'playing') return;
  const player = me(); if (!player || player.hp <= 0) return;
  if (touchMove) { const [dx, dy] = touchMove; send({ type: 'move', dx, dy }); return; }
  const key = [...held].at(-1); if (key && directions[key]) { const [dx, dy] = directions[key]; send({ type: 'move', dx, dy }); return; }
  if (!destination) return;
  const target = destination, map = state.map;
  if (player.x === target.x && player.y === target.y) { destination = undefined; return; }
  const queue = [{ x: player.x, y: player.y, first: [0, 0] }], seen = new Set([`${player.x},${player.y}`]), explored = new Set(map.explored);
  for (let i = 0; i < queue.length && i < 4096; i++) {
    const p = queue[i];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = p.x + dx, y = p.y + dy, id = `${x},${y}`;
      if (seen.has(id) || x < 0 || y < 0 || x >= map.width || y >= map.height || !explored.has(y * map.width + x)) continue;
      if (!['floor', 'grass', 'road', 'bridge', 'door', 'open'].includes(map.tiles[y * map.width + x]) || state.players.some(other => other.id !== playerId && other.x === x && other.y === y)) continue;
      seen.add(id); const first = i === 0 ? [dx, dy] : p.first;
      if (x === target.x && y === target.y) { send({ type: 'move', dx: first[0], dy: first[1] }); return; }
      queue.push({ x, y, first });
    }
  }
  destination = undefined;
}
setInterval(walk, 300);
setInterval(() => { if (socket?.readyState === WebSocket.OPEN && state && Date.now() - lastMessage > 8000) socket.close(); }, 2000);

async function openDialog(kind: string) {
  aimArrow(false); held.clear(); destination = undefined;
  inventoryView = undefined; spellbookView = undefined; dialog.classList.toggle('inventory-dialog', kind === 'inventory'); dialog.classList.toggle('spellbook-dialog', kind === 'spells');
  const body = el('dialog-body'); body.replaceChildren(); el('dialog-title').textContent = kind === 'inventory' ? 'Castle Inventory' : kind === 'journal' ? 'Recovered story journal' : kind === 'invite' ? 'Invite a companion' : 'How to adventure';
  if (!dialog.open) dialog.showModal();
  if (kind === 'inventory') {
    const p = me(); if (!p || !state) { body.textContent = 'Join an expedition to view your equipment.'; return; }
    inventoryView = mountInventory(body, send, closeDialog, slotAssignments); inventoryView.update(state, p);
  } else if (kind === 'spells') {
    el('dialog-title').textContent = 'Spellbook'; const p = me(); if (!p) return;
    spellbookView = mountSpellbook(body, type => { closeDialog(); chooseAction(type); }, slotAssignments); spellbookView.update(p, state?.status === 'playing');
  } else if (kind === 'hero') {
    el('dialog-title').textContent = 'Your expedition';
    for (const p of state?.players ?? []) {
      const section = document.createElement('section'); section.className = 'hero-details';
      const heading = document.createElement('h2'); heading.textContent = `${p.name}${p.id === playerId ? ' (you)' : ''}`;
      const detail = document.createElement('p'); detail.textContent = `Level ${p.rank} · XP ${p.xp}/${p.rank * 45}\nHP ${p.hp}/${p.maxHp} · Mana ${p.mana}/${p.maxMana}\n${p.gold} gold · ${p.potions} healing potions · ${p.manaPotions} mana potions\nShort sword +${p.weapon} · Armor +${p.armor}\n${p.connected ? 'Connected' : 'Reconnecting'}`;
      section.append(heading, detail); body.append(section);
    }
    const revive = document.createElement('button'); revive.textContent = 'Revive companion (1 potion)'; revive.hidden = state?.mode === 'solo'; revive.onclick = () => { closeDialog(); chooseAction('revive'); }; body.append(revive);
  } else if (kind === 'menu') {
    el('dialog-title').textContent = 'Expedition';
    const summary = document.createElement('p'); summary.textContent = state?.mode === 'solo' ? 'Solo adventure' : `Room ${state?.code ?? ''} · Share this code with your companion.`; body.append(summary);
    for (const [label, callback] of [
      ['Copy invite', () => el('share').click()], ['Rest at sanctuary', () => { closeDialog(); chooseAction('interact'); }],
      ['How to play', () => void openDialog('help')], ['Leave expedition', () => { closeDialog(); el('leave').click(); }],
    ] as const) { const b = document.createElement('button'); b.textContent = label; b.className = 'menu-action'; b.onclick = callback; if (label === 'Copy invite' && state?.mode === 'solo') continue; body.append(b); }
  } else if (kind === 'journal') {
    body.textContent = 'Loading the original story…';
    try {
      const stories: { id: number; text: string }[] = await fetch(`${base}classic/stories.json`).then(r => r.json()); body.replaceChildren();
      const note = document.createElement('p'); note.textContent = 'Original text recovered from the executable. Includes the full story and spoilers. The co-op campaign adapts its progression.'; body.append(note);
      stories.forEach(s => { const section = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('p'); summary.textContent = `Story ${s.id}`; text.className = 'story-text'; text.textContent = s.text.replace(/^[^a-zA-Z]+/, '').replaceAll('#', '\n'); section.append(summary, text); body.append(section); });
    } catch { body.textContent = 'Unable to load the recovered story. Please try again.'; }
  } else if (kind !== 'invite') {
    body.innerHTML = `<h2>Solo or co-op. No waiting for turns.</h2><p>Play solo starts immediately, with no matchmaking connection. For co-op, both adventurers join and choose Ready. Enemies act every 1.4 seconds. Opening a menu does not pause combat.</p><dl><dt>Touch controls</dt><dd>Use the eight-way pad; hold a direction to keep moving. The center button attacks. Tap the map to walk, pinch or use + / - to zoom, and long-press to inspect. Pack, Spells, Hero and Journal open touch panels. Select a potion in Pack or a spell in Spells, then Assign to slot 1 or 2 to customize the two icon buttons. Potion badges show quantities; assignments are saved on this device. Choose Magic Arrow, then tap a tile to shoot; Cancel aim returns to walking. Trade opens the shop near a shop; Rest at sanctuary is in the menu. Rotate your phone for a side-by-side layout.</dd><dt>Move</dt><dd>WASD, arrows, Home / End / Page Up / Page Down for diagonals, or click an explored tile.</dd><dt>Fight</dt><dd>Bump an enemy or Space to strike. 1 or Magic Arrow: aim with the crosshair, then click any map tile to fire (3 MP, six-tile range). Click again to keep firing; Escape, right-click, movement, or another action cancels aiming. 2: Heal (6 MP). 3: Fireball (8 MP). Magic Arrow travels toward your chosen tile, stopping at walls or the first monster. Fireball targets the nearest visible enemy.</dd><dt>Survive</dt><dd>H: healing potion. Q: mana potion. R: revive an adjacent partner using one healing potion. Mana slowly regenerates.</dd><dt>Explore</dt><dd>E: use stairs. In co-op, both players must be alive and within three tiles. Solo adventurers can travel alone. Walk over loot to collect it. Experience is shared in co-op.</dd><dt>Rest & trade</dt><dd>E near the sanctuary restores HP and MP. I opens inventory and shop purchases.</dd><dt>Connections</dt><dd>Host expedition, then share the six-character code or invite link. PeerJS provides free matchmaking; the host browser runs the game and sends updates over WebRTC. A relay may carry traffic when a direct connection is unavailable. Keep the host tab and computer awake. A disconnect pauses combat; refreshing the same tab restores your adventurer. Progress is saved in the host tab's session storage, so closing that tab can lose the expedition. Leave ends your session. Matchmaking and relay availability depend on the free service.</dd></dl><p>Recovered: original icons, bitmaps, and story resources. Campaign maps are exported directly from CastleWinds_Mobile. Reconstructed: combat balance, online combat, item mechanics, and networking. This is not the complete original game running in an emulator.</p>`;
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-dialog], [data-mobile-dialog]').forEach(b => { b.onclick = () => { void openDialog((b.dataset.dialog ?? b.dataset.mobileDialog)!); }; });
el('close-dialog').onclick = closeDialog;
draw();
if (saved) { serverUrl = saved.server; connect({ type: 'resume', code: saved.code, token: saved.token }, true); }
