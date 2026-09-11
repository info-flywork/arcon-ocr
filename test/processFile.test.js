import { test } from 'node:test';
import assert from 'node:assert/strict';

// Bu dosyayı process.env.OCR_MAX_FILE_SIZE_MB ile import ETMEDEN önce
// ayarlamamız gerekiyor, çünkü limit modül yüklenirken hesaplanıyor.
// `node --test` her dosyayı ayrı bir alt süreçte çalıştırdığı için bu,
// diğer test dosyalarını etkilemez.
process.env.OCR_MAX_FILE_SIZE_MB = '0.001'; // ~1KB
process.env.MISTRAL_API_KEY = '';

const { processFile } = await import('../ocr/index.js');

test('düz metin dosyasını OCR uygulamadan aynı zarfla döner', async () => {
  const result = await processFile({ buffer: Buffer.from('merhaba dünya'), fileName: 'a.txt' });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'passthrough');
  assert.equal(result.result.text, 'merhaba dünya');
  assert.equal(result.result.pageCount, 1);
  assert.equal(result.error, null);
});

test('boş dosya için throw etmez, EMPTY_FILE hatası döner', async () => {
  const result = await processFile({ buffer: Buffer.alloc(0), fileName: 'empty.txt' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'EMPTY_FILE');
});

test('boyut sınırını aşan dosya için FILE_TOO_LARGE döner', async () => {
  const big = Buffer.alloc(5000, 'a');
  const result = await processFile({ buffer: big, fileName: 'big.txt' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'FILE_TOO_LARGE');
});

test('tanınamayan ikili dosya için UNSUPPORTED_FILE_TYPE döner', async () => {
  const random = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x10]);
  const result = await processFile({ buffer: random, fileName: 'random.bin' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'UNSUPPORTED_FILE_TYPE');
});

test('eski .doc (CFB) dosyası için açıklayıcı UNSUPPORTED_FILE_TYPE döner', async () => {
  const cfb = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  const result = await processFile({ buffer: cfb, fileName: 'eski.doc' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'UNSUPPORTED_FILE_TYPE');
  assert.match(result.error.message, /docx/i);
});

test('MISTRAL_API_KEY yokken PDF için NO_PROVIDER_AVAILABLE döner (throw etmez)', async () => {
  const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj');
  const result = await processFile({ buffer: pdf, fileName: 'test.pdf' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'NO_PROVIDER_AVAILABLE');
});

test('provider=mistral zorlanırsa ve key yoksa PROVIDER_NOT_CONFIGURED döner', async () => {
  const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
  const result = await processFile({ buffer: pdf, fileName: 'test.pdf' }, { provider: 'mistral' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PROVIDER_NOT_CONFIGURED');
});

test('girdi hiç verilmezse INVALID_INPUT döner', async () => {
  const result = await processFile({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_INPUT');
});
