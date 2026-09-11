import { PROFILE_ID as JDE_INVOICE, getJdeInvoiceSchemaOptions, buildJdeInvoicePayload } from './jdeInvoice.js';

const PROFILES = {
  [JDE_INVOICE]: {
    id: JDE_INVOICE,
    label: 'JDE Fatura',
    getSchema: getJdeInvoiceSchemaOptions,
    buildPayload: buildJdeInvoicePayload,
  },
};

export function listProfiles() {
  return Object.values(PROFILES).map(({ id, label }) => ({ id, label }));
}

export function resolveProfile(profileId) {
  if (!profileId) return null;
  const key = String(profileId).trim().toLowerCase();
  return PROFILES[key] || null;
}

export { JDE_INVOICE, buildJdeInvoicePayload, getJdeInvoiceSchemaOptions };
