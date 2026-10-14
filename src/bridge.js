// Connects MCP server instances to the plugin. One instance owns the port:
// it accepts the plugin's WebSocket, serves assets and exposes /rpc so the
// other instances (other sessions) can reach the plugin through it. When the
// owner exits, the next instance that needs the plugin takes the port over.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { assetPath, pairingCode, saveSnapshot, secret } from './store.js';

const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf',
};
const SECRET_HEADER = 'x-figma-local-secret';
const MAX_BODY = 64 * 1024 * 1024;
const PAIRING_REJECTED = 4401;
const PAIRING_LOCKED = 4429;
const MAX_FAILURES = 20;
const EXTRA_ORIGINS = (process.env.FIGMA_LOCAL_MCP_ALLOW_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

export class PluginUnavailable extends Error {}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Requests must name this machine, so a web page reaching the port through a
// rebound DNS name is refused.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function localHost(req) {
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(host);
}

function requestUrl(req, base) {
  try {
    return new URL(req.url, base);
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export class Bridge {
  constructor({ port = 3947, host = '127.0.0.1', log = () => {} } = {}) {
    this.port = port;
    this.host = host;
    this.log = log;
    this.secret = secret();
    this.pairing = pairingCode();
    this.failures = [];
    this.owner = false;
    this.server = null;
    this.sockets = [];
    this.pending = new Map();
    this.nextId = 1;
    this.lastInfo = null;
    this.lastRefusedOrigin = null;
    this.waiters = [];
  }

  get baseUrl() {
    return `http://localhost:${this.port}`;
  }

  assetUrl(name) {
    return `${this.baseUrl}/assets/${name}`;
  }

  get pluginConnected() {
    return this.owner ? this.sockets.length > 0 : null;
  }

  async start() {
    await this.tryOwn();
    this.timer = setInterval(() => {
      if (!this.owner) this.tryOwn().catch(() => {});
    }, 10000);
    this.timer.unref();
  }

  close() {
    clearInterval(this.timer);
    for (const ws of this.sockets) ws.terminate();
    if (this.server) this.server.close();
  }

  tryOwn() {
    if (this.owner) return Promise.resolve(true);
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res).catch((e) => {
          this.log(`request failed: ${e.message}`);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
      });
      const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
      server.on('upgrade', (req, socket, head) => {
        // Plugin iframes have an opaque origin ("null"); a web page would
        // send its own origin, so it is refused.
        const origin = req.headers.origin;
        const url = requestUrl(req, this.baseUrl);
        if (!url || !localHost(req)) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }
        if (origin !== undefined && origin !== 'null' &&
            !EXTRA_ORIGINS.includes(origin)) {
          this.lastRefusedOrigin = origin;
          this.log(`refused a connection from origin ${origin}`);
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        const code = url.searchParams.get('code');
        wss.handleUpgrade(req, socket, head, (ws) => this.admit(ws, code));
      });
      server.once('error', () => resolve(false));
      server.listen(this.port, this.host, () => {
        this.server = server;
        this.owner = true;
        this.ownedAt = Date.now();
        this.log(`listening on ${this.host}:${this.port}`);
        resolve(true);
      });
    });
  }

  // A wrong code gets a close code the plugin UI recognises, so it can ask
  // for the right one; repeated failures lock pairing for a minute.
  admit(ws, code) {
    // A bad or oversized frame errors the socket; unhandled, it would end
    // the process every session shares.
    ws.on('error', (e) => {
      this.log(`plugin connection error: ${e.message}`);
      ws.terminate();
    });
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < 60000);
    if (this.failures.length >= MAX_FAILURES) {
      ws.close(PAIRING_LOCKED, 'Too many attempts');
      return;
    }
    if (!sameSecret(normalizeCode(code), normalizeCode(this.pairing))) {
      this.failures.push(now);
      this.pairingRejected = now;
      this.log('refused a plugin connection with a wrong pairing code');
      ws.close(PAIRING_REJECTED, 'Pairing code required');
      return;
    }
    this.attach(ws);
  }

  attach(ws) {
    this.sockets.push(ws);
    this.log('plugin connected');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const beat = setInterval(() => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    }, 15000);
    ws.on('message', (raw) => this.onMessage(ws, raw));
    ws.on('close', () => {
      clearInterval(beat);
      this.sockets = this.sockets.filter((s) => s !== ws);
      for (const [id, p] of this.pending) {
        if (p.ws === ws) {
          p.reject(new PluginUnavailable('The Figma plugin disconnected'));
          this.pending.delete(id);
        }
      }
      this.log('plugin disconnected');
    });
    for (const wake of this.waiters.splice(0)) wake();
  }

  onMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'response') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    } else if (msg.type === 'info') {
      this.lastInfo = msg.info;
    } else if (msg.type === 'snapshot') {
      try {
        const name = saveSnapshot(msg.data);
        ws.send(JSON.stringify({ type: 'saved', name }));
      } catch (e) {
        this.log(`snapshot rejected: ${e.message}`);
      }
    }
  }

  async handle(req, res) {
    const url = requestUrl(req, this.baseUrl);
    if (!url || !localHost(req)) {
      res.writeHead(400).end();
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const file = assetPath(url.pathname.slice('/assets/'.length));
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      const ext = file.split('.').pop();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, plugin: this.sockets.length > 0 }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/rpc') {
      if (!sameSecret(req.headers[SECRET_HEADER], this.secret)) {
        res.writeHead(403).end();
        return;
      }
      // Headers go out at once and a space every 30 s, so a call that runs
      // for minutes is not cut off by the client's header or body timeout;
      // JSON allows the leading spaces.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.flushHeaders();
      const keepAlive = setInterval(() => res.write(' '), 30000);
      let reply;
      try {
        const { method, params, timeout } = JSON.parse(await readBody(req));
        reply = { result: await this.callPlugin(method, params, timeout) };
      } catch (e) {
        reply = {
          error: e.message,
          unavailable: e instanceof PluginUnavailable,
        };
      } finally {
        clearInterval(keepAlive);
      }
      res.end(JSON.stringify(reply));
      return;
    }
    res.writeHead(404).end();
  }

  waitForPlugin(ms) {
    if (this.sockets.length) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  async callPlugin(method, params = {}, timeout = 60000, wait = 0) {
    if (!this.sockets.length && !(wait && await this.waitForPlugin(wait))) {
      throw new PluginUnavailable(
        'The Figma plugin is not connected. In Figma Desktop run Plugins > ' +
        'Development > figmcp and keep its window open.');
    }
    const ws = this.sockets[this.sockets.length - 1];
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The Figma plugin did not answer "${method}" in time`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, ws });
      ws.send(JSON.stringify({ type: 'request', id, method, params }));
    });
  }

  async proxy(method, params, timeout) {
    const res = await fetch(`http://127.0.0.1:${this.port}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: this.secret },
      body: JSON.stringify({ method, params, timeout }),
      signal: AbortSignal.timeout(timeout + 5000),
    });
    const notOurs = new Error(`Port ${this.port} is used by another program`);
    if (res.status === 403 || !res.ok || !String(res.headers.get('content-type')).includes('application/json')) throw notOurs;
    let reply;
    try {
      reply = JSON.parse(await res.text());
    } catch {
      throw notOurs;
    }
    if (reply.error) {
      throw reply.unavailable
        ? new PluginUnavailable(reply.error)
        : new Error(reply.error);
    }
    return reply.result;
  }

  // The plugin retries every few seconds, so a new owner waits for it.
  graceWait() {
    return Date.now() - this.ownedAt < 6000 ? 4500 : 0;
  }

  /** Sends a request to the plugin, through the owning instance if needed. */
  async call(method, params = {}, timeout = 60000) {
    if (this.owner) {
      return this.callPlugin(method, params, timeout, this.graceWait());
    }
    try {
      return await this.proxy(method, params, timeout);
    } catch (e) {
      const refused = e.cause && e.cause.code === 'ECONNREFUSED';
      if (!refused) throw e;
    }
    if (await this.tryOwn()) {
      return this.callPlugin(method, params, timeout, this.graceWait());
    }
    return this.proxy(method, params, timeout);
  }
}
