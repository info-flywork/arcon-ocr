import { createWorker } from 'tesseract.js';

/**
 * Yerel/ücretsiz yedek motor. Sadece görsel dosyaları destekler
 * (PDF/DOCX/PPTX için yapısal analiz yapamaz) — API anahtarı olmadan
 * test edilebilmesi ya da Mistral çağrısı başarısız olduğunda devreye girer.
 */
export async function runTesseract(buffer) {
  const lang = process.env.TESSERACT_LANG || 'eng+tur';
  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(buffer);
    const text = (data.text || '').trim();
    return {
      provider: 'tesseract',
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
      model: `tesseract:${lang}`,
      usage: null,
      warnings: [
        'Yerel OCR motoru (Tesseract) kullanıldı. Tablo/düzen algılama ve çoklu sayfa desteği yoktur; en iyi sonuç için MISTRAL_API_KEY tanımlayın.',
      ],
    };
  } finally {
    await worker.terminate();
  }
}
