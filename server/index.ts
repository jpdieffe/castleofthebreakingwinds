import { createServer as httpServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { Action, GameState, Player } from '../shared/types.ts';
import { act, addPlayer, createGame, log, migrateMaps, reveal, snapshot, step, updateStatus } from './engine.ts';

interface Seat { id: string; hash: string }
export interface Room { game: GameState; seats: Seat[]; sockets: Map<string, WebSocket>; touched: number }
interface Options { port?: number; host?: string; dataDir?: string | false; origins?: string[] }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenMatches = (token: string, saved: string) => saved.length === 64 && timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(saved, 'hex'));
const actions = new Set(['move', 'attack', 'bolt', 'heal', 'fireball', 'potion', 'mana', 'interact', 'revive', 'ready', 'restart', 'buy', 'sell']);
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

export function createGameServer(options: Options = {}) {
  const rooms = new Map<string, Room>();
  const dataDir = options.dataDir === false ? false : resolve(options.dataDir ?? process.env.DATA_DIR ?? '.game-data');
  const publicDir = resolve('docs');
  const origins = options.origins ?? (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,https://jpdieffe.github.io').split(',');
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    for (const name of readdirSync(dataDir).filter(n => /^[A-Z0-9]{6}\.json$/.test(n))) {
      try {
        const saved = JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'));
        if (saved.game?.version !== 1 || !Array.isArray(saved.seats) || Date.now() - saved.touched > 86400000) continue;
        if(saved.game.mapVersion!==2 && saved.game.levels.length===14) { writeFileSync(resolve(dataDir, name+'.before-mobile'), JSON.stringify(saved)); migrateMaps(saved.game); }
        saved.game.players.forEach((p: Player) => { p.connected = false; });
        updateStatus(saved.game);
        rooms.set(saved.game.code, { ...saved, sockets: new Map() });
      } catch { console.warn(`Could not load save ${name}.`); }
    }
  }
  function save() {
    if (!dataDir) return;
    for (const [code, room] of rooms) {
      try {
        const path = resolve(dataDir, `${code}.json`);
        writeFileSync(`${path}.tmp`, JSON.stringify({ game: room.game, seats: room.seats, touched: room.touched }));
        renameSync(`${path}.tmp`, path);
      } catch (error) { console.error('Unable to save expedition:', error instanceof Error ? error.message : 'unknown error'); }
    }
  }
  const server = httpServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size, protocol: 1 })); return; }
    let path: string;
    try { path = resolve(publicDir, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname.replace(/^\/castleofthebreakingwinds\//, '/'))}`); }
    catch { res.writeHead(400); res.end(); return; }
    if (!path.startsWith(publicDir + sep) || !existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); res.end('Not found. Run npm run build to prepare the client.'); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(path));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    const own = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
    if (req.url !== '/ws' || (origin && !origins.includes(origin) && !own)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    if (wss.clients.size >= 220) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  function send(ws: WebSocket, body: unknown) { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256_000) ws.send(JSON.stringify(body)); }
  function broadcast(room: Room) { const body = { type: 'state', state: snapshot(room.game) }; room.sockets.forEach(ws => send(ws, body)); }
  wss.on('connection', ws => {
    let room: Room | undefined, playerId = '', count = 0, windowStart = Date.now(), alive = true;
    const handshake = setTimeout(() => { if (!room) ws.close(1008, 'Join a room first.'); }, 10000);
    const heartbeat = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 15000);
    ws.on('pong', () => { alive = true; });
    const fail = (message: string, fatal = false) => { send(ws, { type: 'error', message, fatal }); if (fatal) ws.close(1008, message.slice(0, 100)); };
    ws.on('message', data => {
      if (Date.now() - windowStart >= 1000) { count = 0; windowStart = Date.now(); }
      if (++count > 35) { fail('Too many commands. Please slow down.', true); return; }
      let message;
      try { message = JSON.parse(data.toString()); } catch { fail('Invalid message.'); return; }
      if (!message || typeof message !== 'object') { fail('Invalid message.'); return; }
      if (!room) {
        if (!['create', 'join', 'resume'].includes(message.type)) { fail('Join an expedition first.'); return; }
        const name = typeof message.name === 'string' ? message.name.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) : '';
        if (message.type !== 'resume' && !name) { fail('Enter your adventurer’s name.'); return; }
        let token = '';
        try {
          if (message.type === 'create') {
            if (rooms.size >= 100) throw new Error('The server is full. Please try again later.');
            let code: string;
            do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (rooms.has(code));
            room = { game: createGame(code, randomBytes(4).readUInt32LE()), seats: [], sockets: new Map(), touched: Date.now() };
            rooms.set(code, room);
          } else {
            const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
            if (!/^[A-Z0-9]{6}$/.test(code) || !rooms.has(code)) throw new Error('Expedition not found. Check the six-character code.');
            room = rooms.get(code)!;
          }
          if (message.type === 'resume') {
            if (typeof message.token !== 'string' || message.token.length > 100) throw new Error('This reconnect key is invalid.');
            const seat = room.seats.find(s => tokenMatches(message.token, s.hash));
            if (!seat) throw new Error('This reconnect key is invalid.');
            playerId = seat.id; token = message.token;
            const prior = room.sockets.get(playerId);
            if (prior && prior.readyState === WebSocket.OPEN) prior.close(4001, 'Resumed in another connection.');
            room.game.players.find(p => p.id === playerId)!.connected = true;
            log(room.game, 'Your partner has reconnected.');
          } else {
            playerId = randomBytes(8).toString('hex'); token = randomBytes(24).toString('hex');
            addPlayer(room.game, playerId, name);
            room.seats.push({ id: playerId, hash: hash(token) });
          }
          room.sockets.set(playerId, ws); room.touched = Date.now();
          clearTimeout(handshake); updateStatus(room.game); reveal(room.game);
          send(ws, { type: 'welcome', token, playerId, code: room.game.code }); broadcast(room); save();
        } catch (error) { room = undefined; fail(error instanceof Error ? error.message : 'Unable to join.'); }
        return;
      }
      if (room.sockets.get(playerId) !== ws) return;
      if (message.type === 'leave') {
        room.sockets.delete(playerId); room.seats = room.seats.filter(s => s.id !== playerId);
        room.game.players = room.game.players.filter(p => p.id !== playerId);
        if (!['won', 'defeated'].includes(room.game.status)) room.game.status = 'waiting';
        log(room.game, 'An adventurer left. The open place can be joined with the room code.');
        broadcast(room); save(); ws.close(1000, 'Left expedition.'); return;
      }
      if (message.type !== 'action' || !message.action || !actions.has(message.action.type)) { fail('Unknown action.'); return; }
      if (message.action.type === 'buy' && !['potion', 'mana', 'weapon', 'armor'].includes(message.action.item)) { fail('Unknown item.'); return; }
      if (message.action.type === 'sell' && !['potion', 'mana'].includes(message.action.item)) { fail('Unknown item.'); return; }
      const player = room.game.players.find(p => p.id === playerId);
      if (!player) return;
      room.touched = Date.now();
      const error = act(room.game, player, message.action as Action);
      if (error) fail(error);
      broadcast(room);
    });
    ws.on('error', () => { /* close handles transport cleanup */ });
    ws.on('close', () => {
      clearTimeout(handshake); clearInterval(heartbeat);
      if (!room || room.sockets.get(playerId) !== ws) return;
      room.sockets.delete(playerId);
      const player = room.game.players.find(p => p.id === playerId);
      if (player) player.connected = false;
      updateStatus(room.game); log(room.game, 'Connection lost. The world is paused while your partner returns.');
      broadcast(room); save();
    });
  });
  let counter = 0;
  const ticker = setInterval(() => {
    counter++;
    for (const [code, room] of rooms) {
      step(room.game, 100);
      if (counter % 2 === 0) broadcast(room);
      if (!room.sockets.size && Date.now() - room.touched > 86400000) rooms.delete(code);
    }
  }, 100);
  const saver = setInterval(save, 5000);
  server.listen(options.port ?? Number(process.env.PORT ?? 8787), options.host ?? '0.0.0.0');
  return { server, rooms, broadcast, save, async close() {
    clearInterval(ticker); clearInterval(saver); save();
    wss.clients.forEach(ws => ws.terminate());
    await new Promise<void>(done => wss.close(() => done()));
    await new Promise<void>(done => server.close(() => done()));
  } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createGameServer();
  app.server.on('listening', () => console.log(`Castle of the Winds server listening on port ${process.env.PORT ?? 8787}`));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
}
