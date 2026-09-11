import { test } from 'node:test';
import assert from 'node:assert/strict';

// Boş string olarak ayarlanır (silinmez): server.js içindeki dotenv
// zaten tanımlı olan bir env değişkenini ezmez, ama silinmiş/tanımsız bir
// değişkeni .env dosyasından (varsa gerçek bir API key) doldurur.
process.env.MISTRAL_API_KEY = '';
process.env.API_AUTH_TOKEN = '';
process.env.OCR_SKIP_LISTEN = '1';
const { default: app } = await import('../server.js');

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/health çalışır durumu ve mistral yapılandırma bilgisini döner', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.mistralConfigured, false);
    assert.equal(body.authRequired, false);
  });
});

test('POST /api/ocr girdi verilmezse 400 + NO_INPUT döner', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'NO_INPUT');
  });
});

test('POST /api/ocr multipart metin dosyasını passthrough ile işler', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('file', new Blob(['merhaba dünya'], { type: 'text/plain' }), 'a.txt');
    form.append('profile', 'none');
    form.append('responseMode', 'full');
    const res = await fetch(`${base}/api/ocr`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.provider, 'passthrough');
    assert.equal(body.result.text, 'merhaba dünya');
  });
});

test('POST /api/ocr varsayılan olarak JDE structured JSON döner', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('file', new Blob(['merhaba'], { type: 'text/plain' }), 'a.txt');
    const res = await fetch(`${base}/api/ocr`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, undefined);
    assert.equal(body.CurrencyCode, 'TRY');
    assert.ok(Array.isArray(body.InvoiceLines));
    assert.equal(body.InvoiceNumber, '');
  });
});

test('API_AUTH_TOKEN tanımlıyken token yoksa 401 UNAUTHORIZED', async () => {
  process.env.API_AUTH_TOKEN = 'test-secret-token';
  try {
    await withServer(async (base) => {
      const health = await (await fetch(`${base}/api/health`)).json();
      assert.equal(health.authRequired, true);

      const res = await fetch(`${base}/api/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error.code, 'UNAUTHORIZED');
    });
  } finally {
    process.env.API_AUTH_TOKEN = '';
  }
});

test('API_AUTH_TOKEN tanımlıyken Bearer token ile istek geçer', async () => {
  process.env.API_AUTH_TOKEN = 'test-secret-token';
  try {
    await withServer(async (base) => {
      const form = new FormData();
      form.append('file', new Blob(['merhaba'], { type: 'text/plain' }), 'a.txt');
      form.append('profile', 'none');
      form.append('responseMode', 'full');
      const res = await fetch(`${base}/api/ocr`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret-token' },
        body: form,
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.result.text, 'merhaba');
    });
  } finally {
    process.env.API_AUTH_TOKEN = '';
  }
});

test('X-API-Key başlığı da kabul edilir', async () => {
  process.env.API_AUTH_TOKEN = 'test-secret-token';
  try {
    await withServer(async (base) => {
      const form = new FormData();
      form.append('file', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
      form.append('profile', 'none');
      form.append('responseMode', 'full');
      const res = await fetch(`${base}/api/ocr`, {
        method: 'POST',
        headers: { 'X-API-Key': 'test-secret-token' },
        body: form,
      });
      assert.equal(res.status, 200);
    });
  } finally {
    process.env.API_AUTH_TOKEN = '';
  }
});

test('bilinmeyen rota için 404 + NOT_FOUND JSON döner', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/olmayan-rota`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
