import Peer, { type DataConnection } from 'peerjs';
import { act, addPlayer, createGame, reveal, snapshot, step, updateStatus } from '../shared/engine';
import type { Action, GameState, ServerMessage } from '../shared/types';

const SAVE = 'castle-peer-host-v1';
const prefix = 'castle-winds-v1-';
type HostSave = { game: GameState; token: string; guestToken?: string };
const uid = () => crypto.randomUUID();
export function validAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (a.type === 'move') return Number.isInteger(a.dx) && Number.isInteger(a.dy) && Math.abs(Number(a.dx)) <= 1 && Math.abs(Number(a.dy)) <= 1;
  if (a.type === 'buy') return ['potion', 'mana', 'weapon', 'armor'].includes(String(a.item));
  return ['attack', 'bolt', 'heal', 'fireball', 'potion', 'mana', 'interact', 'revive', 'ready', 'restart'].includes(String(a.type));
}

/** WebSocket-shaped adapter: signaling only uses PeerServer; all game data uses WebRTC. */
export class PeerSession {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  private peer?: Peer;
  private link?: DataConnection;
  private host?: HostSave;
  private clock?: Worker;
  private lastSeen = Date.now();
  private timer = 0;
  private pulses = 0;
  private ended = false;
  private connections = new Set<DataConnection>();
  private checkpoint = () => { if (this.host) { try { sessionStorage.setItem(SAVE, JSON.stringify(this.host)); } catch { /* Session still works when storage is unavailable. */ } } };

  constructor() { setTimeout(() => { if (!this.ended) { this.readyState = 1; this.onopen?.(); } }, 0); }
  private emit(message: ServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
  private fail(message: string, fatal = false) { this.emit({ type: 'error', message, fatal }); this.close(); }
  send(raw: string) {
    if (this.ended) return;
    const message = JSON.parse(raw);
    if (['solo', 'create', 'resume', 'join'].includes(message.type)) { this.start(message); return; }
    if (message.type === 'leave') {
      if (this.host) { this.link?.send({ type: 'error', message: 'The host ended the expedition.', fatal: true }); sessionStorage.removeItem(SAVE); this.host = undefined; }
      else this.link?.send({ type: 'leave' });
      return;
    }
    if (message.type === 'action' && validAction(message.action)) {
      if (this.host) { act(this.host.game, this.host.game.players[0], message.action); this.broadcast(); }
      else if (this.link?.open) this.link.send(message);
    }
  }
  private start(message: { type: string; name?: string; code?: string; token?: string }) {
    let stored: HostSave | undefined;
    try { stored = JSON.parse(sessionStorage.getItem(SAVE) || 'null') || undefined; } catch { /* Ignore damaged saves. */ }
    const restoring = message.type === 'resume' && stored?.game?.code === message.code && stored?.token === message.token;
    const hosting = message.type === 'solo' || message.type === 'create' || restoring;
    const code = hosting ? restoring ? stored!.game.code : Array.from(crypto.getRandomValues(new Uint8Array(6)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 31]).join('') : message.code!;
    if (hosting) {
      this.host = restoring ? stored : { game: createGame(code, crypto.getRandomValues(new Uint32Array(1))[0], message.type === 'solo' ? 'solo' : 'coop'), token: uid() };
      const game = this.host!.game;
      if (!restoring) addPlayer(game, uid(), message.name!.trim().slice(0, 20));
      game.players.forEach((p, i) => { p.connected = i === 0; }); updateStatus(game);
      if (game.mode === 'solo') {
        game.players[0].ready = true; updateStatus(game); reveal(game);
        this.startHost();
        this.timer = window.setInterval(this.checkpoint, 2000);
        return;
      }
    }
    this.peer = new Peer(hosting ? prefix + code : uid(), { debug: 0 });
    this.peer.on('error', error => {
      if (error.type === 'peer-unavailable') this.fail('Expedition not found. Check the code and that the host has the game open.', message.type !== 'resume');
      else if (error.type === 'unavailable-id') this.fail('This expedition is already open in another host tab. Close the duplicate tab, or leave and host a new expedition.', true);
      else if (!this.link?.open && !this.host) this.fail('Could not connect. Check your internet connection and try again.');
      else if (error.type === 'network' || error.type === 'server-error' || error.type === 'socket-error') {
        if (!this.timer) this.fail('Matchmaking is unavailable. Please try again shortly.');
      }
    });
    this.peer.on('disconnected', () => { if (!this.ended) setTimeout(() => { if (this.peer?.disconnected && !this.peer.destroyed) this.peer.reconnect(); }, 1500); });
    this.peer.on('connection', conn => {
      if (!hosting || this.connections.size >= 8) { conn.close(); return; }
      this.accept(conn);
    });
    this.peer.on('open', () => {
      // PeerServer reconnection also emits open; the existing RTC game keeps running.
      if (this.timer || this.ended) return;
      if (hosting) {
        this.startHost();
      } else {
        // BinaryPack chunks maps above PeerJS's 16 KB message limit; JSON serialization does not.
        const conn = this.peer!.connect(prefix + code, { reliable: true, serialization: 'binary' }); this.link = conn;
        conn.on('open', () => conn.send({ type: 'hello', name: message.name, token: message.token }));
        conn.on('data', data => {
          this.lastSeen = Date.now();
          const response = data as ServerMessage;
          if (response?.type === 'state' || response?.type === 'welcome' || response?.type === 'error') this.emit(response);
        });
        conn.on('close', () => this.close()); conn.on('error', () => this.close());
      }
      this.lastSeen = Date.now();
      this.timer = window.setInterval(() => {
        if (this.host) { this.checkpoint(); if (this.link && Date.now() - this.lastSeen > 10000) { const stale = this.link; this.disconnected(stale); stale.close(); } }
        else if (Date.now() - this.lastSeen > 12000) this.close();
        else if (this.link?.open) this.link.send({ type: 'ping' });
      }, 2000);
    });
  }
  private startHost() {
    const h = this.host!;
    this.emit({ type: 'welcome', code: h.game.code, token: h.token, playerId: h.game.players[0].id });
    this.clock = new Worker(new URL('./clock.worker.ts', import.meta.url), { type: 'module' });
    this.clock.onmessage = () => { if (this.host) { step(this.host.game, 100); if (++this.pulses % 2 === 0) this.broadcast(); } };
    window.addEventListener('pagehide', this.checkpoint);
    this.checkpoint(); this.broadcast();
  }
  private accept(conn: DataConnection) {
    this.connections.add(conn);
    let authenticated = false, count = 0, since = Date.now();
    const timeout = window.setTimeout(() => { if (!authenticated) conn.close(); }, 8000);
    const reject = (message: string) => { conn.send({ type: 'error', message, fatal: true }); setTimeout(() => conn.close(), 100); };
    conn.on('data', data => {
      if (!this.host || !data || typeof data !== 'object') return;
      if (Date.now() - since >= 1000) { since = Date.now(); count = 0; }
      if (++count > 40 || JSON.stringify(data).length > 2048) { conn.close(); return; }
      const msg = data as { type: string; name?: string; token?: string; action?: unknown };
      const h = this.host, game = h.game;
      if (!authenticated) {
        if (msg.type !== 'hello') { reject('Join the expedition before sending actions.'); return; }
        if ((this.link?.open && msg.token !== h.guestToken) || (h.guestToken && msg.token !== h.guestToken)) { reject('This expedition already has two players.'); return; }
        if (this.link?.open) {
          const previous = this.link; this.link = undefined;
          previous.send({ type: 'error', message: 'This adventurer was resumed in another tab.', fatal: true });
          setTimeout(() => previous.close(), 100);
        }
        if (!h.guestToken) {
          if (typeof msg.name !== 'string' || !msg.name.trim() || msg.name.length > 20) { reject('Enter a name of up to 20 characters.'); return; }
          h.guestToken = uid(); addPlayer(game, uid(), msg.name.trim());
        }
        authenticated = true; clearTimeout(timeout); this.link = conn; this.lastSeen = Date.now();
        const guest = game.players[1]; guest.connected = true; updateStatus(game);
        conn.send({ type: 'welcome', code: game.code, token: h.guestToken, playerId: guest.id });
        this.checkpoint(); this.broadcast(); return;
      }
      if (this.link !== conn) return;
      this.lastSeen = Date.now();
      if (msg.type === 'action' && validAction(msg.action)) { act(game, game.players[1], msg.action); this.broadcast(); }
      if (msg.type === 'leave') {
        game.players.splice(1); h.guestToken = undefined; this.link = undefined;
        if (game.status !== 'won' && game.status !== 'defeated') updateStatus(game);
        this.checkpoint(); this.broadcast(); conn.close();
      }
    });
    const close = () => { clearTimeout(timeout); this.connections.delete(conn); this.disconnected(conn); };
    conn.on('close', close); conn.on('error', close);
  }
  private disconnected(conn: DataConnection) {
    if (this.link !== conn || !this.host) return;
    this.link = undefined; if (this.host.game.players[1]) this.host.game.players[1].connected = false;
    updateStatus(this.host.game); this.checkpoint(); this.broadcast();
  }
  private broadcast() {
    if (!this.host) return;
    const message: ServerMessage = { type: 'state', state: snapshot(this.host.game) };
    this.emit(message);
    if (this.link?.open && this.link.dataChannel.bufferedAmount < 262144) this.link.send(message);
  }
  close() {
    if (this.ended) return;
    this.ended = true; this.readyState = 3; this.checkpoint(); clearInterval(this.timer);
    window.removeEventListener('pagehide', this.checkpoint);
    this.clock?.terminate(); this.peer?.destroy(); this.onclose?.({ code: 1000 });
  }
}
