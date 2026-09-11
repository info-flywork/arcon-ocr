import crypto from 'node:crypto';

/**
 * API kimlik doğrulama.
 * İstemci şunlardan birini göndermelidir:
 *   Authorization: Bearer <token>
 *   X-API-Key: <token>
 *
 * Sunucu tarafında API_AUTH_TOKEN tanımlı değilse koruma kapalıdır (yalnızca
 * yerel geliştirme). Canlıda mutlaka tanımlayın.
 */
export function getConfiguredAuthToken() {
  const token = process.env.API_AUTH_TOKEN;
  return token && String(token).trim() ? String(token).trim() : null;
}

export function isAuthEnabled() {
  return Boolean(getConfiguredAuthToken());
}

export function extractRequestToken(req) {
  const header = req.headers.authorization;
  if (header && typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }

  const apiKey = req.headers['x-api-key'];
  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    return apiKey.trim();
  }

  // Multipart / JSON body (opsiyonel; header tercih edilir)
  if (req.body?.apiToken && typeof req.body.apiToken === 'string') {
    return req.body.apiToken.trim();
  }

  return null;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware — /api/ocr gibi korumalı rotalara uygula.
 * /api/health serbest bırakılmalıdır.
 */
export function requireApiAuth(req, res, next) {
  const expected = getConfiguredAuthToken();
  if (!expected) {
    return next();
  }

  const provided = extractRequestToken(req);
  if (!provided || !safeEqual(provided, expected)) {
    req.logMeta = {
      ...(req.logMeta || {}),
      route: 'ocr',
      auth: 'failed',
      errorCode: 'UNAUTHORIZED',
    };
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Geçerli bir API token gerekli. Authorization: Bearer <token> veya X-API-Key başlığı gönderin.',
      },
    });
  }

  req.logMeta = { ...(req.logMeta || {}), auth: 'ok' };
  return next();
}
