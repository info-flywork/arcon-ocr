import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResult } from '../ocr/result.js';

test('override verilmeden çağrıldığında tam ve tutarlı varsayılan zarfı döner', () => {
  const result = buildResult();
  assert.deepEqual(result, {
    ok: false,
    provider: null,
    input: { fileName: null, mimeType: null, detectedType: 'unknown', sizeBytes: null },
    result: { text: '', markdown: '', pages: [], pageCount: 0, documentAnnotation: null },
    meta: { durationMs: 0, model: null, usage: null, warnings: [], profile: null },
    error: null,
  });
});

test('kısmi override\'lar diğer varsayılan alanları korur', () => {
  const result = buildResult({ ok: true, provider: 'passthrough', result: { text: 'merhaba' } });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'passthrough');
  assert.equal(result.result.text, 'merhaba');
  assert.equal(result.result.markdown, '');
  assert.equal(result.input.detectedType, 'unknown');
});
