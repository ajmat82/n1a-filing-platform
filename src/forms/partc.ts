import { ValidationResult, ValidationIssue } from '../core/types';

// ============================================================================
// Form N-1A Part C — Other Information (Item 28 exhibits + signatures).
// Grounded in Form N-1A Item 28 (a)–(q) and 17 CFR 239.15A signature rules.
// ============================================================================

// Canonical Item 28 exhibit list. `required` marks the ones a live registration
// statement is expected to carry (attached or incorporated by reference).
export const EXHIBIT_CATALOG: { code: string; description: string; required: boolean }[] = [
  { code: 'a', description: 'Articles of incorporation / Declaration of Trust', required: true },
  { code: 'b', description: 'By-laws', required: true },
  { code: 'c', description: 'Instruments defining rights of security holders', required: false },
  { code: 'd', description: 'Investment advisory contracts (and sub-advisory agreements)', required: true },
  { code: 'e', description: 'Underwriting / distribution contracts', required: true },
  { code: 'f', description: 'Bonus / profit-sharing / pension contracts', required: false },
  { code: 'g', description: 'Custodian agreements', required: true },
  { code: 'h', description: 'Other material contracts (transfer agency, administration, expense-limitation)', required: false },
  { code: 'i', description: 'Legal opinion and consent (legality of shares)', required: true },
  { code: 'j', description: 'Other opinions / consents — independent auditor consent', required: true },
  { code: 'k', description: 'Omitted financial statements', required: false },
  { code: 'l', description: 'Initial-capital / seed agreements', required: false },
  { code: 'm', description: 'Rule 12b-1 distribution plan', required: false },
  { code: 'n', description: 'Rule 18f-3 multi-class plan', required: false },
  { code: 'p', description: 'Codes of ethics (Rule 17j-1)', required: true },
  { code: 'q', description: 'Powers of attorney', required: false },
];

export type SignatureCapacity =
  | 'Principal Executive Officer'
  | 'Principal Financial Officer'
  | 'Principal Accounting Officer'
  | 'Trustee'
  | 'Registrant'
  | 'Other';

export interface Exhibit {
  code: string;
  description?: string;
  attached?: boolean;
  incorporatedByReference?: boolean;
}

export interface Signature {
  name: string;
  title?: string;
  capacity?: SignatureCapacity;
  viaPOA?: boolean;
  date?: string;
}

export interface PartCData {
  exhibits?: Exhibit[];
  signatures?: Signature[];
  totalTrustees?: number; // for the majority-of-board check
  controlledPersons?: { name: string; pctVotingOwned?: number }[]; // Item 27
  principalUnderwriter?: { name?: string; isAffiliated?: boolean }; // Item "Principal Underwriters"
  recordsLocations?: { name?: string; address?: string }[]; // Item 30
}

export function checkPartC(data: PartCData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, field: string, message: string) => errors.push({ code, field, message });
  const warn = (code: string, field: string, message: string) => warnings.push({ code, field, message });
  data = data || {};

  const exhibits = data.exhibits || [];
  const present = (code: string) => exhibits.some((e) => e.code === code && (e.attached || e.incorporatedByReference));

  // Required exhibits must be attached or incorporated by reference.
  EXHIBIT_CATALOG.filter((x) => x.required).forEach((x) => {
    if (!present(x.code)) {
      err('C_EXHIBIT_MISSING', 'exhibits', `Item 28(${x.code}) — ${x.description} is required (attach or incorporate by reference).`);
    }
  });

  // Signature capacity checks (17 CFR 239.15A).
  const sigs = data.signatures || [];
  const hasCap = (c: SignatureCapacity) => sigs.some((s) => s.capacity === c);
  if (sigs.length === 0) {
    err('C_NO_SIGNATURES', 'signatures', 'The registration statement must be signed.');
  } else {
    if (!hasCap('Principal Executive Officer')) err('C_NO_PEO', 'signatures', 'A principal executive officer must sign.');
    if (!hasCap('Principal Financial Officer')) err('C_NO_PFO', 'signatures', 'A principal financial officer must sign.');
    if (!hasCap('Principal Accounting Officer')) warn('C_NO_PAO', 'signatures', 'A principal accounting officer / comptroller should sign (may be combined with the PFO capacity).');

    const trusteeSigners = sigs.filter((s) => s.capacity === 'Trustee').length;
    if (data.totalTrustees && data.totalTrustees > 0) {
      if (trusteeSigners / data.totalTrustees <= 0.5) {
        err('C_BOARD_MAJORITY', 'signatures', `Only ${trusteeSigners} of ${data.totalTrustees} trustees signed — a majority of the board must sign.`);
      }
    } else if (trusteeSigners === 0) {
      warn('C_NO_TRUSTEE_SIG', 'signatures', 'No trustee signatures found — a majority of the board must sign.');
    }

    // Any power-of-attorney signature requires Exhibit (q).
    if (sigs.some((s) => s.viaPOA) && !present('q')) {
      err('C_POA_NO_EXHIBIT', 'signatures', 'A signature is made via power of attorney but Exhibit 28(q) (powers of attorney) is not filed.');
    }
    sigs.forEach((s, i) => {
      if (!s.name) err('C_SIG_NAME', 'signatures', `Signature #${i + 1}: name is required.`);
      if (!s.date) warn('C_SIG_DATE', 'signatures', `${s.name || `Signature #${i + 1}`}: signature date is missing.`);
    });
  }

  // Item 27 control check
  (data.controlledPersons || []).forEach((c) => {
    if (c.pctVotingOwned !== undefined && c.pctVotingOwned <= 25) {
      warn('C_CONTROL_25', 'controlledPersons', `${c.name || 'Entity'} listed under Item 27 but ${c.pctVotingOwned}% voting ownership is below the >25% control presumption.`);
    }
  });

  return { isValid: errors.length === 0, errors, warnings };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generatePartC(data: PartCData, fundName = 'the Registrant'): { html: string; facts: number } {
  data = data || {};
  let facts = 0;
  const exhibitRows = EXHIBIT_CATALOG.map((x) => {
    const e = (data.exhibits || []).find((ex) => ex.code === x.code);
    const status = e?.attached ? 'Filed herewith' : e?.incorporatedByReference ? 'Incorporated by reference' : '—';
    if (e?.attached || e?.incorporatedByReference) facts++;
    return `<tr><td>(${x.code})</td><td>${esc(x.description)}</td><td>${status}</td></tr>`;
  }).join('');
  const sigRows = (data.signatures || []).map((s) => {
    facts++;
    return `<tr><td>${esc(s.name)}</td><td>${esc(s.title || '—')}</td><td>${esc(s.capacity || '—')}${s.viaPOA ? ' (by POA)' : ''}</td><td>${esc((s.date || '').slice(0, 10))}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(fundName)} — Part C</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px}h1{border-bottom:3px double #333}h2{font-size:15px;text-transform:uppercase;border-bottom:1px solid #ccc;margin-top:28px}table{border-collapse:collapse;width:100%;font-family:Arial;font-size:12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#f0f0f0}</style></head><body>
<h1>Part C — Other Information</h1><p><strong>${esc(fundName)}</strong></p>
<h2>Item 28 — Exhibits</h2>
<table><thead><tr><th>Exhibit</th><th>Description</th><th>Status</th></tr></thead><tbody>${exhibitRows}</tbody></table>
<h2>Signatures</h2>
<table><thead><tr><th>Name</th><th>Title</th><th>Capacity</th><th>Date</th></tr></thead><tbody>${sigRows || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
</body></html>`;
  return { html, facts };
}
