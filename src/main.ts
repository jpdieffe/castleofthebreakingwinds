import './style.css';
import type { Action, Player, ServerMessage, Snapshot } from '../shared/types';

const base = import.meta.env.BASE_URL;
const icon = (id: number | string) => `${base}classic/${id}.png`;
const query = new URLSearchParams(location.search);
const defaultServer = import.meta.env.VITE_GAME_SERVER || (location.hostname.endsWith('github.io') ? '' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}${import.meta.env.DEV ? ':8787' : location.port ? `:${location.port}` : ''}/ws`);
let serverUrl = query.get('server') || localStorage.getItem('castle-server') || defaultServer;
let socket: WebSocket | undefined, state: Snapshot | undefined, playerId = '', reconnectTimer = 0;
let manualClose = false, pending = false, reconnectCount = 0, lastMessage = Date.now();
let destination: { x: number; y: number } | undefined;
let saved: { code: string; token: string; playerId: string; server: string } | undefined;
try { saved = JSON.parse(sessionStorage.getItem('castle-session') || 'null') || undefined; } catch { sessionStorage.removeItem('castle-session'); }
const images = new Map<string, HTMLImageElement>();
const image = (id: number | string) => {
  const key = String(id);
  if (!images.has(key)) { const img = new Image(); img.src = icon(id); img.onload = () => draw(); images.set(key, img); }
  return images.get(key)!;
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header class="masthead"><div><span class="edition">THE TWO-PLAYER EXPEDITION</span><h1>Castle of the Winds</h1></div><span class="connection" id="connection">Not connected</span></header>
<main class="window"><div class="titlebar"><img src="${icon(2)}" alt=""><span>Castle of the Winds — A Question of Vengeance</span><span class="window-mark">◆</span></div>
<nav class="menubar" aria-label="Game menu"><button id="new-menu">Expedition</button><button data-dialog="inventory">Inventory <kbd>I</kbd></button><button data-dialog="journal">Journal <kbd>J</kbd></button><button data-dialog="help">Help <kbd>?</kbd></button><span id="room-label"></span><button id="share" hidden>Copy invite</button><button id="leave" hidden>Leave</button></nav>
<div class="toolbar" aria-label="Actions">
${([['attack',111,'Attack','Space'],['bolt',343,'Magic Arrow','1'],['heal',227,'Heal','2'],['fireball',339,'Fireball','3'],['potion',231,'Potion','H'],['mana',233,'Mana','Q'],['interact',7,'Use / stairs','E'],['revive',269,'Revive','R']] as const).map(([action,id,name,key]) => `<button data-action="${action}"><img src="${icon(id)}" alt="">${name} <kbd>${key}</kbd></button>`).join('')}
</div><div class="game-layout"><section class="viewport-pane" aria-label="Dungeon"><div class="pane-title"><span id="location">A Tiny Hamlet</span><span id="area-info">Original artwork · online co-op</span></div>
<div class="canvas-wrap"><canvas id="world" width="736" height="544" tabindex="0" aria-label="Game map. Use arrows or WASD to move, Space to attack, E to use stairs."></canvas>
<section id="lobby" class="lobby" aria-label="Join an expedition"><img class="original-logo" src="${icon('bitmap-10')}" alt="Castle of the Winds original logo"><h2>A familiar world.<br>A companion at your side.</h2><p>The original world returns in real time. Two adventurers, one expedition.</p>
<form id="lobby-form"><label for="name">Adventurer’s name</label><input id="name" maxlength="20" required autocomplete="nickname" placeholder="Enter your name"><button type="submit" id="create" class="primary">Create expedition</button><div class="or">or join a friend</div><div class="join-row"><label class="sr-only" for="code">Expedition code</label><input id="code" maxlength="6" placeholder="6-character code" autocomplete="off" autocapitalize="characters"><button type="button" id="join">Join</button></div><details id="connection-settings"><summary>Game server</summary><label for="server">Server address</label><input id="server" type="url" placeholder="wss://your-server.example/ws"><p>Both players must use the same server.</p></details></form><p id="lobby-status" role="status"></p><small>Browser reconstruction using recovered Castle1 resources.<br>Rick Saada / SaadaSoft · Art: Paul Canniff · Publisher: Epic MegaGames</small></section>
<section id="party-overlay" class="party-overlay" hidden><strong id="party-heading"></strong><p id="party-message"></p><button id="ready" class="primary">Ready to adventure</button><button id="restart" hidden>Begin again</button></section></div>
<div class="map-footer"><span id="position">Explore together. Move with WASD or arrow keys.</span><span id="world-clock">Enemies move every 1.4 seconds</span></div></section>
<aside><div class="pane-title">Your expedition <span>2 PLAYERS</span></div><div id="party"><div class="empty-party"><img src="${icon(421)}" alt="Adventurer">Every journey begins<br>with a first step.</div></div><div class="pane-title">Area map <span>SHARED</span></div><canvas id="minimap" width="230" height="170" aria-label="Shared explored map"></canvas><div class="quest"><span class="eyebrow">A QUESTION OF VENGEANCE</span><h3 id="quest-title">Find the road north</h3><p id="quest-text">Meet at the stairs, then press E to travel together. Rest and trade beside the village well.</p></div><div class="legend"><span><i class="gold-dot"></i>You</span><span><i class="blue-dot"></i>Partner</span><span><i class="red-dot"></i>Enemy</span></div></aside></div>
<section class="chronicle"><div class="pane-title">Adventure log <span id="simulation-status">WAITING FOR ADVENTURERS</span></div><div id="log" role="log" aria-live="polite"><p>Welcome to the north. Invite a friend to begin.</p></div></section><div class="touch-controls"><div class="dpad">${[['0,-1','↑','north'],['-1,0','←','west'],['0,1','↓','south'],['1,0','→','east']].map(([dir,label,name]) => `<button data-direction="${dir}" aria-label="Move ${name}">${label}</button>`).join('')}</div><span>Click an explored tile to walk there.</span></div></main>
<footer class="page-footer"><span>CLASSIC WORLD. SHARED ADVENTURE.</span><span>Original resources recovered from CASTLE1.EXE · Co-op reconstruction</span></footer><div id="toast" role="status" hidden></div><dialog id="dialog"><div class="titlebar"><span id="dialog-title"></span><button id="close-dialog" aria-label="Close dialog">×</button></div><div id="dialog-body"></div></dialog>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('world'), ctx = canvas.getContext('2d')!;
const mini = el<HTMLCanvasElement>('minimap'), mc = mini.getContext('2d')!;
const dialog = el<HTMLDialogElement>('dialog');
el<HTMLInputElement>('server').value = serverUrl;
el<HTMLInputElement>('code').value = query.get('room')?.slice(0, 6).toUpperCase() || '';
el<HTMLInputElement>('name').value = localStorage.getItem('castle-name') || '';
if (!serverUrl) {
  el<HTMLDetailsElement>('connection-settings').open = true;
  const notice = document.createElement('p');
  notice.className = 'local-server-notice';
  notice.append('Hosting on your computer? ');
  const link = document.createElement('a'); link.href = 'http://localhost:8787/'; link.textContent = 'Open the local game';
  notice.append(link, '. For internet play, enter a secure game-server address below.');
  el('lobby-form').before(notice);
}
let toastTimer = 0;
function toast(message: string) { el('toast').textContent = message; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el('toast').hidden = true; }, 4000); }
function connection(text: string, connected = false) { el('connection').textContent = text; el('connection').classList.toggle('connected', connected); }
function lobbyMessage(text: string) { el('lobby-status').textContent = text; }
function busy(value: boolean) { pending = value; el<HTMLButtonElement>('create').disabled = value; el<HTMLButtonElement>('join').disabled = value; }
function connect(message: object, resume = false) {
  clearTimeout(reconnectTimer);
  try {
    const url = new URL(serverUrl);
    if (!['ws:', 'wss:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) throw new Error('Use a wss:// game server on secure websites. Locally, use ws://localhost:8787/ws.');
  } catch (error) { busy(false); lobbyMessage(error instanceof Error ? error.message : 'Enter a valid game server URL.'); return; }
  manualClose = false; busy(true); connection(resume ? 'Reconnecting…' : 'Connecting…');
  const ws = new WebSocket(serverUrl); socket = ws;
  const timeout = window.setTimeout(() => { if (pending) ws.close(); }, 10000);
  ws.onopen = () => { ws.send(JSON.stringify(message)); lastMessage = Date.now(); };
  ws.onmessage = event => {
    if (socket !== ws) return;
    lastMessage = Date.now(); const response = JSON.parse(event.data) as ServerMessage;
    if (response.type === 'welcome') {
      clearTimeout(timeout); busy(false); reconnectCount = 0; playerId = response.playerId;
      saved = { code: response.code, token: response.token, playerId, server: serverUrl };
      sessionStorage.setItem('castle-session', JSON.stringify(saved)); localStorage.setItem('castle-server', serverUrl);
      el('lobby').hidden = true; el('share').hidden = false; el('leave').hidden = false;
      document.querySelector('.window')!.classList.add('in-game');
      el('room-label').textContent = `ROOM ${response.code}`; connection('Connected', true); canvas.focus();
    } else if (response.type === 'state') { state = response.state; render(); }
    else {
      busy(false); lobbyMessage(response.message); toast(response.message);
      if (resume && !state) { saved = undefined; sessionStorage.removeItem('castle-session'); }
      if (response.fatal) { manualClose = true; connection('Disconnected'); }
    }
  };
  ws.onerror = () => { lobbyMessage('Cannot reach the game server. Check its address and that it is running.'); };
  ws.onclose = event => {
    clearTimeout(timeout); if (socket !== ws) return;
    busy(false); connection('Disconnected'); destination = undefined;
    if (event.code === 4001) { manualClose = true; toast('This adventurer was resumed in another window.'); }
    if (!manualClose && saved) {
      connection('Reconnecting… world paused');
      reconnectTimer = window.setTimeout(() => { if (saved) { serverUrl = saved.server; connect({ type: 'resume', code: saved.code, token: saved.token }, true); } }, Math.min(4000, 500 * 2 ** reconnectCount++));
    } else if (!manualClose) lobbyMessage('Connection closed. Check the server address, then try again.');
  };
}
function enter(type: 'create' | 'join') {
  if (pending) return;
  const name = el<HTMLInputElement>('name').value.trim();
  if (!name) { el<HTMLInputElement>('name').reportValidity(); return; }
  serverUrl = el<HTMLInputElement>('server').value.trim(); const code = el<HTMLInputElement>('code').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z0-9]{6}$/.test(code)) { lobbyMessage('Enter a six-character expedition code.'); return; }
  localStorage.setItem('castle-name', name); lobbyMessage('Connecting to your expedition…');
  if (socket) { manualClose = true; socket.onclose = null; socket.close(); }
  connect({ type, name, code });
}
el('lobby-form').addEventListener('submit', e => { e.preventDefault(); enter('create'); });
el('join').onclick = () => enter('join');
function send(action: Action) { if (socket?.readyState === WebSocket.OPEN && state) socket.send(JSON.stringify({ type: 'action', action })); }
el('ready').onclick = () => send({ type: 'ready' }); el('restart').onclick = () => send({ type: 'restart' });
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => { button.onclick = () => { destination = undefined; send({ type: button.dataset.action } as Action); canvas.focus(); }; });
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => { button.onclick = () => { const [dx, dy] = button.dataset.direction!.split(',').map(Number); send({ type: 'move', dx, dy }); }; });
el('leave').onclick = () => {
  manualClose = true; clearTimeout(reconnectTimer);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' })); socket?.close();
  saved = undefined; state = undefined; playerId = ''; sessionStorage.removeItem('castle-session');
  el('lobby').hidden = false; el('party-overlay').hidden = true; el('share').hidden = true; el('leave').hidden = true;
  document.querySelector('.window')!.classList.remove('in-game');
  el('room-label').textContent = ''; el('party').textContent = ''; lobbyMessage('You left the expedition.'); draw();
};
el('share').onclick = async () => {
  if (!state) return;
  const url = new URL(location.href); url.search = ''; url.searchParams.set('room', state.code); url.searchParams.set('server', serverUrl);
  try { await navigator.clipboard.writeText(url.href); toast('Invite link copied. Send it to your companion.'); }
  catch { await openDialog('invite'); el('dialog-body').textContent = `Share code ${state.code} and server ${serverUrl}.`; }
};
el('new-menu').onclick = () => { if (state) toast(`Expedition ${state.code}. Copy invite to bring a companion, or Leave to start another.`); else el<HTMLInputElement>('name').focus(); };

function me(): Player | undefined { return state?.players.find(p => p.id === playerId); }
function render() {
  if (!state) return;
  const player = me(); el('location').textContent = state.map.name;
  el('area-info').textContent = state.map.safe ? 'SAFE HAVEN' : `AREA ${state.level + 1} / 14`;
  el('position').textContent = player ? `${player.name} · ${player.x}, ${player.y} · Click to walk` : '';
  el('position').dataset.x = String(player?.x); el('position').dataset.y = String(player?.y);
  el('world-clock').textContent = `${Math.floor(state.time / 60000)}:${String(Math.floor(state.time / 1000) % 60).padStart(2, '0')} · enemies: 1.4s / step`;
  el('simulation-status').textContent = { waiting: 'FORMING PARTY', playing: 'REAL TIME', paused: 'PAUSED · RECONNECTING', defeated: 'EXPEDITION FALLEN', won: 'VENGEANCE IS YOURS' }[state.status];
  const party = el('party'); party.replaceChildren();
  state.players.forEach(p => {
    const card = document.createElement('article'); card.className = `player-card ${p.id === playerId ? 'you' : ''}`;
    const portrait = document.createElement('img'); portrait.src = icon(p.slot === 0 ? 421 : 403); portrait.alt = '';
    const title = document.createElement('strong'); title.textContent = `${p.name} ${p.id === playerId ? '(you)' : ''}`;
    const detail = document.createElement('span'); detail.textContent = `Level ${p.rank} · ${!p.connected ? 'Reconnecting' : p.hp <= 0 ? 'Down — needs revival' : p.ready ? 'Ready' : 'Preparing'}`;
    const heading = document.createElement('div'); heading.append(title, detail); const head = document.createElement('div'); head.className = 'player-heading'; head.append(portrait, heading);
    const health = document.createElement('div'); health.className = 'stat health'; health.innerHTML = `<label>HP</label><meter min="0" max="${p.maxHp}" value="${p.hp}" aria-label="Health"></meter><span>${p.hp}/${p.maxHp}</span>`;
    const mana = document.createElement('div'); mana.className = 'stat mana'; mana.innerHTML = `<label>MP</label><meter min="0" max="${p.maxMana}" value="${p.mana}" aria-label="Mana"></meter><span>${p.mana}/${p.maxMana}</span>`;
    const items = document.createElement('div'); items.className = 'pocket'; items.textContent = `${p.gold} gold · ${p.potions} potions · ${p.manaPotions} mana`;
    card.append(head, health, mana, items); party.append(card);
  });
  if (state.players.length < 2) { const waiting = document.createElement('div'); waiting.className = 'waiting-seat'; waiting.textContent = 'Companion wanted. Share your room code.'; party.append(waiting); }
  const visibleLog = state.log.slice(-5), lastLogId = String(visibleLog.at(-1)?.id);
  if (el('log').dataset.last !== lastLogId) { el('log').replaceChildren(...visibleLog.map(entry => { const p = document.createElement('p'); p.textContent = entry.text; return p; })); el('log').dataset.last = lastLogId; el('log').scrollTop = el('log').scrollHeight; }
  el('party-overlay').hidden = state.status === 'playing'; el('ready').hidden = state.status !== 'waiting' || !!player?.ready; el('restart').hidden = !['won', 'defeated'].includes(state.status);
  el('party-heading').textContent = { waiting: `Expedition ${state.code}`, paused: 'Waiting for your companion', defeated: 'Your expedition has fallen', won: 'Vengeance is yours', playing: '' }[state.status];
  el('party-message').textContent = state.status === 'waiting' ? `${state.players.length}/2 adventurers. ${player?.ready ? 'You are ready. Waiting for your companion.' : 'Share the invite, then both choose Ready.'}` : state.status === 'paused' ? 'Combat is paused. Reconnecting keeps your position, equipment, and progress.' : state.status === 'won' ? 'You defeated Hrungnir together. The north will remember.' : 'You can begin again with the same companion.';
  el('quest-title').textContent = state.level === 0 ? 'Find the road north' : state.level < 7 ? 'Descend into the mine' : state.level < 10 ? 'Find Hrungnir’s stronghold' : 'Defeat the Hill Giant Lord';
  el('quest-text').textContent = player?.hp === 0 ? 'You are down. Your companion must stand beside you and press R with a healing potion.' : state.map.safe ? 'E at the well restores health and mana. Trade from your inventory. Gather at the stairs to travel.' : 'Bump an enemy or press Space to attack. Use 1–3 for spells. Stay together at the stairs; E travels.';
  draw();
}

let viewX = 0, viewY = 0;
function sprite(id: string | number, x: number, y: number, w = 32, h = 32) { const img = image(id); if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h); }
function draw() {
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#101719'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state) { for (let y = 0; y < 17; y++) for (let x = 0; x < 23; x++) { ctx.fillStyle = (x + y) % 2 ? '#243b32' : '#273e35'; ctx.fillRect(x * 32, y * 32, 32, 32); } return; }
  const map = state.map, player = me() ?? state.players[0]; if (!player) return;
  viewX = Math.max(0, Math.min(map.width - 23, player.x - 11)); viewY = Math.max(0, Math.min(map.height - 17, player.y - 8));
  const explored = new Set(map.explored);
  for (let sy = 0; sy < 17; sy++) for (let sx = 0; sx < 23; sx++) {
    const x = sx + viewX, y = sy + viewY, index = y * map.width + x;
    if (x >= map.width || y >= map.height || !explored.has(index)) continue;
    const tile = map.tiles[index], raw = map.rawTiles?.[index];
    ctx.fillStyle = { wall: map.rawTiles ? '#62615b' : '#55504a', floor: '#d3cbb6', grass: '#138311', tree: '#075600', water: '#0000a8', door: '#d3cbb6', open: '#d3cbb6' }[tile];
    if (raw === 3) ctx.fillStyle = '#a59c47'; ctx.fillRect(sx * 32, sy * 32, 32, 32);
    if (tile === 'wall' && !map.rawTiles) { ctx.strokeStyle = '#35342f'; ctx.strokeRect(sx * 32, sy * 32, 32, 16); ctx.strokeRect(sx * 32 - 8, sy * 32 + 16, 24, 16); }
    if (tile === 'tree') { ctx.fillStyle = '#003800'; ctx.fillRect(sx * 32 + 7, sy * 32 + 4, 19, 21); ctx.fillStyle = '#006d00'; ctx.fillRect(sx * 32 + 3, sy * 32 + 10, 25, 12); }
    if (tile === 'door') sprite(4, sx * 32, sy * 32); if (tile === 'open') sprite(6, sx * 32, sy * 32); if (raw === 86) sprite(65, sx * 32, sy * 32);
    ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.strokeRect(sx * 32, sy * 32, 32, 32);
  }
  for (const d of map.decorations) if (explored.has(d.y * map.width + d.x)) sprite(d.image, (d.x - viewX) * 32, (d.y - viewY) * 32, d.width * 32, d.height * 32);
  const screen = (p: { x: number; y: number }) => ({ x: (p.x - viewX) * 32, y: (p.y - viewY) * 32 });
  if (map.shop) { const p = screen(map.shop); sprite(30, p.x, p.y); }
  map.portals.forEach(portal => { if (!explored.has(portal.y * map.width + portal.x)) return; const p = screen(portal); sprite(portal.to > state!.level ? 7 : 9, p.x, p.y); ctx.strokeStyle = '#e9ce55'; ctx.strokeRect(p.x + 1, p.y + 1, 30, 30); });
  map.loot.forEach(item => { if (!explored.has(item.y * map.width + item.x)) return; const p = screen(item); sprite({ gold: 153, potion: 231, mana: 233, weapon: 111, armor: 117 }[item.kind], p.x, p.y); });
  map.enemies.filter(e => e.hp > 0 && explored.has(e.y * map.width + e.x)).forEach(e => { const p = screen(e); sprite(e.icon, p.x, p.y); ctx.fillStyle = '#381919'; ctx.fillRect(p.x + 3, p.y + 29, 26, 3); ctx.fillStyle = '#c53727'; ctx.fillRect(p.x + 3, p.y + 29, 26 * e.hp / e.maxHp, 3); });
  state.players.forEach(p => { const s = screen(p); ctx.strokeStyle = p.id === playerId ? '#ffec53' : '#63e6ff'; ctx.lineWidth = 2; ctx.strokeRect(s.x + 1, s.y + 1, 30, 30); ctx.lineWidth = 1; sprite(p.hp ? p.slot === 0 ? 421 : 403 : 52, s.x, s.y); });
  if (destination) { const p = screen(destination); ctx.strokeStyle = '#fff'; ctx.strokeRect(p.x + 4, p.y + 4, 24, 24); }
  mc.fillStyle = '#101719'; mc.fillRect(0, 0, mini.width, mini.height); const size = Math.min(mini.width / map.width, mini.height / map.height);
  map.explored.forEach(index => { const x = index % map.width, y = Math.floor(index / map.width); mc.fillStyle = ['floor', 'grass', 'open', 'door'].includes(map.tiles[index]) ? '#81987b' : '#38423b'; mc.fillRect(x * size, y * size, Math.ceil(size), Math.ceil(size)); });
  map.portals.forEach(p => { if (explored.has(p.y * map.width + p.x)) { mc.fillStyle = 'white'; mc.fillRect(p.x * size, p.y * size, size, size); } });
  state.players.forEach(p => { mc.fillStyle = p.id === playerId ? '#ffe953' : '#63e6ff'; mc.fillRect(p.x * size, p.y * size, Math.max(3, size), Math.max(3, size)); });
}

const held = new Set<string>();
const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1] };
const hotkeys: Record<string, Action['type']> = { ' ': 'attack', '1': 'bolt', '2': 'heal', '3': 'fireball', h: 'potion', q: 'mana', e: 'interact', r: 'revive' };
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || dialog.open || !state) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (directions[key]) { e.preventDefault(); destination = undefined; if (!held.has(key)) { const [dx, dy] = directions[key]; send({ type: 'move', dx, dy }); } held.add(key); }
  if (hotkeys[key]) { e.preventDefault(); if (!e.repeat) send({ type: hotkeys[key] } as Action); }
  if (key === 'i' || key === 'j' || key === '?') void openDialog(key === 'i' ? 'inventory' : key === 'j' ? 'journal' : 'help');
});
window.addEventListener('keyup', e => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => { held.clear(); destination = undefined; });
document.addEventListener('visibilitychange', () => { held.clear(); destination = undefined; });
canvas.onclick = e => {
  if (!state || state.status !== 'playing') return;
  const rect = canvas.getBoundingClientRect(); const x = Math.floor((e.clientX - rect.left) / rect.width * 23) + viewX, y = Math.floor((e.clientY - rect.top) / rect.height * 17) + viewY;
  if (state.map.explored.includes(y * state.map.width + x)) destination = { x, y }; canvas.focus();
};
function walk() {
  if (dialog.open || !state || state.status !== 'playing') return;
  const player = me(); if (!player || player.hp <= 0) return;
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
      if (!['floor', 'grass', 'door', 'open'].includes(map.tiles[y * map.width + x]) || state.players.some(other => other.id !== playerId && other.x === x && other.y === y)) continue;
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
  held.clear(); destination = undefined;
  const body = el('dialog-body'); body.replaceChildren(); el('dialog-title').textContent = kind === 'inventory' ? 'Character & inventory' : kind === 'journal' ? 'Recovered story journal' : kind === 'invite' ? 'Invite a companion' : 'How to adventure';
  if (!dialog.open) dialog.showModal();
  if (kind === 'inventory') {
    const p = me(); if (!p) { body.textContent = 'Join an expedition to view your equipment.'; return; }
    const title = document.createElement('h2'); title.textContent = p.name; body.append(title);
    const stats = document.createElement('p'); stats.textContent = `Level ${p.rank} · XP ${p.xp}/${p.rank * 45} · ${p.gold} gold`; body.append(stats);
    body.insertAdjacentHTML('beforeend', `<div class="equipment"><div><img src="${icon(111)}" alt="Sword">Sword +${p.weapon}</div><div><img src="${icon(117)}" alt="Armor">Armor +${p.armor}</div><div><img src="${icon(231)}" alt="Potion">${p.potions} healing</div><div><img src="${icon(233)}" alt="Mana potion">${p.manaPotions} mana</div></div><h3>Trade at the village well</h3><p>Stand within two tiles of the well. E restores health and mana for free.</p>`);
    for (const [item, label] of [['potion', 'Healing potion · 10 gold'], ['mana', 'Mana potion · 10 gold'], ['weapon', `Improve sword · ${35 * p.weapon} gold`], ['armor', `Improve armor · ${30 * (p.armor + 1)} gold`]]) { const button = document.createElement('button'); button.textContent = label; button.onclick = () => { send({ type: 'buy', item: item as 'potion' }); dialog.close(); }; body.append(button); }
  } else if (kind === 'journal') {
    body.textContent = 'Loading the original story…';
    try {
      const stories: { id: number; text: string }[] = await fetch(`${base}classic/stories.json`).then(r => r.json()); body.replaceChildren();
      const note = document.createElement('p'); note.textContent = 'Original text recovered from the executable. Includes the full story and spoilers. The co-op campaign adapts its progression.'; body.append(note);
      stories.forEach(s => { const section = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('p'); summary.textContent = `Story ${s.id}`; text.className = 'story-text'; text.textContent = s.text.replace(/^[^a-zA-Z]+/, '').replaceAll('#', '\n'); section.append(summary, text); body.append(section); });
    } catch { body.textContent = 'Unable to load the recovered story. Please try again.'; }
  } else if (kind !== 'invite') {
    body.innerHTML = `<h2>Two players. No waiting for turns.</h2><p>Both adventurers must join and choose Ready. Enemies act every 1.4 seconds. Opening a menu does not pause combat.</p><dl><dt>Move</dt><dd>WASD, arrows, Home / End / Page Up / Page Down for diagonals, or click an explored tile.</dd><dt>Fight</dt><dd>Bump an enemy or Space to strike. 1: Magic Arrow (3 MP). 2: Heal (6 MP). 3: Fireball (8 MP). Spells target the nearest visible enemy.</dd><dt>Survive</dt><dd>H: healing potion. Q: mana potion. R: revive an adjacent partner using one healing potion. Mana slowly regenerates.</dd><dt>Explore</dt><dd>E: use stairs. Both players must be alive and within three tiles. Walk over loot to collect it. Experience is shared.</dd><dt>Rest & trade</dt><dd>E beside the village well restores HP and MP. I opens inventory and shop purchases.</dd><dt>Connections</dt><dd>A disconnect pauses the world. Refreshing reconnects the same adventurer. Saves live on the game server; it needs persistent storage to retain them across deployments.</dd></dl><p>Recovered: original icons, bitmaps, seven map planes, and story resources. Reconstructed: combat balance, procedural dungeons, co-op route, and networking. This is not the complete original game running in an emulator.</p>`;
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-dialog]').forEach(b => { b.onclick = () => { void openDialog(b.dataset.dialog!); }; });
el('close-dialog').onclick = () => { dialog.close(); canvas.focus(); };
draw();
if (saved) { serverUrl = saved.server; connect({ type: 'resume', code: saved.code, token: saved.token }, true); }
