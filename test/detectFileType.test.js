import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFileType } from '../ocr/detectFileType.js';

// Gerçek, geçerli 1x1 saydam PNG (yalnızca 8 baytlık imza file-type için
// yetersiz kalıyor; kütüphane IHDR/CRC gibi ek baytları da doğruluyor).
const PNG_SIGNATURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const PDF_SIGNATURE = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj', 'latin1');
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);

test('görsel imzasını "image" olarak sınıflandırır', async () => {
  const result = await detectFileType(PNG_SIGNATURE, 'test.png');
  assert.equal(result.category, 'image');
});

test('PDF imzasını "pdf" olarak sınıflandırır', async () => {
  const result = await detectFileType(PDF_SIGNATURE, 'test.pdf');
  assert.equal(result.category, 'pdf');
});

test('eski OLE/CFB imzasını "legacy-office" olarak sınıflandırır', async () => {
  const result = await detectFileType(CFB_SIGNATURE, 'eski.doc');
  assert.equal(result.category, 'legacy-office');
});

test('magic-byte taşımayan içeriği metin olarak sınıflandırır', async () => {
  const result = await detectFileType(Buffer.from('merhaba dünya, bu düz bir metin.', 'utf-8'), 'not.txt');
  assert.equal(result.category, 'text');
});

test('null byte içeren rastgele ikiliyi "unknown" olarak sınıflandırır', async () => {
  const random = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x10, 0x00, 0x03, 0x04, 0x05]);
  const result = await detectFileType(random, 'random.bin');
  assert.equal(result.category, 'unknown');
});
