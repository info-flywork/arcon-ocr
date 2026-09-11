/**
 * OCR gerektirmeyen düz metin dosyaları (txt, csv, json, md, ...) için:
 * içerik doğrudan okunur, aynı sayfa/sonuç zarfına konur.
 */
export async function runPassthrough(buffer) {
  const text = buffer.toString('utf-8').trim();
  return {
    provider: 'passthrough',
    pages: [
      {
        index: 0,
        text,
        markdown: text,
        tables: [],
        images: [],
        width: null,
        height: null,
      },
    ],
    model: null,
    usage: null,
    warnings: ['Bu dosya türü metin olarak algılandı; OCR uygulanmadı, içerik doğrudan okundu.'],
  };
}
