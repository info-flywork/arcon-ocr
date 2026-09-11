/**
 * JDE + Türk e-Fatura çıkarım profili.
 * Satır kalemleri InvoiceLines[] içinde; üst bilgiler ve toplamlar aynı kök düzeyde.
 */

export const PROFILE_ID = 'jde_invoice';

const partySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    Name: { type: 'string', description: 'Ünvan' },
    Address: { type: 'string', description: 'Adres (çok satır birleştirilebilir)' },
    Phone: { type: 'string' },
    Fax: { type: 'string' },
    Email: { type: 'string' },
    TaxOffice: { type: 'string', description: 'Vergi dairesi' },
    TaxNumber: { type: 'string', description: 'Vergi numarası / VKN' },
    Website: { type: 'string' },
    TradeRegistryNo: { type: 'string', description: 'Sicil No' },
    MersisNo: { type: 'string' },
    BusinessCenter: { type: 'string', description: 'İşletme merkezi' },
  },
  required: [
    'Name',
    'Address',
    'Phone',
    'Fax',
    'Email',
    'TaxOffice',
    'TaxNumber',
    'Website',
    'TradeRegistryNo',
    'MersisNo',
    'BusinessCenter',
  ],
};

const invoiceLineSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    LineNo: { type: 'string', description: 'SIRA NO (örn. 000001)' },
    ItemCode: { type: 'string', description: 'ÜRÜN KODU' },
    Remark: { type: 'string', description: 'ÜRÜN CİNSİ / açıklama' },
    Quantity: { type: 'number', description: 'MİKTAR sayısal (1,00 → 1)' },
    Unit: { type: 'string', description: 'Birim (Adet, KG...)' },
    UnitPrice: { type: 'number', description: 'BİRİM FİYAT' },
    TaxRate: { type: 'string', description: 'KDV ORANI (örn. %20)' },
    TaxAmount: { type: 'number', description: 'KDV TUTARI' },
    TaxableAmount: { type: 'number', description: 'TUTAR (KDV hariç matrah)' },
    GrossAmount: { type: 'number', description: 'Matrah + KDV' },
    AccountID: { type: 'string', description: 'JDE hesap kodu; yoksa boş' },
    Subledger: {
      anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }],
      description: 'JDE alt hesap / AB no',
    },
    AssetID: { type: 'string' },
    PolarisProjectNo: { type: 'string' },
    Subchannel: { type: 'string' },
    PolarisCostCenter: { type: 'string' },
    PaymentTermsCode: { type: 'string' },
    TaxExplanationCode: { type: 'string' },
  },
  required: [
    'LineNo',
    'ItemCode',
    'Remark',
    'Quantity',
    'Unit',
    'UnitPrice',
    'TaxRate',
    'TaxAmount',
    'TaxableAmount',
    'GrossAmount',
    'AccountID',
    'Subledger',
    'AssetID',
    'PolarisProjectNo',
    'Subchannel',
    'PolarisCostCenter',
    'PaymentTermsCode',
    'TaxExplanationCode',
  ],
};

export const jdeInvoiceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    InvoiceNumber: { type: 'string', description: 'Fatura No' },
    InvoiceDate: { type: 'string', description: 'Fatura Tarihi YYYY-MM-DD' },
    GLDate: { type: 'string', description: 'G/L tarihi; yoksa InvoiceDate' },
    InvoiceType: { type: 'string', description: 'Fatura Tipi (SATIS, IADE...)' },
    DocumentNo: { type: 'string', description: 'Belge No' },
    CustomizationNo: { type: 'string', description: 'Özelleştirme No (TR1.2)' },
    Scenario: { type: 'string', description: 'Senaryo (TEMELFATURA...)' },
    ETTN: { type: 'string', description: 'e-Fatura ETTN UUID' },
    CurrencyCode: { type: 'string', description: 'TRY, EUR...' },
    ExchangeRate: { type: 'number', description: 'TRY ise 0' },
    RemarkHeader: { type: 'string', description: 'Üst not / kısa başlık' },

    Seller: { ...partySchema, description: 'Satıcı (düzenleyen)' },
    Buyer: { ...partySchema, description: 'Alıcı (SAYIN)' },

    GoodsServicesTotal: {
      type: 'number',
      description: 'Goods/services total before VAT (Mal Hizmet Toplam Tutarı)',
    },
    TotalDiscount: { type: 'number', description: 'Total discount (Toplam İskonto)' },
    CalculatedVAT: { type: 'number', description: 'Total calculated VAT (Hesaplanan KDV)' },
    TotalIncludingTaxes: {
      type: 'number',
      description: 'Total including taxes (Vergiler Dahil Toplam Tutar)',
    },
    PayableAmount: { type: 'number', description: 'Amount payable (Ödenecek Tutar)' },

    InvoiceLines: {
      type: 'array',
      description: 'One object per invoice line item',
      items: invoiceLineSchema,
    },
  },
  required: [
    'InvoiceNumber',
    'InvoiceDate',
    'GLDate',
    'InvoiceType',
    'DocumentNo',
    'CustomizationNo',
    'Scenario',
    'ETTN',
    'CurrencyCode',
    'ExchangeRate',
    'RemarkHeader',
    'Seller',
    'Buyer',
    'GoodsServicesTotal',
    'TotalDiscount',
    'CalculatedVAT',
    'TotalIncludingTaxes',
    'PayableAmount',
    'InvoiceLines',
  ],
};

export const jdeInvoicePrompt = `Bu belge bir Türk e-Fatura / tedarikçi faturasıdır. Tüm alanları verilen JSON şemasına göre çıkar.

ÜST BİLGİLER:
- InvoiceNumber ← "Fatura No"
- InvoiceDate ← "Fatura Tarihi" → YYYY-MM-DD (31-03-2026 → 2026-03-31)
- GLDate ← InvoiceDate (ayrı yoksa)
- InvoiceType ← "Fatura Tipi" (SATIS...)
- DocumentNo ← "Belge No"
- CustomizationNo ← "Özelleştirme No" (TR1.2)
- Scenario ← "Senaryo" (TEMELFATURA)
- ETTN ← ETTN UUID
- CurrencyCode ← TL/₺ ise TRY; ExchangeRate ← TRY ise 0
- RemarkHeader ← kısa üst not veya satıcı kısa adı

SATICI (Seller) — belge üstündeki düzenleyen firma:
Name, Address, Phone, Fax, Email, TaxOffice (Vergi Dairesi), TaxNumber (Vergi Numarası),
Website, TradeRegistryNo (Sicil No), MersisNo, BusinessCenter (İşletme Merkezi)

ALICI (Buyer) — "SAYIN" altındaki firma:
Name, Address, Email, TaxOffice, TaxNumber; Phone/Fax/Website/Sicil/Mersis/BusinessCenter yoksa ""

TOTALS (same root level as InvoiceLines, numeric):
- GoodsServicesTotal ← "Mal Hizmet Toplam Tutarı"
- TotalDiscount ← "Toplam İskonto"
- CalculatedVAT ← "Hesaplanan KDV"
- TotalIncludingTaxes ← "Vergiler Dahil Toplam Tutar"
- PayableAmount ← "Ödenecek Tutar"

SATIRLAR (InvoiceLines) — tablodaki HER kalem ayrı bir dizi öğesi:
- LineNo ← SIRA NO
- ItemCode ← ÜRÜN KODU (boş olabilir → "")
- Remark ← ÜRÜN CİNSİ
- Quantity ← MİKTAR sayı (1,00 Adet → Quantity:1, Unit:"Adet")
- Unit ← birim metni
- UnitPrice ← BİRİM FİYAT
- TaxRate ← KDV ORANI ("%20" veya "%20.000")
- TaxAmount ← KDV TUTARI
- TaxableAmount ← TUTAR (KDV hariç)
- GrossAmount ← TaxableAmount + TaxAmount
- AccountID, AssetID, Polaris*, PaymentTermsCode, TaxExplanationCode, Subledger ← belgede yoksa "" / null

Kurallar:
- Eksik string → ""; eksik sayı → 0. Uydurma.
- Türkçe tutar: 343.884,70 → 343884.70 (binlik noktayı sil, virgülü ondalık yap).
- Tek satırlı tabloda InvoiceLines uzunluğu 1.`;

export function getJdeInvoiceSchemaOptions() {
  return {
    name: 'jde_invoice',
    description: 'JDE + Türk e-Fatura alanları (kalemler, toplamlar, taraflar)',
    prompt: jdeInvoicePrompt,
    strict: false,
    schema: jdeInvoiceJsonSchema,
  };
}

function asString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

  let s = String(value).trim().replace(/[^\d,.\-]/g, '');
  if (!s) return fallback;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function asAddressNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function normalizeDate(value) {
  const s = asString(value);
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return s;
}

/** "1,00 Adet" → { quantity: 1, unit: "Adet" } */
export function parseQuantityUnit(quantity, unit) {
  if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    return { quantity, unit: asString(unit) };
  }
  const raw = asString(quantity);
  if (!raw && !unit) return { quantity: 0, unit: '' };
  const match = raw.match(/^([\d.,]+)\s*(.*)$/);
  if (match) {
    return {
      quantity: asNumber(match[1]),
      unit: asString(unit) || asString(match[2]),
    };
  }
  return { quantity: asNumber(quantity), unit: asString(unit) };
}

function emptyParty() {
  return {
    Name: '',
    Address: '',
    Phone: '',
    Fax: '',
    Email: '',
    TaxOffice: '',
    TaxNumber: '',
    Website: '',
    TradeRegistryNo: '',
    MersisNo: '',
    BusinessCenter: '',
  };
}

function normalizeParty(party) {
  const src = party && typeof party === 'object' ? party : {};
  return {
    Name: asString(src.Name),
    Address: asString(src.Address),
    Phone: asString(src.Phone),
    Fax: asString(src.Fax),
    Email: asString(src.Email),
    TaxOffice: asString(src.TaxOffice),
    TaxNumber: asString(src.TaxNumber),
    Website: asString(src.Website),
    TradeRegistryNo: asString(src.TradeRegistryNo),
    MersisNo: asString(src.MersisNo),
    BusinessCenter: asString(src.BusinessCenter),
  };
}

function normalizeLine(line = {}) {
  const taxable = asNumber(line.TaxableAmount);
  const tax = asNumber(line.TaxAmount);
  let gross = asNumber(line.GrossAmount);
  if (!gross && (taxable || tax)) gross = Math.round((taxable + tax) * 100) / 100;

  const { quantity, unit } = parseQuantityUnit(line.Quantity, line.Unit);

  return {
    LineNo: asString(line.LineNo),
    ItemCode: asString(line.ItemCode),
    Remark: asString(line.Remark),
    Quantity: quantity,
    Unit: unit,
    UnitPrice: asNumber(line.UnitPrice),
    TaxRate: asString(line.TaxRate),
    TaxAmount: tax,
    TaxableAmount: taxable,
    GrossAmount: gross,
    AccountID: asString(line.AccountID),
    Subledger: asAddressNumber(line.Subledger) ?? asString(line.Subledger),
    AssetID: asString(line.AssetID),
    PolarisProjectNo: asString(line.PolarisProjectNo),
    Subchannel: asString(line.Subchannel),
    PolarisCostCenter: asString(line.PolarisCostCenter),
    PaymentTermsCode: asString(line.PaymentTermsCode),
    TaxExplanationCode: asString(line.TaxExplanationCode),
  };
}

export function buildJdeInvoicePayload(annotation, extras = {}) {
  const src = annotation && typeof annotation === 'object' ? annotation : {};
  const invoiceDate = normalizeDate(src.InvoiceDate);
  const currency = asString(src.CurrencyCode).toUpperCase() || 'TRY';

  return {
    InvoiceNumber: asString(src.InvoiceNumber),
    InvoiceDate: invoiceDate,
    GLDate: normalizeDate(src.GLDate) || invoiceDate,
    InvoiceType: asString(src.InvoiceType),
    DocumentNo: asString(src.DocumentNo),
    CustomizationNo: asString(src.CustomizationNo),
    Scenario: asString(src.Scenario),
    ETTN: asString(src.ETTN),
    CurrencyCode: currency,
    ExchangeRate: currency === 'TRY' ? 0 : asNumber(src.ExchangeRate),
    RemarkHeader: asString(src.RemarkHeader),

    Seller: normalizeParty(src.Seller),
    Buyer: normalizeParty(src.Buyer),

    GoodsServicesTotal: asNumber(src.GoodsServicesTotal ?? src.MalHizmetToplamTutari),
    TotalDiscount: asNumber(src.TotalDiscount ?? src.ToplamIskonto),
    CalculatedVAT: asNumber(src.CalculatedVAT ?? src.HesaplananKDV),
    TotalIncludingTaxes: asNumber(src.TotalIncludingTaxes ?? src.VergilerDahilToplamTutar),
    PayableAmount: asNumber(src.PayableAmount ?? src.OdenecekTutar),

    InvoiceLines: Array.isArray(src.InvoiceLines)
      ? src.InvoiceLines.map(normalizeLine)
      : [],
  };
}

export { emptyParty };
