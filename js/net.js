// Online play without a server of our own: every player connects to a free public MQTT
// relay over a secure WebSocket and talks on topics named after a room code. This file is
// a minimal MQTT 3.1.1 client (connect, subscribe, publish at QoS 0, keep-alive) plus the
// list of relays. The game protocol on top of it lives in main.js.
const RELAYS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/'];
// A relay of your own can be set for testing or self-hosting: localStorage 'padpoker.relay' = 'wss://...'
export function relays() {
  try { const own = localStorage.getItem('padpoker.relay'); if (own) return [own]; } catch { /* private mode */ }
  return RELAYS;
}

const enc = new TextEncoder(), dec = new TextDecoder();
const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
function packet(type, body) {
  const len = [];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
  return new Uint8Array([type, ...len, ...body]);
}

export class Relay {
  constructor(url) { this.url = url; this.onMessage = () => {}; this.onClose = () => {}; this.buf = new Uint8Array(0); this.subs = new Set(); this.open = false; }

  connect(timeout = 7000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (why) => { if (!settled) { settled = true; try { this.ws?.close(); } catch { /* already closed */ } reject(new Error(why)); } };
      try { this.ws = new WebSocket(this.url, 'mqtt'); } catch (e) { return fail(e.message); }
      this.ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => fail('timeout'), timeout);
      this.ws.onopen = () => {
        const id = 'pp' + Math.random().toString(36).slice(2, 12);
        this.ws.send(packet(0x10, [...str('MQTT'), 4, 2, 0, 30, ...str(id)])); // CONNECT: clean session, 30 s keep-alive
      };
      this.ws.onmessage = (ev) => {
        this.feed(new Uint8Array(ev.data), () => {
          if (settled) return;
          settled = true; clearTimeout(timer); this.open = true;
          this.ping = setInterval(() => { try { this.ws.send(new Uint8Array([0xc0, 0])); } catch { /* closing */ } }, 20000);
          resolve(this);
        }, fail);
      };
      this.ws.onerror = () => fail('network');
      this.ws.onclose = () => {
        clearInterval(this.ping);
        const was = this.open; this.open = false;
        if (!settled) fail('closed'); else if (was) this.onClose();
      };
    });
  }

  // Packets may be split or joined across WebSocket frames, so collect bytes and peel off whole packets.
  feed(bytes, onAck, onRefused) {
    const all = new Uint8Array(this.buf.length + bytes.length);
    all.set(this.buf); all.set(bytes, this.buf.length);
    let at = 0;
    for (;;) {
      if (all.length - at < 2) break;
      let len = 0, mult = 1, i = at + 1, done = false;
      for (; i < all.length && i < at + 5; i++) { len += (all[i] & 127) * mult; mult *= 128; if (!(all[i] & 128)) { done = true; i++; break; } }
      if (!done || all.length - i < len) break;
      const type = all[at] >> 4, body = all.subarray(i, i + len);
      if (type === 2) { if (body[1] === 0) onAck?.(); else onRefused?.('refused'); } // CONNACK
      else if (type === 3) { // PUBLISH
        const tl = (body[0] << 8) | body[1];
        const qos = (all[at] >> 1) & 3;
        const topic = dec.decode(body.subarray(2, 2 + tl));
        this.onMessage(topic, dec.decode(body.subarray(2 + tl + (qos ? 2 : 0))));
      }
      at = i + len;
    }
    this.buf = all.slice(at);
  }

  subscribe(topic) {
    this.subs.add(topic);
    if (this.open) this.ws.send(packet(0x82, [0, (this.subs.size & 255) || 1, ...str(topic), 0]));
  }
  publish(topic, text) {
    if (!this.open) return false;
    try { this.ws.send(packet(0x30, [...str(topic), ...enc.encode(text)])); return true; } catch { return false; }
  }
  close() {
    this.onClose = () => {};
    clearInterval(this.ping);
    try { if (this.open) this.ws.send(new Uint8Array([0xe0, 0])); this.ws?.close(); } catch { /* already closed */ }
    this.open = false;
  }
}

// Try each relay in turn; the first that answers wins. Returns { relay, index }.
export async function connectAny(only = -1) {
  const list = relays();
  const order = only >= 0 ? [Math.min(only, list.length - 1)] : list.map((_, i) => i);
  let last = 'no relay';
  for (const i of order) {
    try { return { relay: await new Relay(list[i]).connect(), index: i }; } catch (e) { last = e.message; }
  }
  throw new Error(last);
}
