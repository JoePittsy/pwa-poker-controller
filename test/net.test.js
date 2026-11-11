import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newKeys, sharedKey, seal, unseal, exportKey, importKey } from '../js/net.js';

// Online play is encrypted between the host and each guest. These check the parts that matter:
// both sides arrive at the same key, nobody else does, and a changed message is refused.
test('host and guest derive the same key and can read each other', async () => {
  const host = await newKeys(), guest = await newKeys();
  const hk = await sharedKey(host.priv, guest.pub), gk = await sharedKey(guest.priv, host.pub);
  const msg = { t: 's', cards: [1, 2], text: 'héllo' };
  assert.deepEqual(await unseal(gk, await seal(hk, msg)), msg);
  assert.deepEqual(await unseal(hk, await seal(gk, msg)), msg);
});

test('someone else with their own keys cannot read a message', async () => {
  const host = await newKeys(), guest = await newKeys(), spy = await newKeys();
  const hk = await sharedKey(host.priv, guest.pub), sk = await sharedKey(spy.priv, host.pub);
  await assert.rejects(unseal(sk, await seal(hk, { secret: 1 })));
});

test('a message altered on the way is refused', async () => {
  const a = await newKeys(), b = await newKeys();
  const key = await sharedKey(a.priv, b.pub);
  const m = await seal(key, { type: 'fold' });
  const bad = { ...m, c: (m.c[0] === 'A' ? 'B' : 'A') + m.c.slice(1) };
  await assert.rejects(unseal(key, bad));
});

test('two messages with the same content do not look the same', async () => {
  const a = await newKeys(), b = await newKeys();
  const key = await sharedKey(a.priv, b.pub);
  const [x, y] = [await seal(key, { n: 1 }), await seal(key, { n: 1 })];
  assert.notEqual(x.c, y.c);
});

test('a stored key works after being saved and loaded', async () => {
  const a = await newKeys(), b = await newKeys();
  const key = await sharedKey(a.priv, b.pub);
  const again = await importKey(await exportKey(key));
  assert.deepEqual(await unseal(again, await seal(key, { ok: true })), { ok: true });
});
