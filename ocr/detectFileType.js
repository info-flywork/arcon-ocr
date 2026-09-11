import { fileTypeFromBuffer } from 'file-type';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.tsv', '.json', '.log', '.html', '.htm', '.xml', '.yaml', '.yml',
]);

const MIME_RULES = [
  { test: (m) => m.startsWith('image/'), category: 'image' },
  { test: (m) => m === 'application/pdf', category: 'pdf' },
  { test: (m) => m.includes('wordprocessingml'), category: 'docx' },
  { test: (m) => m.includes('presentationml'), category: 'pptx' },
  { test: (m) => m.includes('spreadsheetml'), category: 'xlsx' },
  // Eski ikili Office biçimleri (.doc/.xls/.ppt) hepsi aynı OLE/CFB imzasını
  // paylaşır ve ayırt edilemez; Mistral OCR yalnızca modern OOXML'i destekler.
  { test: (m) => m === 'application/x-cfb', category: 'legacy-office' },
];

/**
 * Dosyanın gerçek türünü magic-byte imzasından belirler (uzantıya güvenmez).
 * Metin dosyaları imza taşımaz; onları içerik örneklemesiyle ayırt eder.
 */
export async function detectFileType(buffer, fileName = '', mimeHint = '') {
  const sniffed = await fileTypeFromBuffer(buffer).catch(() => undefined);
  const mime = sniffed?.mime || mimeHint || '';

  for (const rule of MIME_RULES) {
    if (mime && rule.test(mime)) {
      return { category: rule.category, mime, ext: sniffed?.ext || null };
    }
  }

  if (!sniffed) {
    const ext = getExt(fileName);
    if (isProbablyText(buffer) || TEXT_EXTENSIONS.has(ext)) {
      return { category: 'text', mime: mimeHint || 'text/plain', ext: ext || null };
    }
  }

  return { category: 'unknown', mime: mime || null, ext: sniffed?.ext || getExt(fileName) || null };
}

function getExt(fileName) {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? '' : fileName.slice(idx).toLowerCase();
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, 8000);
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    const isControl = byte < 7 || (byte > 14 && byte < 32 && byte !== 27);
    if (isControl) suspicious++;
  }
  return suspicious / sample.length < 0.02;
}
