# Arcon OCR API Documentation

**Base URL:** `https://arcon-oc.fly-work.com`  
**Web docs:** `https://arcon-oc.fly-work.com/docs.html`  
**Test UI:** `https://arcon-oc.fly-work.com/`  
**Version:** 1.0

Arcon OCR extracts structured invoice data (and optionally raw OCR text) from PDF, images, and Office documents. By default it returns a **JDE-ready invoice JSON** — not a raw OCR envelope.

---

## Table of contents

1. [Overview](#overview)
2. [How to call the API](#how-to-call-the-api)
3. [Authentication](#authentication)
4. [Rate limiting](#rate-limiting)
5. [Supported file types](#supported-file-types)
6. [Endpoints](#endpoints)
7. [POST /api/ocr](#post-apioocr)
8. [Default response — invoice JSON](#default-response--invoice-json)
9. [Field reference](#field-reference)
10. [Full OCR envelope (debug)](#full-ocr-envelope-debug)
11. [Error codes](#error-codes)
12. [Examples](#examples)
13. [Best practices](#best-practices)

---

## Overview

| Property | Value |
|----------|-------|
| Base URL | `https://arcon-oc.fly-work.com` |
| Default profile | `jde_invoice` |
| Default response | Structured invoice JSON only |
| Max file size | **25 MB** (configurable) |
| Rate limit | **30 requests / 15 minutes** per IP |
| Client timeout recommendation | **≥ 180 seconds** |
| Auth | `Authorization: Bearer <token>` or `X-API-Key: <token>` |

### Engines (`provider`)

| Value | Description |
|-------|-------------|
| `auto` | **Default.** Uses Mistral OCR; falls back to Tesseract for images on failure. |
| `mistral` | Mistral OCR only (required for structured invoice extraction). |
| `tesseract` | Local OCR, images only — no structured invoice fields. |

---

## How to call the API

| | |
|--|--|
| **URL** | `POST https://arcon-oc.fly-work.com/api/ocr` |
| **Auth** | `Authorization: Bearer YOUR_API_TOKEN` |
| **Body** | `multipart/form-data` — field name **`file`** = invoice PDF/image |
| **Timeout** | ≥ 180 seconds |

Without a valid token → **HTTP 401**.

### cURL

```bash
curl -X POST "https://arcon-oc.fly-work.com/api/ocr" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -F "file=@./invoice.pdf"
```

### Node.js

```javascript
import fs from 'node:fs';
import FormData from 'form-data'; // npm i form-data

const form = new FormData();
form.append('file', fs.createReadStream('./invoice.pdf'));

const response = await fetch('https://arcon-oc.fly-work.com/api/ocr', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_API_TOKEN',
    ...form.getHeaders(),
  },
  body: form,
});

const invoice = await response.json();
console.log(invoice);
```

### Python

```python
import requests

response = requests.post(
    "https://arcon-oc.fly-work.com/api/ocr",
    headers={"Authorization": "Bearer YOUR_API_TOKEN"},
    files={"file": open("invoice.pdf", "rb")},
    timeout=180,
)

invoice = response.json()
print(invoice)
```

### Java (OkHttp)

```java
OkHttpClient client = new OkHttpClient.Builder()
    .callTimeout(Duration.ofSeconds(180))
    .build();

RequestBody fileBody = RequestBody.create(
    new File("invoice.pdf"),
    MediaType.parse("application/pdf")
);

MultipartBody body = new MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("file", "invoice.pdf", fileBody)
    .build();

Request request = new Request.Builder()
    .url("https://arcon-oc.fly-work.com/api/ocr")
    .addHeader("Authorization", "Bearer YOUR_API_TOKEN")
    .post(body)
    .build();

try (Response response = client.newCall(request).execute()) {
    System.out.println(response.body().string());
}
```

### C#

```csharp
using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(180) };
client.DefaultRequestHeaders.Authorization =
    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "YOUR_API_TOKEN");

using var content = new MultipartFormDataContent();
await using var stream = File.OpenRead("invoice.pdf");
content.Add(new StreamContent(stream), "file", "invoice.pdf");

var response = await client.PostAsync("https://arcon-oc.fly-work.com/api/ocr", content);
var invoiceJson = await response.Content.ReadAsStringAsync();
Console.WriteLine(invoiceJson);
```

### Optional: public URL instead of file upload

```bash
curl -X POST "https://arcon-oc.fly-work.com/api/ocr" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/public-invoice.pdf"}'
```

### Success response shape

HTTP **200** — body is the invoice JSON directly (not wrapped in `ok` / `result`):

```json
{
  "InvoiceNumber": "",
  "InvoiceDate": "",
  "GLDate": "",
  "InvoiceType": "",
  "DocumentNo": "",
  "CustomizationNo": "",
  "Scenario": "",
  "ETTN": "",
  "CurrencyCode": "",
  "ExchangeRate": 0,
  "RemarkHeader": "",
  "Seller": { "Name": "", "Address": "", "Phone": "", "Fax": "", "Email": "", "TaxOffice": "", "TaxNumber": "", "Website": "", "TradeRegistryNo": "", "MersisNo": "", "BusinessCenter": "" },
  "Buyer": { "Name": "", "Address": "", "Phone": "", "Fax": "", "Email": "", "TaxOffice": "", "TaxNumber": "", "Website": "", "TradeRegistryNo": "", "MersisNo": "", "BusinessCenter": "" },
  "GoodsServicesTotal": 0,
  "TotalDiscount": 0,
  "CalculatedVAT": 0,
  "TotalIncludingTaxes": 0,
  "PayableAmount": 0,
  "InvoiceLines": [
    {
      "LineNo": "",
      "ItemCode": "",
      "Remark": "",
      "Quantity": 0,
      "Unit": "",
      "UnitPrice": 0,
      "TaxRate": "",
      "TaxAmount": 0,
      "TaxableAmount": 0,
      "GrossAmount": 0,
      "AccountID": "",
      "Subledger": "",
      "AssetID": "",
      "PolarisProjectNo": "",
      "Subchannel": "",
      "PolarisCostCenter": "",
      "PaymentTermsCode": "",
      "TaxExplanationCode": ""
    }
  ]
}
```

### 6) Auth error response

HTTP **401**:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Geçerli bir API token gerekli. Authorization: Bearer <token> veya X-API-Key başlığı gönderin."
  }
}
```

### Quick checklist for integrators

1. Set timeout ≥ **180 seconds**
2. Always send `Authorization: Bearer …`
3. Prefer `multipart/form-data` with field name **`file`**
4. On success, parse root JSON as the invoice object
5. On failure, read `error.code` / `error.message`

---

## Authentication

`POST /api/ocr` requires an API token when `API_AUTH_TOKEN` is set on the server (required in production).

Send one of:

```http
Authorization: Bearer <your-api-token>
```

or

```http
X-API-Key: <your-api-token>
```

`GET /api/health` stays public and reports `authRequired: true|false`.

---

## Rate limiting

Default: **30 requests / 15 minutes** per IP.

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Çok fazla istek. Lütfen biraz sonra tekrar deneyin."
  }
}
```

Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

---

## Supported file types

Detection uses magic bytes (not file extension).

| Type | Formats | Structured invoice | Notes |
|------|---------|--------------------|-------|
| `pdf` | PDF | Yes | Recommended |
| `image` | JPEG, PNG, WebP, … | Yes | Via Mistral |
| `docx` / `pptx` / `xlsx` | Office OOXML | Yes | Legacy `.doc`/`.xls`/`.ppt` not supported |
| `text` | TXT, CSV, JSON, … | Empty skeleton | No OCR |

---

## Endpoints

### `GET /api/health`

```json
{
  "ok": true,
  "mistralConfigured": true
}
```

---

## `POST /api/ocr`

Processes a document and returns structured invoice JSON by default.

### Input methods (exactly one required)

#### 1) Multipart file upload

```
POST /api/ocr
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes* | Document or image |
| `provider` | string | No | `auto` \| `mistral` \| `tesseract` |
| `profile` | string | No | `jde_invoice` (default) \| `none` |
| `responseMode` | string | No | `structured` (default with profile) \| `full` |
| `pages` | string (JSON) | No | e.g. `"[0,1]"` — 0-based page indexes |
| `includeImages` | string | No | `"true"` to include embedded image base64 |
| `schema` | string (JSON) | No | Custom schema (only if not using `jde_invoice`) |

\* Or use `url` / `base64` instead of `file`.

#### 2) JSON — remote URL

```json
{
  "url": "https://example.com/invoice.pdf",
  "fileName": "invoice.pdf"
}
```

Only public `http`/`https` URLs are allowed (SSRF protection blocks localhost/private IPs).

#### 3) JSON — base64

```json
{
  "base64": "JVBERi0xLjQK...",
  "fileName": "invoice.pdf",
  "mimeType": "application/pdf"
}
```

Prefer multipart for large files (base64 adds ~37% size).

### Profiles

| `profile` | Behavior |
|-----------|----------|
| `jde_invoice` | **Default.** Extracts JDE + e-invoice fields. Response is structured JSON. |
| `none` / `off` | No structured profile; use with `responseMode=full` for raw OCR envelope. |

### Response modes

| `responseMode` | When | Body |
|----------------|------|------|
| `structured` | Default when profile is set | Invoice JSON only (see below) |
| `full` | Explicit | Full OCR envelope (`ok`, `result.text`, `pages`, …) |

---

## Default response — invoice JSON

Successful default call returns **only** this object (HTTP 200):

```json
{
  "InvoiceNumber": "BF72026000004775",
  "InvoiceDate": "2026-03-31",
  "GLDate": "2026-03-31",
  "InvoiceType": "SATIS",
  "DocumentNo": "0024081580",
  "CustomizationNo": "TR1.2",
  "Scenario": "TEMELFATURA",
  "ETTN": "47130A38-A5B3-1FD1-8CD2-CFC887D6D37C",
  "CurrencyCode": "TRY",
  "ExchangeRate": 0,
  "RemarkHeader": "BOYNER",
  "Seller": {
    "Name": "BOYNER BÜYÜK MAĞAZACILIK A.Ş.",
    "Address": "BÜYÜKDERE CAD. USO CENTER...",
    "Phone": "02123357575",
    "Fax": "02122766880",
    "Email": "e-fatura@boyner.com.tr",
    "TaxOffice": "BÜYÜK MÜKELLEFLER",
    "TaxNumber": "5200043963",
    "Website": "www.boyner.com.tr",
    "TradeRegistryNo": "284082-231664",
    "MersisNo": "0520-0043-9630-0013",
    "BusinessCenter": "İSTANBUL"
  },
  "Buyer": {
    "Name": "ARCON KOZM.SAN.VE TIC. LTD. STI.",
    "Address": "MASLAK MAH...",
    "Phone": "",
    "Fax": "",
    "Email": "mujgan.alagoz@arcon-kozmetik.com.tr",
    "TaxOffice": "BOGAZICI KUR.VD.",
    "TaxNumber": "0730090099",
    "Website": "",
    "TradeRegistryNo": "",
    "MersisNo": "",
    "BusinessCenter": ""
  },
  "GoodsServicesTotal": 343884.7,
  "TotalDiscount": 0,
  "CalculatedVAT": 68776.94,
  "TotalIncludingTaxes": 412661.64,
  "PayableAmount": 412661.64,
  "InvoiceLines": [
    {
      "LineNo": "000001",
      "ItemCode": "",
      "Remark": "GIVENCHY/COSMETICS/OZ032/KOZMETIK BAYRAM ÖZEL - 2",
      "Quantity": 1,
      "Unit": "Adet",
      "UnitPrice": 343884.7,
      "TaxRate": "%20.000",
      "TaxAmount": 68776.94,
      "TaxableAmount": 343884.7,
      "GrossAmount": 412661.64,
      "AccountID": "",
      "Subledger": "",
      "AssetID": "",
      "PolarisProjectNo": "",
      "Subchannel": "",
      "PolarisCostCenter": "",
      "PaymentTermsCode": "",
      "TaxExplanationCode": ""
    }
  ]
}
```

All JSON **keys are English**. Values may contain Turkish text from the document.

---

## Field reference

### Root

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `InvoiceNumber` | string | OCR | Invoice number |
| `InvoiceDate` | string | OCR | `YYYY-MM-DD` |
| `GLDate` | string | OCR | Same as invoice date if missing |
| `InvoiceType` | string | OCR | e.g. `SATIS` |
| `DocumentNo` | string | OCR | Document number |
| `CustomizationNo` | string | OCR | e.g. `TR1.2` |
| `Scenario` | string | OCR | e.g. `TEMELFATURA` |
| `ETTN` | string | OCR | e-Invoice UUID |
| `CurrencyCode` | string | OCR | `TRY`, `EUR`, … |
| `ExchangeRate` | number | OCR | `0` when currency is `TRY` |
| `RemarkHeader` | string | OCR | Short header note |
| `Seller` | object | OCR | Issuer party |
| `Buyer` | object | OCR | Customer (`SAYIN`) |
| `GoodsServicesTotal` | number | OCR | Line goods total (ex-VAT) |
| `TotalDiscount` | number | OCR | Total discount |
| `CalculatedVAT` | number | OCR | Total VAT |
| `TotalIncludingTaxes` | number | OCR | Total incl. tax |
| `PayableAmount` | number | OCR | Amount due |
| `InvoiceLines` | array | OCR | **One object per line item** |

### `Seller` / `Buyer`

| Field | Type | Description |
|-------|------|-------------|
| `Name` | string | Legal name |
| `Address` | string | Address |
| `Phone` | string | Phone |
| `Fax` | string | Fax |
| `Email` | string | Email |
| `TaxOffice` | string | Tax office |
| `TaxNumber` | string | Tax ID (VKN) |
| `Website` | string | Website |
| `TradeRegistryNo` | string | Trade registry no. |
| `MersisNo` | string | MERSIS no. |
| `BusinessCenter` | string | Business center city |

Missing strings are `""`.

### `InvoiceLines[]`

| Field | Type | Maps from (TR e-invoice) |
|-------|------|--------------------------|
| `LineNo` | string | SIRA NO |
| `ItemCode` | string | ÜRÜN KODU |
| `Remark` | string | ÜRÜN CİNSİ |
| `Quantity` | number | MİKTAR (numeric) |
| `Unit` | string | Unit text (`Adet`, …) |
| `UnitPrice` | number | BİRİM FİYAT |
| `TaxRate` | string | KDV ORANI |
| `TaxAmount` | number | KDV TUTARI |
| `TaxableAmount` | number | TUTAR (ex-VAT) |
| `GrossAmount` | number | Taxable + VAT |
| `AccountID` | string | JDE account (often empty) |
| `Subledger` | number \| string | JDE subledger |
| `AssetID` | string | |
| `PolarisProjectNo` | string | |
| `Subchannel` | string | |
| `PolarisCostCenter` | string | |
| `PaymentTermsCode` | string | |
| `TaxExplanationCode` | string | |

Turkish amounts like `343.884,70` are normalized to `343884.7`.  
Dates like `31-03-2026` become `2026-03-31`.

---

## Full OCR envelope (debug)

```bash
curl -X POST "https://arcon-oc.fly-work.com/api/ocr" \
  -F "file=@./invoice.pdf" \
  -F "profile=none" \
  -F "responseMode=full"
```

Returns:

```json
{
  "ok": true,
  "provider": "mistral-ocr",
  "input": { "fileName": "...", "detectedType": "pdf", "sizeBytes": 123 },
  "result": {
    "text": "...",
    "markdown": "...",
    "pages": [ ... ],
    "pageCount": 1,
    "documentAnnotation": null
  },
  "meta": { "durationMs": 2800, "model": "mistral-ocr-latest", "warnings": [], "profile": null },
  "error": null
}
```

---

## Error codes

Errors always use the envelope `{ "ok": false, "error": { "code", "message" }, ... }`.

| `error.code` | HTTP | Meaning |
|--------------|------|---------|
| `NO_INPUT` | 400 | Missing file / url / base64 |
| `INVALID_INPUT` | 400 | Bad input |
| `EMPTY_FILE` | 400 | Empty file |
| `INVALID_PROFILE` | 400 | Unknown profile |
| `SSRF_BLOCKED` | 400 | Private/local URL blocked |
| `UNAUTHORIZED` | 401 | Missing/invalid API token |
| `UNSUPPORTED_FILE_TYPE` | 415 | Unsupported type |
| `FILE_TOO_LARGE` | 413 | Over size limit |
| `RATE_LIMITED` | 429 | Client rate limit |
| `MISTRAL_RATE_LIMITED` | 429 | Upstream rate limit |
| `PROVIDER_NOT_CONFIGURED` | 503 | Missing Mistral key |
| `MISTRAL_REQUEST_FAILED` | 502 | Upstream OCR failure |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Examples

See [How to call the API](#how-to-call-the-api) for cURL, Node.js, Python, Java, and C#.

---

## Best practices

1. Use **multipart** upload for PDFs; avoid large base64 bodies.
2. Set client timeout to **at least 180s**.
3. Expect missing JDE-only fields (`AccountID`, …) as `""` when not printed on the invoice.
5. On `429`, retry with exponential backoff.
6. Use `responseMode=full` only for debugging OCR quality.

---

## Server environment (ops)

| Variable | Default | Description |
|----------|---------|-------------|
| `MISTRAL_API_KEY` | — | Required for invoice extraction |
| `OCR_DEFAULT_PROFILE` | `jde_invoice` | Default profile |
| `API_AUTH_TOKEN` | — | API Bearer / X-API-Key token (set in production) |
| `OCR_MAX_FILE_SIZE_MB` | `25` | Upload limit |
| `RATE_LIMIT_MAX` | `30` | Requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Window (15 min) |

---

Fly Work · Arcon OCR API v1.0
