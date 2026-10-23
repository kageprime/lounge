// WebSocket client synchronization with seamless offline fallback + request/reply RPC
// Zero dependencies, standard browser WebSocket API.

export class NetClient {
  constructor(options = {}) {
    const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss://' : 'ws://';
    const host = (typeof location !== 'undefined' && location.host) ? location.host : 'localhost:8000';
    this.url = options.url || `${proto}${host}/ws`;
    this.onEvent = options.onEvent || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.ws = null;
    this.connected = false;
    this._seq = 0;
    this._pending = new Map();
  }

  connect() {
    if (typeof WebSocket === 'undefined') {
      this.onStatus({ online: false, reason: 'WebSocket not supported' });
      return;
    }
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.connected = true;
        this.onStatus({ online: true });
      };
      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg && msg.type === 'reply' && msg.rid != null && this._pending.has(msg.rid)) {
            const p = this._pending.get(msg.rid);
            this._pending.delete(msg.rid);
            clearTimeout(p.timer);
            p.resolve(msg);
            return;
          }
          this.onEvent(msg);
        } catch (e) {
          /* ignore malformed message */
        }
      };
      this.ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        this._rejectAll('Disconnected');
        if (was) this.onStatus({ online: false, reason: 'Disconnected' });
      };
      this.ws.onerror = () => {
        this.connected = false;
        this._rejectAll('Connection failed');
        this.onStatus({ online: false, reason: 'Connection failed' });
      };
    } catch (e) {
      this.connected = false;
      this.onStatus({ online: false, reason: e.message });
    }
  }

  _rejectAll(reason) {
    for (const p of this._pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this._pending.clear();
  }

  send(cmd) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(cmd));
      return true;
    } catch (e) {
      return false;
    }
  }

  request(msg, timeoutMs = 6000) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('offline'));
    }
    const rid = ++this._seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pending.has(rid)) {
          this._pending.delete(rid);
          reject(new Error('timeout'));
        }
      }, timeoutMs);
      this._pending.set(rid, { resolve, reject, timer });
      if (!this.send({ ...msg, rid })) {
        this._pending.delete(rid);
        clearTimeout(timer);
        reject(new Error('send_failed'));
      }
    });
  }

  close() {
    this._rejectAll('Closed');
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
      this.connected = false;
    }
  }
}
