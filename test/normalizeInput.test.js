import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput } from '../ocr/normalizeInput.js';

test('buffer girdisini olduğu gibi geçirir', async () => {
  const buf = Buffer.from('merhaba');
  const result = await normalizeInput({ buffer: buf, fileName: 'a.txt', mimeType: 'text/plain' });
  assert.equal(result.buffer, buf);
  assert.equal(result.fileName, 'a.txt');
});

test('base64 girdisini çözer', async () => {
  const original = 'merhaba dünya';
  const b64 = Buffer.from(original, 'utf-8').toString('base64');
  const result = await normalizeInput({ base64: b64, fileName: 'a.txt' });
  assert.equal(result.buffer.toString('utf-8'), original);
});

test('data-URI önekli base64 girdisini de çözer', async () => {
  const original = 'merhaba';
  const b64 = Buffer.from(original, 'utf-8').toString('base64');
  const result = await normalizeInput({ base64: `data:text/plain;base64,${b64}` });
  assert.equal(result.buffer.toString('utf-8'), original);
});

test('http/https dışındaki URL şemalarını reddeder', async () => {
  await assert.rejects(() => normalizeInput({ url: 'ftp://example.com/file.pdf' }), /şema/i);
});

test('localhost/127.0.0.1 gibi özel adreslere SSRF isteğini engeller', async () => {
  await assert.rejects(
    () => normalizeInput({ url: 'http://127.0.0.1:9999/secret' }),
    (err) => err.code === 'SSRF_BLOCKED',
  );
});

test('hiçbir girdi verilmezse anlamlı hata fırlatır', async () => {
  await assert.rejects(() => normalizeInput({}), /Girdi bulunamadı/);
});
