import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJdeInvoicePayload,
  getJdeInvoiceSchemaOptions,
  asNumber,
  normalizeDate,
  parseQuantityUnit,
} from '../ocr/profiles/jdeInvoice.js';
import { resolveProfile } from '../ocr/profiles/index.js';

test('jde_invoice profili çözümlenir', () => {
  assert.equal(resolveProfile('jde_invoice')?.id, 'jde_invoice');
  assert.equal(resolveProfile('JDE_INVOICE')?.id, 'jde_invoice');
  assert.equal(resolveProfile('unknown'), null);
});

test('getJdeInvoiceSchemaOptions geniş şema üretir', () => {
  const opts = getJdeInvoiceSchemaOptions();
  assert.equal(opts.name, 'jde_invoice');
  assert.ok(opts.schema.properties.Seller);
  assert.ok(opts.schema.properties.GoodsServicesTotal);
  assert.ok(opts.schema.properties.InvoiceLines.items.properties.LineNo);
  assert.ok(opts.schema.properties.InvoiceLines.items.properties.UnitPrice);
  assert.equal(opts.schema.properties.token, undefined);
  assert.equal(opts.schema.properties.JDEAddressNumber, undefined);
});

test('buildJdeInvoicePayload Boyner-style invoice normalizes', () => {
  const payload = buildJdeInvoicePayload({
    InvoiceNumber: 'BF72026000004775',
    InvoiceDate: '31-03-2026',
    InvoiceType: 'SATIS',
    DocumentNo: '0024081580',
    CustomizationNo: 'TR1.2',
    Scenario: 'TEMELFATURA',
    ETTN: '47130A38-A5B3-1FD1-8CD2-CFC887D6D37C',
    CurrencyCode: 'TRY',
    RemarkHeader: 'BOYNER',
    Seller: {
      Name: 'BOYNER BÜYÜK MAĞAZACILIK A.Ş.',
      Address: 'BÜYÜKDERE CAD. USO CENTER',
      TaxOffice: 'BÜYÜK MÜKELLEFLER',
      TaxNumber: '5200043963',
      Email: 'e-fatura@boyner.com.tr',
    },
    Buyer: {
      Name: 'ARCON KOZM.SAN.VE TIC. LTD. STI.',
      TaxNumber: '0730090099',
      TaxOffice: 'BOGAZICI KUR.VD.',
    },
    GoodsServicesTotal: '343.884,70',
    TotalDiscount: '0,00',
    CalculatedVAT: '68.776,94',
    TotalIncludingTaxes: '412.661,64',
    PayableAmount: '412.661,64',
    InvoiceLines: [
      {
        LineNo: '000001',
        ItemCode: '',
        Remark: 'GIVENCHY/COSMETICS/OZ032/KOZMETIK BAYRAM ÖZEL - 2',
        Quantity: '1,00 Adet',
        UnitPrice: '343.884,70',
        TaxRate: '%20.000',
        TaxAmount: '68776,94',
        TaxableAmount: '343.884,70',
      },
    ],
  });

  assert.equal(payload.token, undefined);
  assert.equal(payload.environment, undefined);
  assert.equal(payload.JDEAddressNumber, undefined);
  assert.equal(payload.InvoiceNumber, 'BF72026000004775');
  assert.equal(payload.InvoiceDate, '2026-03-31');
  assert.equal(payload.GLDate, '2026-03-31');
  assert.equal(payload.InvoiceType, 'SATIS');
  assert.equal(payload.DocumentNo, '0024081580');
  assert.equal(payload.CustomizationNo, 'TR1.2');
  assert.equal(payload.Scenario, 'TEMELFATURA');
  assert.equal(payload.ETTN, '47130A38-A5B3-1FD1-8CD2-CFC887D6D37C');
  assert.equal(payload.CurrencyCode, 'TRY');
  assert.equal(payload.ExchangeRate, 0);
  assert.equal(payload.Seller.Name, 'BOYNER BÜYÜK MAĞAZACILIK A.Ş.');
  assert.equal(payload.Seller.TaxNumber, '5200043963');
  assert.equal(payload.Buyer.Name, 'ARCON KOZM.SAN.VE TIC. LTD. STI.');
  assert.equal(payload.GoodsServicesTotal, 343884.7);
  assert.equal(payload.TotalDiscount, 0);
  assert.equal(payload.CalculatedVAT, 68776.94);
  assert.equal(payload.TotalIncludingTaxes, 412661.64);
  assert.equal(payload.PayableAmount, 412661.64);
  assert.equal(payload.InvoiceLines.length, 1);
  assert.equal(payload.InvoiceLines[0].LineNo, '000001');
  assert.equal(payload.InvoiceLines[0].Quantity, 1);
  assert.equal(payload.InvoiceLines[0].Unit, 'Adet');
  assert.equal(payload.InvoiceLines[0].UnitPrice, 343884.7);
  assert.equal(payload.InvoiceLines[0].TaxableAmount, 343884.7);
  assert.equal(payload.InvoiceLines[0].TaxAmount, 68776.94);
  assert.equal(payload.InvoiceLines[0].GrossAmount, 412661.64);
});

test('Türkçe tutar, tarih ve miktar normalize edilir', () => {
  assert.equal(asNumber('343.884,70'), 343884.7);
  assert.equal(asNumber('68.776,94'), 68776.94);
  assert.equal(normalizeDate('31-03-2026'), '2026-03-31');
  assert.deepEqual(parseQuantityUnit('1,00 Adet'), { quantity: 1, unit: 'Adet' });
});
