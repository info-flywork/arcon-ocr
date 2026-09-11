import { normalizeInput } from './normalizeInput.js';
import { detectFileType } from './detectFileType.js';
import { buildResult } from './result.js';
import { runPassthrough } from './providers/passthrough.js';
import { runMistralOcr, isConfigured as isMistralConfigured } from './providers/mistral.js';
import { runTesseract } from './providers/tesseract.js';
import { resolveProfile } from './profiles/index.js';

const MAX_FILE_SIZE_BYTES = Number(process.env.OCR_MAX_FILE_SIZE_MB || 25) * 1024 * 1024;

/**
 * Uygulamanın tek giriş noktası. Girdi ne olursa olsun (dosya, url, base64;
 * görsel, pdf, docx, pptx, düz metin, bilinmeyen...) HER ZAMAN aynı sonuç
 * zarfını (bkz. result.js) döndürür; hata durumunda dahi throw etmez.
 *
 * options:
 *   provider      'auto' | 'mistral' | 'tesseract'
 *   pages         number[]  — yalnızca belirli sayfaları işle (0-indeksli)
 *   schema        { name?, description?, schema, prompt?, strict? } — verilirse
 *                 Mistral'ın belge geneli yapılandırılmış çıktı (document
 *                 annotation) özelliği devreye girer, sonuç result.documentAnnotation'a yazılır
 *   profile       string — yerleşik şema (örn. 'jde_invoice'); schema yoksa bu kullanılır
 *   includeImages boolean — sayfa içi görselleri base64 olarak döndür
 *   imageLimit    number
 *   imageMinSize  number
 */
export async function processFile(input, options = {}) {
  const startedAt = Date.now();
  const requestedProvider = options.provider || 'auto';

  const profile = resolveProfile(options.profile);
  if (options.profile && !profile) {
    return buildResult({
      error: {
        code: 'INVALID_PROFILE',
        message: `Bilinmeyen profile: ${options.profile}. Desteklenen: jde_invoice`,
      },
      meta: { durationMs: Date.now() - startedAt },
    });
  }

  const schema = options.schema || (profile ? profile.getSchema() : undefined);

  let normalized;
  try {
    normalized = await normalizeInput(input);
  } catch (err) {
    return buildResult({
      error: { code: err.code || 'INVALID_INPUT', message: err.message },
      meta: { durationMs: Date.now() - startedAt },
    });
  }

  const { buffer, fileName, mimeType } = normalized;

  if (buffer.length === 0) {
    return buildResult({
      input: { fileName, mimeType, sizeBytes: 0, detectedType: 'unknown' },
      error: { code: 'EMPTY_FILE', message: 'Dosya boş.' },
      meta: { durationMs: Date.now() - startedAt },
    });
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return buildResult({
      input: { fileName, mimeType, sizeBytes: buffer.length, detectedType: 'unknown' },
      error: {
        code: 'FILE_TOO_LARGE',
        message: `Dosya boyutu sınırı aşıldı (limit: ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB).`,
      },
      meta: { durationMs: Date.now() - startedAt },
    });
  }

  const detected = await detectFileType(buffer, fileName, mimeType);
  const inputMeta = {
    fileName,
    mimeType: detected.mime || mimeType || null,
    detectedType: detected.category,
    sizeBytes: buffer.length,
  };

  try {
    const providerResult = await runProvider({
      buffer,
      fileName,
      mimeType: inputMeta.mimeType,
      detectedType: detected.category,
      requestedProvider,
      pages: options.pages,
      schema,
      includeImages: options.includeImages,
      imageLimit: options.imageLimit,
      imageMinSize: options.imageMinSize,
    });

    const pages = providerResult.pages;
    let documentAnnotation = providerResult.documentAnnotation ?? null;
    const warnings = [...(providerResult.warnings || [])];

    if (profile) {
      if (documentAnnotation) {
        documentAnnotation = profile.buildPayload(documentAnnotation);
      } else {
        documentAnnotation = profile.buildPayload({});
        warnings.push(
          `Profil "${profile.id}" uygulandı ancak OCR yapılandırılmış alan üretemedi; boş/varsayılan JDE iskeleti döndürüldü. Mistral OCR ve PDF/görsel/DOCX girdisi gerekir.`,
        );
      }
    }

    return buildResult({
      ok: true,
      provider: providerResult.provider,
      input: inputMeta,
      result: {
        text: pages.map((p) => p.text).join('\n\n'),
        markdown: pages.map((p) => p.markdown).join('\n\n'),
        pages,
        pageCount: pages.length,
        documentAnnotation,
      },
      meta: {
        durationMs: Date.now() - startedAt,
        model: providerResult.model,
        usage: providerResult.usage,
        warnings,
        profile: profile?.id || null,
      },
      error: null,
    });
  } catch (err) {
    return buildResult({
      input: inputMeta,
      error: { code: err.code || 'PROCESSING_FAILED', message: err.message },
      meta: { durationMs: Date.now() - startedAt, profile: profile?.id || null },
    });
  }
}

async function runProvider({
  buffer,
  fileName,
  detectedType,
  requestedProvider,
  pages,
  schema,
  includeImages,
  imageLimit,
  imageMinSize,
}) {
  if (detectedType === 'text') {
    return runPassthrough(buffer);
  }

  if (detectedType === 'legacy-office') {
    const err = new Error(
      `Eski ikili Office biçimleri (.doc/.xls/.ppt) desteklenmiyor${fileName ? `: ${fileName}` : ''}. Lütfen .docx/.xlsx/.pptx olarak kaydedip tekrar deneyin.`,
    );
    err.code = 'UNSUPPORTED_FILE_TYPE';
    throw err;
  }

  if (detectedType === 'unknown') {
    const err = new Error(`Desteklenmeyen ya da tanınamayan dosya türü${fileName ? `: ${fileName}` : ''}.`);
    err.code = 'UNSUPPORTED_FILE_TYPE';
    throw err;
  }

  const canUseMistral = isMistralConfigured();

  if (requestedProvider === 'tesseract') {
    if (detectedType !== 'image') {
      const err = new Error('Yerel OCR (Tesseract) yalnızca görsel dosyaları destekler.');
      err.code = 'PROVIDER_UNSUPPORTED_TYPE';
      throw err;
    }
    return runTesseract(buffer);
  }

  if (requestedProvider === 'mistral' || requestedProvider === 'auto') {
    if (canUseMistral) {
      try {
        return await runMistralOcr(buffer, { fileName, detectedType, pages, schema, includeImages, imageLimit, imageMinSize });
      } catch (err) {
        if (requestedProvider === 'auto' && detectedType === 'image') {
          const fallback = await runTesseract(buffer);
          fallback.warnings = [
            `Mistral OCR başarısız olduğu için yerel motora düşüldü (${err.code || 'ERROR'}: ${err.message}).`,
            ...fallback.warnings,
          ];
          return fallback;
        }
        throw err;
      }
    }

    if (requestedProvider === 'mistral') {
      const err = new Error('MISTRAL_API_KEY tanımlı değil.');
      err.code = 'PROVIDER_NOT_CONFIGURED';
      throw err;
    }

    if (detectedType === 'image') {
      return runTesseract(buffer);
    }

    const err = new Error(
      `${detectedType.toUpperCase()} dosyaları için yapılandırılmış bir OCR sağlayıcısı yok (MISTRAL_API_KEY ayarlayın).`,
    );
    err.code = 'NO_PROVIDER_AVAILABLE';
    throw err;
  }

  const err = new Error(`Bilinmeyen provider seçimi: ${requestedProvider}`);
  err.code = 'INVALID_PROVIDER';
  throw err;
}
