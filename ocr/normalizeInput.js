import dns from 'node:dns/promises';
import net from 'node:net';

const ALLOW_PRIVATE_URLS = process.env.OCR_ALLOW_PRIVATE_URLS === 'true';

/**
 * Girdiyi kaynağı ne olursa olsun (multipart dosya, uzak URL, base64)
 * tek tip { buffer, fileName, mimeType } şekline indirger.
 */
export async function normalizeInput({ buffer, fileName, mimeType, url, base64 }) {
  if (buffer) {
    return { buffer, fileName: fileName || 'upload.bin', mimeType: mimeType || null };
  }

  if (base64) {
    const cleaned = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    return { buffer: Buffer.from(cleaned, 'base64'), fileName: fileName || 'upload.bin', mimeType: mimeType || null };
  }

  if (url) {
    await assertPublicUrl(url);

    let res;
    try {
      res = await fetch(url, { redirect: 'manual' });
    } catch (err) {
      throw new Error(`URL alınamadı: ${err.message}`);
    }

    // Yönlendirmeleri elle takip ediyoruz ki her adımda SSRF kontrolü tekrar uygulansın.
    let redirectCount = 0;
    while (res.status >= 300 && res.status < 400 && res.headers.get('location') && redirectCount < 5) {
      const next = new URL(res.headers.get('location'), url).toString();
      await assertPublicUrl(next);
      res = await fetch(next, { redirect: 'manual' });
      redirectCount++;
    }

    if (!res.ok) {
      throw new Error(`URL indirilemedi: ${res.status} ${res.statusText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type')?.split(';')[0] || mimeType || null;
    const derivedName = fileName || decodeURIComponent(url.split('/').pop()?.split('?')[0] || '') || 'download.bin';
    return { buffer: Buffer.from(arrayBuf), fileName: derivedName, mimeType: contentType };
  }

  throw new Error('Girdi bulunamadı: file, url veya base64 alanlarından biri gerekli.');
}

/**
 * SSRF koruması: yalnızca http/https ve genel (public) IP'lere çözümlenen
 * adreslere izin verir. Bu olmadan sunucu, kullanıcı kontrolündeki bir URL
 * üzerinden dahili ağa (localhost, bulut metadata servisi vb.) istek atacak
 * bir vekil haline gelebilir.
 */
async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Geçersiz URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Desteklenmeyen URL şeması: ${parsed.protocol}`);
  }

  if (ALLOW_PRIVATE_URLS) return;

  const hostname = parsed.hostname;
  const addresses = net.isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true })).map((a) => a.address);

  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      const err = new Error(`Özel/yerel ağ adreslerine istek atılamaz: ${hostname} (${address})`);
      err.code = 'SSRF_BLOCKED';
      throw err;
    }
  }
}

function isPrivateAddress(address) {
  const type = net.isIP(address);
  if (type === 4) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (type === 6) {
    const lower = address.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  return true;
}
