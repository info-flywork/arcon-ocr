/**
 * /api/* istekleri için yapılandırılmış (JSON) access log.
 * Token, base64 gövde ve dosya içeriği loglanmaz.
 */

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || undefined;
}

export function setRequestMeta(req, meta) {
  req.logMeta = { ...(req.logMeta || {}), ...meta };
}

/**
 * Express middleware — yalnızca /api yollarını loglar.
 * LOG_API=false ile kapatılabilir.
 */
export function requestLog(req, res, next) {
  if (process.env.LOG_API === 'false') return next();
  if (!req.path.startsWith('/api/')) return next();

  const startedAt = Date.now();

  res.on('finish', () => {
    const entry = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: clientIp(req),
      ...(req.logMeta || {}),
    };

    const line = JSON.stringify(entry);
    if (res.statusCode >= 500) {
      console.error(line);
    } else {
      console.log(line);
    }
  });

  next();
}
