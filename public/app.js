const $ = (sel) => document.querySelector(sel);

const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const pickBtn = $('#pick-btn');
const fileNameEl = $('#file-name');
const urlInput = $('#url-input');
const providerSelect = $('#provider-select');
const submitBtn = $('#submit-btn');

const pagesInput = $('#pages-input');
const includeImagesInput = $('#include-images-input');
const schemaNameInput = $('#schema-name-input');
const schemaInput = $('#schema-input');
const profileSelect = $('#profile-select');
const structuredOnlyInput = $('#structured-only-input');
const apiTokenInput = $('#api-token-input');

const emptyState = $('#empty-state');
const loading = $('#loading');
const resultBox = $('#result');
const errorBox = $('#error-box');
const pageNav = $('#page-nav');
const pageSelect = $('#page-select');

const TOKEN_STORAGE_KEY = 'arcon_ocr_api_token';

let selectedFile = null;
let lastResult = null;
let currentPageSelection = 'all';
let activeTab = 'render';
let authRequired = false;

init();

async function init() {
  const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (saved) apiTokenInput.value = saved;

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const badge = $('#status-badge');
    authRequired = Boolean(data.authRequired);
    const parts = [];
    if (data.mistralConfigured) parts.push('Mistral OCR aktif');
    else parts.push('MISTRAL_API_KEY yok');
    if (authRequired) parts.push('auth zorunlu');
    else parts.push('auth kapalı');
    badge.textContent = parts.join(' · ');
    badge.classList.add(data.mistralConfigured ? 'ok' : 'warn');
  } catch {
    $('#status-badge').textContent = 'sunucuya bağlanılamadı';
  }

  apiTokenInput.addEventListener('change', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, apiTokenInput.value.trim());
  });

  pickBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

  ['dragover', 'dragenter'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    }),
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    }),
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files?.[0];
    if (file) setFile(file);
  });

  urlInput.addEventListener('input', () => {
    if (urlInput.value.trim()) {
      selectedFile = null;
      fileNameEl.textContent = '';
    }
  });

  submitBtn.addEventListener('click', runOcr);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${activeTab}`).classList.add('active');
    });
  });

  pageSelect.addEventListener('change', () => {
    currentPageSelection = pageSelect.value === 'all' ? 'all' : Number(pageSelect.value);
    renderTabContents();
  });
  $('#page-prev').addEventListener('click', () => stepPage(-1));
  $('#page-next').addEventListener('click', () => stepPage(1));

  $('#copy-btn').addEventListener('click', copyActiveTab);
  $('#download-txt').addEventListener('click', () => downloadCombined('text', 'ocr-sonuc.txt', 'text/plain'));
  $('#download-md').addEventListener('click', () => downloadCombined('markdown', 'ocr-sonuc.md', 'text/markdown'));
  $('#download-json').addEventListener('click', () => {
    if (!lastResult) return;
    downloadBlob(JSON.stringify(lastResult, null, 2), 'ocr-sonuc.json', 'application/json');
  });
}

function stepPage(delta) {
  if (!lastResult) return;
  const count = lastResult.result.pageCount;
  const current = currentPageSelection === 'all' ? -1 : currentPageSelection;
  const next = Math.min(Math.max(current + delta, 0), count - 1);
  currentPageSelection = next;
  pageSelect.value = String(next);
  renderTabContents();
}

function setFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : '';
  if (file) urlInput.value = '';
}

function parsePagesInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const pages = new Set();
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((n) => parseInt(n, 10));
      if (Number.isInteger(start) && Number.isInteger(end)) {
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) pages.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isInteger(n)) pages.add(n);
    }
  }
  return pages.size ? [...pages].sort((a, b) => a - b) : undefined;
}

async function runOcr() {
  if (!selectedFile && !urlInput.value.trim()) {
    alert('Bir dosya seçin ya da URL girin.');
    return;
  }

  let schema;
  if (!profileSelect.value && schemaInput.value.trim()) {
    try {
      const parsed = JSON.parse(schemaInput.value);
      schema = JSON.stringify({ name: schemaNameInput.value.trim() || undefined, schema: parsed });
    } catch {
      alert('JSON Schema geçersiz. Lütfen düzeltip tekrar deneyin.');
      return;
    }
  }

  const pages = parsePagesInput(pagesInput.value);
  const includeImages = includeImagesInput.checked;
  const profile = profileSelect.value || 'jde_invoice';
  // Profil none ise full zarf; aksi halde checkbox'a göre
  const responseMode =
    profile === 'none' ? 'full' : structuredOnlyInput.checked ? 'structured' : 'full';

  const apiToken = apiTokenInput.value.trim();
  if (authRequired && !apiToken) {
    alert('Bu sunucuda API token zorunlu. Token alanını doldurun.');
    return;
  }
  if (apiToken) localStorage.setItem(TOKEN_STORAGE_KEY, apiToken);
  const authHeaders = apiToken ? { Authorization: `Bearer ${apiToken}` } : {};

  emptyState.hidden = true;
  errorBox.hidden = true;
  resultBox.hidden = true;
  loading.hidden = false;
  submitBtn.disabled = true;

  try {
    let res;
    if (selectedFile) {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('provider', providerSelect.value);
      form.append('profile', profile);
      form.append('responseMode', responseMode);
      if (pages) form.append('pages', JSON.stringify(pages));
      if (includeImages) form.append('includeImages', 'true');
      if (schema) form.append('schema', schema);
      res = await fetch('/api/ocr', { method: 'POST', headers: authHeaders, body: form });
    } else {
      res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          url: urlInput.value.trim(),
          provider: providerSelect.value,
          pages,
          includeImages,
          schema: schema ? JSON.parse(schema) : undefined,
          profile,
          responseMode,
        }),
      });
    }

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    renderError({ code: 'NETWORK_ERROR', message: err.message });
  } finally {
    loading.hidden = true;
    submitBtn.disabled = false;
  }
}

function isStructuredInvoice(data) {
  return Boolean(
    data &&
    data.ok === undefined &&
    !data.error &&
    (Object.prototype.hasOwnProperty.call(data, 'InvoiceNumber') ||
      Object.prototype.hasOwnProperty.call(data, 'InvoiceLines')),
  );
}

function renderResult(data) {
  // JDE structured yanıt: yalnızca JSON göster, OCR zarfı uydurma
  if (isStructuredInvoice(data)) {
    lastResult = data;
    errorBox.hidden = true;
    resultBox.hidden = false;
    pageNav.hidden = true;

    $('#meta-provider').textContent = 'JDE fatura';
    $('#meta-type').textContent = '';
    $('#meta-pages').textContent = Array.isArray(data.InvoiceLines)
      ? `satır: ${data.InvoiceLines.length}`
      : '';
    $('#meta-duration').textContent = '';
    $('#warnings').textContent = '';

    const json = JSON.stringify(data, null, 2);
    $('#tab-text').textContent = json;
    $('#tab-markdown').textContent = json;
    $('#tab-json').textContent = json;
    $('#tab-annotation').textContent = json;
    $('#tab-render').innerHTML = `<pre>${escapeHtml(json)}</pre>`;
    $('#tab-tables').innerHTML = '<p class="placeholder-text">Structured mod — tablo yok.</p>';
    $('#tab-images').innerHTML = '<p class="placeholder-text">Structured mod — görsel yok.</p>';

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    const jsonBtn = document.querySelector('.tab-btn[data-tab="json"]');
    if (jsonBtn) jsonBtn.classList.add('active');
    $('#tab-json').classList.add('active');
    activeTab = 'json';
    return;
  }

  if (!data.ok) {
    renderError(data.error, data);
    return;
  }

  lastResult = data;
  currentPageSelection = 'all';
  errorBox.hidden = true;
  resultBox.hidden = false;

  $('#meta-provider').textContent = `motor: ${data.provider}`;
  $('#meta-type').textContent = `tür: ${data.input.detectedType}`;
  $('#meta-pages').textContent = `sayfa: ${data.result.pageCount}`;
  $('#meta-duration').textContent = `${data.meta.durationMs} ms`;

  $('#warnings').textContent = (data.meta.warnings || []).join(' ');

  pageSelect.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = `Tüm sayfalar (${data.result.pageCount})`;
  pageSelect.appendChild(allOpt);
  data.result.pages.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = String(p.index);
    opt.textContent = `Sayfa ${p.index + 1}`;
    pageSelect.appendChild(opt);
  });
  pageSelect.value = 'all';
  pageNav.hidden = data.result.pageCount <= 1;

  renderTabContents();
}

function getSelectedPages() {
  if (!lastResult) return [];
  if (isStructuredInvoice(lastResult)) return [];
  if (currentPageSelection === 'all') return lastResult.result.pages;
  const page = lastResult.result.pages.find((p) => p.index === currentPageSelection);
  return page ? [page] : [];
}

function renderTabContents() {
  const pages = getSelectedPages();
  const combinedText = pages.map((p) => p.text).join('\n\n');
  const combinedMarkdown = pages.map((p) => p.markdown).join('\n\n');

  $('#tab-text').textContent = combinedText || '(metin bulunamadı)';
  $('#tab-markdown').textContent = combinedMarkdown || '(markdown yok)';
  $('#tab-json').textContent = JSON.stringify(lastResult, null, 2);

  renderMarkdownTab(combinedMarkdown);
  renderTablesTab(pages);
  renderImagesTab(pages);
  renderAnnotationTab();
}

function renderMarkdownTab(markdown) {
  const target = $('#tab-render');
  if (!markdown) {
    target.innerHTML = '<p class="placeholder-text">Görüntülenecek içerik yok.</p>';
    return;
  }
  const html = window.marked ? window.marked.parse(markdown) : escapeHtml(markdown);
  target.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html) : escapeHtml(markdown);
}

function renderTablesTab(pages) {
  const target = $('#tab-tables');
  const cards = [];
  for (const page of pages) {
    for (const table of page.tables || []) {
      const html = table.format === 'html' ? table.content : (window.marked ? window.marked.parse(table.content) : table.content);
      const safe = window.DOMPurify ? window.DOMPurify.sanitize(html) : escapeHtml(html);
      cards.push(`<div class="table-card"><h4>Sayfa ${page.index + 1} · ${table.id}</h4>${safe}</div>`);
    }
  }
  target.innerHTML = cards.length ? cards.join('') : '<p class="placeholder-text">Bu seçimde tablo bulunamadı.</p>';
}

function renderImagesTab(pages) {
  const target = $('#tab-images');
  const cards = [];
  for (const page of pages) {
    for (const img of page.images || []) {
      const coords = `(${img.topLeftX ?? '?'}, ${img.topLeftY ?? '?'}) → (${img.bottomRightX ?? '?'}, ${img.bottomRightY ?? '?'})`;
      if (img.base64) {
        const src = img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`;
        cards.push(
          `<div class="image-card"><h4>Sayfa ${page.index + 1} · ${img.id}</h4><img src="${src}" alt="${img.id}" /><div class="coords">${coords}</div></div>`,
        );
      } else {
        cards.push(
          `<div class="image-card"><h4>Sayfa ${page.index + 1} · ${img.id}</h4><div class="coords">${coords} — base64 dahil edilmedi. "Sayfa içi görselleri de çıkar" seçeneğini işaretleyin.</div></div>`,
        );
      }
    }
  }
  target.innerHTML = cards.length
    ? `<div class="image-grid">${cards.join('')}</div>`
    : '<p class="placeholder-text">Bu seçimde görsel bulunamadı.</p>';
}

function renderAnnotationTab() {
  const target = $('#tab-annotation');
  const annotation = lastResult?.result?.documentAnnotation;
  target.textContent = annotation
    ? JSON.stringify(annotation, null, 2)
    : 'Belge geneli yapılandırılmış çıktı istenmedi. Gelişmiş seçeneklerden bir JSON Schema girip tekrar deneyin.';
}

function copyActiveTab() {
  const el = $(`#tab-${activeTab}`);
  const text = el.tagName === 'PRE' ? el.textContent : el.innerText;
  navigator.clipboard?.writeText(text).then(
    () => flashButton($('#copy-btn'), 'Kopyalandı ✓'),
    () => flashButton($('#copy-btn'), 'Kopyalanamadı'),
  );
}

function flashButton(btn, label) {
  const original = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = original; }, 1500);
}

function downloadCombined(field, filename, mime) {
  if (!lastResult) return;
  if (isStructuredInvoice(lastResult)) {
    downloadBlob(JSON.stringify(lastResult, null, 2), 'jde-fatura.json', 'application/json');
    return;
  }
  const pages = getSelectedPages();
  const content = pages.map((p) => p[field]).join('\n\n');
  downloadBlob(content, filename, mime);
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderError(error, fullData) {
  resultBox.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = `[${error?.code || 'ERROR'}] ${error?.message || 'Bilinmeyen hata'}` +
    (fullData ? `\n\n${JSON.stringify(fullData, null, 2)}` : '');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
