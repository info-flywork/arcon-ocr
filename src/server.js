import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { processFile } from './ocr/index.js';
import { requireApiAuth, isAuthEnabled } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE_MB = Number(process.env.OCR_MAX_FILE_SIZE_MB || 25);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

app.disable('x-powered-by');
app.use(helmet());

// JSON gövdesi base64 girdiyi taşıyabilir (~%37 şişme payı bırakılır).
app.use(express.json({ limit: `${Math.ceil(MAX_FILE_SIZE_MB * 1.4)}mb` }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/vendor/marked.js', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'marked', 'lib', 'marked.umd.js')),
);
app.get('/vendor/dompurify.js', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'dompurify', 'dist', 'purify.min.js')),
);

// Her dosya türünü kabul eder — mimetype/uzantı filtresi yok; gerçek tür
// tespiti ocr/detectFileType.js içinde magic-byte ile yapılır.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

const ocrLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.' } },
});

const STATUS_BY_ERROR_CODE = {
  INVALID_INPUT: 400,
  EMPTY_FILE: 400,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  SSRF_BLOCKED: 400,
  INVALID_PROVIDER: 400,
  INVALID_PROFILE: 400,
  PROVIDER_UNSUPPORTED_TYPE: 400,
  PROVIDER_NOT_CONFIGURED: 503,
  NO_PROVIDER_AVAILABLE: 503,
  MISTRAL_AUTH_ERROR: 502,
  MISTRAL_RATE_LIMITED: 429,
  MISTRAL_PAYLOAD_TOO_LARGE: 413,
  MISTRAL_SERVER_ERROR: 502,
  MISTRAL_REQUEST_FAILED: 502,
  TIMEOUT: 504,
};

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mistralConfigured: Boolean(process.env.MISTRAL_API_KEY),
    authRequired: isAuthEnabled(),
  });
});

app.post(
  '/api/ocr',
  ocrLimiter,
  upload.single('file'),
  requireApiAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const provider = body.provider || req.query.provider || 'auto';

    let input;
    if (req.file) {
      input = { buffer: req.file.buffer, fileName: req.file.originalname, mimeType: req.file.mimetype };
    } else if (body.url) {
      input = { url: body.url, fileName: body.fileName };
    } else if (body.base64) {
      input = { base64: body.base64, fileName: body.fileName, mimeType: body.mimeType };
    } else {
      return res.status(400).json({
        ok: false,
        error: { code: 'NO_INPUT', message: 'file (multipart), url veya base64 alanlarından biri gerekli.' },
      });
    }

    const options = { provider, ...parseAdvancedOptions(body, req.query) };
    const result = await processFile(input, options);
    const status = result.ok ? 200 : (STATUS_BY_ERROR_CODE[result.error?.code] || 500);

    // Varsayılan: JDE / structured JSON. Debug için responseMode=full gönderin.
    const responseMode =
      body.responseMode ||
      req.query.responseMode ||
      (options.profile ? 'structured' : 'full');

    if (result.ok && responseMode === 'structured' && result.result?.documentAnnotation) {
      return res.status(status).json(result.result.documentAnnotation);
    }

    res.status(status).json(result);
  }),
);
function parseAdvancedOptions(body, query = {}) {
  const options = {};

  if (body.pages) {
    try {
      const parsed = typeof body.pages === 'string' ? JSON.parse(body.pages) : body.pages;
      if (Array.isArray(parsed) && parsed.every((n) => Number.isInteger(n) && n >= 0)) {
        options.pages = parsed;
      }
    } catch {
      // geçersiz pages girdisi sessizce yok sayılır, tüm belge işlenir
    }
  }

  if (body.schema) {
    try {
      options.schema = typeof body.schema === 'string' ? JSON.parse(body.schema) : body.schema;
    } catch {
      // geçersiz schema JSON'u yok sayılır
    }
  }

  if (body.includeImages !== undefined) {
    options.includeImages = body.includeImages === true || body.includeImages === 'true';
  }

  // Varsayılan profil: jde_invoice. Kapatmak için profile=none | off | (boş)
  const rawProfile =
    body.profile !== undefined
      ? body.profile
      : query.profile !== undefined
        ? query.profile
        : process.env.OCR_DEFAULT_PROFILE || 'jde_invoice';
  const normalizedProfile = String(rawProfile || '').trim().toLowerCase();
  if (normalizedProfile && normalizedProfile !== 'none' && normalizedProfile !== 'off') {
    options.profile = normalizedProfile;
  }

  return options;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.use((req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı.' } });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ ok: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'İstek gövdesi çok büyük.' } });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.' } });
});

// Testlerin app'i kendi (efemer) portunda başlatabilmesi için gerçek
// dinlemeyi yalnızca bu dosya doğrudan çalıştırıldığında (npm start) yapıyoruz.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = app.listen(PORT, () => {
    console.log(`Arcon OCR http://localhost:${PORT} adresinde çalışıyor`);
    console.log(
      process.env.MISTRAL_API_KEY
        ? 'Mistral OCR: yapılandırıldı'
        : 'Mistral OCR: YAPILANDIRILMADI — .env dosyasına MISTRAL_API_KEY ekleyin (yalnızca görseller için Tesseract yedeği aktif)',
    );
    console.log(
      isAuthEnabled()
        ? 'API auth: zorunlu (Authorization: Bearer veya X-API-Key)'
        : 'API auth: KAPALI — canlıda .env içine API_AUTH_TOKEN ekleyin',
    );
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}

export default app;
