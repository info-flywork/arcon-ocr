function emptyResult() {
  return {
    ok: false,
    provider: null,
    input: {
      fileName: null,
      mimeType: null,
      detectedType: 'unknown',
      sizeBytes: null,
    },
    result: {
      text: '',
      markdown: '',
      pages: [],
      pageCount: 0,
      documentAnnotation: null,
    },
    meta: {
      durationMs: 0,
      model: null,
      usage: null,
      warnings: [],
      profile: null,
    },
    error: null,
  };
}

/**
 * Tüm OCR çağrılarının döndüğü TEK sonuç şekli. Başarı, hata, hangi
 * sağlayıcı/dosya türü olursa olsun bu zarfın dışına çıkılmaz.
 */
export function buildResult(overrides = {}) {
  const base = emptyResult();
  return {
    ...base,
    ...overrides,
    input: { ...base.input, ...overrides.input },
    result: { ...base.result, ...overrides.result },
    meta: { ...base.meta, ...overrides.meta },
  };
}
