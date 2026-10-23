// Zero-dependency static server + authoritative WebSocket multiplayer & SQLite economy
// Run: node serve.mjs [port]  (default 8000)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { World } from './src/sim.js';
import { LOUNGE } from './src/layout.js';
import { spawnBots } from './src/bots.js';
import { openDb } from './server/db.js';
import { createEconomy, ECONOMY_COMMANDS } from './server/economy.js';
import { createMatchmaker, MATCH_COMMANDS } from './server/matchmaker.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 8000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg'
};

// Authoritative SQLite Economy, Matchmaker & Headless World Simulation
const clients = new Map();
const db = openDb();
let matchmaker = null;
const economy = createEconomy(db, {
  onContestLocked(contest) {
    if (!matchmaker || !Array.isArray(contest.players) || contest.players.length < 2) return;
    const c1 = matchmaker.clientsByUser.get(contest.players[0]);
    const c2 = matchmaker.clientsByUser.get(contest.players[1]);
    if (c1 && c2) {
      matchmaker.startSession({
        game: contest.game,
        p1: c1,
        p2: c2,
        contestId: contest.id
      });
    }
  }
});
matchmaker = createMatchmaker(economy, {
  getClientById: id => clients.get(id)
});
const serverWorld = new World(LOUNGE);
spawnBots(serverWorld, 4, 1989);
setInterval(() => serverWorld.step(1 / 30), 1000 / 30);

serverWorld.on(event => {
  for (const client of clients.values()) {
    client.send({ type: 'event', event });
  }
});

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, d) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + p);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }).end(d);
  });
});

// Native RFC 6455 WebSocket Upgrade Handler
server.on('upgrade', (req, socket) => {
  const reqUrl = new URL(req.url, 'http://x');
  if (reqUrl.pathname !== '/ws' || (req.headers['upgrade'] || '').toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  const clientId = 'peer_' + Math.random().toString(36).slice(2, 8);
  let personId = null;

  const client = {
    id: clientId,
    userId: null,
    clawCredits: 0,
    socket,
    send(data) {
      if (socket.destroyed) return;
      const payload = Buffer.from(JSON.stringify(data));
      let header;
      if (payload.length <= 125) {
        header = Buffer.from([0x81, payload.length]);
      } else if (payload.length <= 65535) {
        header = Buffer.from([0x81, 126, (payload.length >> 8) & 0xff, payload.length & 0xff]);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      try {
        socket.write(Buffer.concat([header, payload]));
      } catch (e) {}
    }
  };

  clients.set(clientId, client);

  // Send initial room snapshot
  client.send({
    type: 'init',
    clientId,
    layout: serverWorld.layout,
    phase: serverWorld.phase,
    people: [...serverWorld.people.values()].map(p => ({
      id: p.id,
      name: p.name,
      loadout: p.loadout,
      x: p.x,
      y: p.y,
      state: p.state,
      use: p.use,
      vis: p.vis
    }))
  });

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > 512 * 1024) {
      socket.destroy();
      return;
    }
    while (buf.length >= 2) {
      const byte1 = buf[0], byte2 = buf[1];
      const opcode = byte1 & 0x0f;
      const masked = (byte2 & 0x80) === 0x80;
      let len = byte2 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) break;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) break;
        const bigLen = buf.readBigUInt64BE(2);
        if (bigLen > 256n * 1024n) {
          socket.destroy();
          return;
        }
        len = Number(bigLen);
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) break;

      let mask = null;
      if (masked) {
        mask = buf.subarray(offset, offset + 4);
        offset += 4;
      }
      const payload = buf.subarray(offset, offset + len);
      buf = buf.subarray(offset + len);

      if (opcode === 0x8) {
        socket.destroy();
        break;
      } else if (opcode === 0x9) {
        socket.write(Buffer.from([0x8a, 0x00]));
        continue;
      } else if (opcode === 0x1) {
        if (masked && mask) {
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        }
        try {
          const cmd = JSON.parse(payload.toString('utf8'));
          if (cmd && ECONOMY_COMMANDS.has(cmd.t)) {
            const reply = economy.handle(client, cmd);
            if (cmd.t === 'auth' && reply.ok && reply.user) {
              client.name = reply.user.name;
              matchmaker.registerClient(client);
            }
            if (cmd.rid != null) {
              client.send({ type: 'reply', rid: cmd.rid, ...reply });
            } else {
              client.send({ type: 'reply', ...reply });
            }
          } else if (cmd && MATCH_COMMANDS.has(cmd.t)) {
            const reply = matchmaker.handle(client, cmd);
            if (cmd.rid != null) {
              client.send({ type: 'reply', rid: cmd.rid, ...reply });
            } else {
              client.send({ type: 'reply', ...reply });
            }
          } else if (cmd && cmd.t === 'join') {
            personId = clientId;
            serverWorld.command({ t: 'join', person: { ...cmd.person, id: personId } });
          } else if (cmd && cmd.t) {
            // Authoritative client identity: never allow client payload to spoof another person's id
            const targetPropId = cmd.propId ?? ((cmd.t === 'moveProp' || cmd.t === 'removeProp') ? cmd.id : undefined);
            serverWorld.command({ ...cmd, id: personId || clientId, propId: targetPropId });
          }
        } catch (e) {}
      }
    }
  });

  const cleanup = () => {
    matchmaker.unregisterClient(client);
    clients.delete(clientId);
    if (personId) {
      serverWorld.command({ t: 'leave', id: personId });
    }
  };

  socket.on('error', cleanup);
  socket.on('close', cleanup);
});

server.listen(port, () => console.log(`Neon Arcade Lounge -> http://localhost:${port} (WebSocket multiplayer + SQLite economy active)`));
