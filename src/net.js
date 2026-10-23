// WebSocket client synchronization with seamless offline fallback
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
          this.onEvent(msg);
        } catch (e) {
          /* ignore malformed message */
        }
      };
      this.ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        if (was) this.onStatus({ online: false, reason: 'Disconnected' });
      };
      this.ws.onerror = () => {
        this.connected = false;
        this.onStatus({ online: false, reason: 'Connection failed' });
      };
    } catch (e) {
      this.connected = false;
      this.onStatus({ online: false, reason: e.message });
    }
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

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
      this.connected = false;
    }
  }
}
