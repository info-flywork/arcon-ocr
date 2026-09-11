import { Mistral } from '@mistralai/mistralai';

let client = null;

function getClient() {
  if (!process.env.MISTRAL_API_KEY) {
    const err = new Error('MISTRAL_API_KEY tanımlı değil.');
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  if (!client) {
    client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return client;
}

export function isConfigured() {
  return Boolean(process.env.MISTRAL_API_KEY);
}

const MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';

// Ağ/istek katmanını elle yeniden yazmak yerine SDK'nın kendi retry+timeout
// mekanizmasını kullanıyoruz (her method çağrısına 2. argüman olarak geçilir).
const REQUEST_OPTIONS = {
  timeoutMs: Number(process.env.MISTRAL_TIMEOUT_MS || 120_000),
  retries: {
    strategy: 'backoff',
    backoff: { initialInterval: 500, maxInterval: 8_000, exponent: 1.8, maxElapsedTime: 60_000 },
    retryConnectionErrors: true,
  },
  retryCodes: ['429', '500', '502', '503', '504'],
};

/**
 * Birincil OCR motoru: Mistral OCR.
 *
 * Dosya, base64 data-URI olarak şişirilmek yerine önce Mistral Files API'ye
 * yüklenir (512MB'a kadar) ve `file_id` ile referanslanır — büyük PDF/DOCX
 * için hem daha hızlı hem daha güvenilir, hem de bizim kendi 25MB sınırımızın
 * ötesinde ölçeklenebilir. İşlem bitince yüklenen dosya temizlenir.
 */
export async function runMistralOcr(
  buffer,
  { fileName, detectedType, pages, schema, includeImages, imageLimit, imageMinSize },
) {
  const mistral = getClient();
  let uploadedFileId = null;

  try {
    let uploaded;
    try {
      uploaded = await mistral.files.upload(
        { file: { fileName: fileName || `document-${Date.now()}`, content: buffer }, purpose: 'ocr' },
        REQUEST_OPTIONS,
      );
    } catch (err) {
      throw classifyError(err, 'Dosya yükleme');
    }
    uploadedFileId = uploaded.id;

    const ocrRequest = {
      model: MODEL,
      document: { type: 'file', fileId: uploadedFileId },
      tableFormat: 'html',
      extractHeader: true,
      extractFooter: true,
      includeImageBase64: Boolean(includeImages),
    };

    if (Array.isArray(pages) && pages.length > 0) {
      ocrRequest.pages = pages;
    }

    if (typeof imageLimit === 'number') {
      ocrRequest.imageLimit = imageLimit;
    } else if ((detectedType === 'docx' || detectedType === 'pptx') && !includeImages) {
      // OOXML belgelerinde gömülü görseller yalnızca base64 olarak dönebilir;
      // istenmiyorsa gereksiz çıkarımı önlemek için image_limit=0 gönderilir.
      ocrRequest.imageLimit = 0;
    }
    if (includeImages && typeof imageMinSize === 'number') {
      ocrRequest.imageMinSize = imageMinSize;
    }

    if (schema && typeof schema === 'object' && schema.schema && typeof schema.schema === 'object') {
      ocrRequest.documentAnnotationFormat = {
        type: 'json_schema',
        jsonSchema: {
          name: schema.name || 'document_extraction',
          description: schema.description || undefined,
          schemaDefinition: schema.schema,
          strict: Boolean(schema.strict),
        },
      };
      if (schema.prompt) ocrRequest.documentAnnotationPrompt = schema.prompt;
    }

    let response;
    try {
      response = await mistral.ocr.process(ocrRequest, REQUEST_OPTIONS);
    } catch (err) {
      throw classifyError(err, 'OCR isteği');
    }

    const outPages = (response.pages || []).map((page, idx) => {
      const tables = (page.tables || []).map((t) => ({ id: t.id, format: t.format, content: t.content }));
      const images = (page.images || []).map((img) => ({
        id: img.id ?? null,
        topLeftX: img.topLeftX ?? null,
        topLeftY: img.topLeftY ?? null,
        bottomRightX: img.bottomRightX ?? null,
        bottomRightY: img.bottomRightY ?? null,
        base64: img.imageBase64 || null,
      }));
      // Mistral, tablo ve görselleri sayfa markdown'ının İÇİNDEN çıkarıp ayrı
      // dizilere koyar; markdown'da yalnızca "[tbl-0.html](tbl-0.html)" ya da
      // "![img-0.jpeg](img-0.jpeg)" gibi bir yer tutucu bırakır. Bunu olduğu
      // gibi bırakırsak "text"/"markdown" alanları anlamsız dosya adlarına
      // dönüşür — gerçek içeriği yer tutucunun yerine geri gömüyoruz ki tek
      // parça, kendi başına anlamlı bir metin/markdown elde edilsin.
      const inlinedMarkdown = inlinePlaceholders(page.markdown || '', tables, images);

      return {
        index: page.index ?? idx,
        text: markdownToPlainText(inlinedMarkdown),
        markdown: inlinedMarkdown,
        header: page.header || null,
        footer: page.footer || null,
        hyperlinks: page.hyperlinks || [],
        tables,
        images,
        width: page.dimensions?.width ?? null,
        height: page.dimensions?.height ?? null,
      };
    });

    return {
      provider: 'mistral-ocr',
      pages: outPages,
      model: response.model || MODEL,
      usage: response.usageInfo
        ? { pagesProcessed: response.usageInfo.pagesProcessed, docSizeBytes: response.usageInfo.docSizeBytes ?? null }
        : null,
      documentAnnotation: response.documentAnnotation ? safeParseJson(response.documentAnnotation) : null,
      warnings: [],
    };
  } finally {
    if (uploadedFileId) {
      // En iyi çaba: temizlik başarısız olsa bile OCR sonucunu etkilemesin.
      mistral.files.delete({ fileId: uploadedFileId }).catch(() => {});
    }
  }
}

function inlinePlaceholders(markdown, tables, images) {
  let out = markdown;
  for (const table of tables) {
    if (!table.id) continue;
    const pattern = new RegExp(`\\[${escapeRegExp(table.id)}\\]\\(${escapeRegExp(table.id)}\\)`, 'g');
    out = out.replace(pattern, table.content || '');
  }
  for (const image of images) {
    if (!image.id) continue;
    const pattern = new RegExp(`!\\[${escapeRegExp(image.id)}\\]\\(${escapeRegExp(image.id)}\\)`, 'g');
    const replacement = image.base64
      ? `![${image.id}](${image.base64.startsWith('data:') ? image.base64 : `data:image/jpeg;base64,${image.base64}`})`
      : `*[Görsel: ${image.id}]*`;
    out = out.replace(pattern, replacement);
  }
  return out;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyError(err, context) {
  if (err.code) return err;
  const status = err?.statusCode;
  let code = 'MISTRAL_REQUEST_FAILED';
  if (status === 401 || status === 403) code = 'MISTRAL_AUTH_ERROR';
  else if (status === 429) code = 'MISTRAL_RATE_LIMITED';
  else if (status === 413) code = 'MISTRAL_PAYLOAD_TOO_LARGE';
  else if (status >= 500) code = 'MISTRAL_SERVER_ERROR';

  const wrapped = new Error(
    status ? `${context} başarısız (HTTP ${status}): ${err.message}` : `${context} başarısız: ${err.message}`,
  );
  wrapped.code = code;
  return wrapped;
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function markdownToPlainText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
