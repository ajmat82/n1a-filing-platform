import { ValidationResult, ValidationIssue } from '../core/types';

// ============================================================================
// Form N-1A Part B — Statement of Additional Information (SAI), Items 17–29.
// Representative subset of the full item set, grounded in Form N-1A, the 2004
// portfolio-manager disclosure release, and Rule 6c-11.
// ============================================================================

// SEC-standardized equity-ownership dollar bands (Items 19(c) & 22). The 5-band
// floor plus the extended bands used for complex-aggregate / PM columns.
export const OWNERSHIP_BANDS = [
  'None',
  '$1 - $10,000',
  '$10,001 - $50,000',
  '$50,001 - $100,000',
  '$100,001 - $500,000',
  '$500,001 - $1,000,000',
  'Over $1,000,000',
] as const;
export type OwnershipBand = (typeof OWNERSHIP_BANDS)[number];

export interface Trustee {
  name: string;
  birthYear?: number;
  isInterested: boolean;
  position?: string;
  lengthServed?: string;
  principalOccupation?: string;
  numPortfoliosOverseen?: number;
  otherDirectorships?: string;
  ownershipInFund?: OwnershipBand;
  ownershipInComplex?: OwnershipBand;
}

export interface SAIPortfolioManager {
  name: string;
  ricAccounts?: { num?: number; assets?: number };
  pooledAccounts?: { num?: number; assets?: number };
  otherAccounts?: { num?: number; assets?: number };
  materialConflicts?: string;
  compensationStructure?: string;
  ownershipOfFund?: OwnershipBand;
}

export interface SAIData {
  // Item 17
  dateOrganized?: string;
  stateOfOrganization?: string;
  entityForm?: string;
  formerNames?: string[];
  // Item 18
  classification?: 'diversified' | 'non-diversified';
  fundamentalPolicies?: { category: string; text: string }[];
  concentrationIndustry?: string;
  portfolioHoldingsPolicy?: string;
  // Item 19
  trustees?: Trustee[];
  officers?: { name: string; position?: string; principalOccupation?: string }[];
  boardLeadershipStructure?: string;
  committees?: { name: string; members?: string }[];
  ownershipAsOfDate?: string;
  // Item 20
  controlPersons?: { name: string; ownershipPct?: number; natureOfControl?: string }[];
  principalHolders?: { name: string; pct?: number; ownershipType?: 'record' | 'beneficial'; shareClass?: string }[];
  // Item 21
  adviserName?: string;
  adviserAffiliated?: boolean;
  advisoryFeeSchedule?: { breakpoint?: number; rate?: number }[];
  feeWaiverCap?: number;
  feeWaiverExpiration?: string;
  subAdvisers?: { name: string; paidBy?: 'adviser' | 'fund' }[];
  distribution12b1Fee?: number;
  // Item 22
  portfolioManagers?: SAIPortfolioManager[];
  // Item 23
  softDollarArrangements?: boolean;
  brokerageCommissionsByYear?: { fiscalYear?: string; total?: number }[];
  affiliatedBrokerUsed?: boolean;
  // Item 24 / 25
  votingRights?: string;
  navPricingTime?: string;
  fairValuePolicy?: string;
  isETF?: boolean;
  creationUnitSize?: number;
  authorizedParticipantsDesc?: string;
  redemptionInKind?: boolean;
  // Item 26
  ricQualified?: boolean;
  taxYearEnd?: string;
  // Item 28 / proxy
  performanceMethodology?: string;
  proxyVotingDelegatedTo?: 'adviser' | 'sub-adviser' | 'third-party';
  proxyVotingPolicy?: string;
  financialsIncorporatedByReference?: boolean;
}

export function checkSAI(data: SAIData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, field: string, message: string) => errors.push({ code, field, message });
  const warn = (code: string, field: string, message: string) => warnings.push({ code, field, message });
  data = data || {};

  // Item 17
  if (!data.dateOrganized) warn('SAI_HISTORY', 'dateOrganized', 'Item 17: date/state of organization should be disclosed.');
  if (!data.stateOfOrganization) warn('SAI_STATE', 'stateOfOrganization', 'Item 17: state of organization is required.');

  // Item 18
  if (!data.classification) warn('SAI_CLASS', 'classification', 'Item 18: diversified/non-diversified classification is required.');
  if (!data.fundamentalPolicies || data.fundamentalPolicies.length === 0) {
    warn('SAI_FUND_POLICIES', 'fundamentalPolicies', 'Item 18: fundamental investment policies (borrowing, senior securities, concentration, lending, etc.) are required.');
  }

  // Item 19 — trustees + ownership bands
  const trustees = data.trustees || [];
  if (trustees.length === 0) {
    err('SAI_NO_TRUSTEES', 'trustees', 'Item 19: a board of trustees/directors must be disclosed.');
  } else {
    const indep = trustees.filter((t) => !t.isInterested).length;
    if (indep / trustees.length < 0.5) {
      warn('SAI_BOARD_INDEP', 'trustees', `Only ${indep}/${trustees.length} trustees are independent — a majority-independent board is expected under the 1940 Act.`);
    }
    trustees.forEach((t, i) => {
      const label = t.name || `Trustee #${i + 1}`;
      if (!t.name) err('SAI_TRUSTEE_NAME', 'trustees', `Trustee #${i + 1}: name is required.`);
      [['ownershipInFund', t.ownershipInFund], ['ownershipInComplex', t.ownershipInComplex]].forEach(([field, band]) => {
        if (band === undefined) {
          warn('SAI_OWN_BAND', 'trustees', `${label}: Item 19(c) requires a dollar-range of shares owned (${field}).`);
        } else if (!OWNERSHIP_BANDS.includes(band as OwnershipBand)) {
          err('SAI_OWN_BAND_INVALID', 'trustees', `${label}: "${band}" is not a valid SEC ownership band.`);
        }
      });
    });
    if (!data.ownershipAsOfDate) warn('SAI_AS_OF', 'ownershipAsOfDate', 'Item 19(c)/20: ownership tables require an "as of" date.');
  }

  // Item 20 — control persons & principal holders
  (data.controlPersons || []).forEach((c) => {
    if (c.ownershipPct !== undefined && c.ownershipPct <= 25) {
      warn('SAI_CONTROL_25', 'controlPersons', `${c.name || 'Control person'} is listed as a control person but owns ${c.ownershipPct}% — control is presumed at >25%.`);
    }
  });
  (data.principalHolders || []).forEach((h) => {
    if (h.pct !== undefined && h.pct < 5) {
      warn('SAI_HOLDER_5', 'principalHolders', `${h.name || 'Holder'} owns ${h.pct}% — only holders of ≥5% of a class need be listed as principal holders.`);
    }
  });

  // Item 21 — adviser & advisory agreement
  if (!data.adviserName) err('SAI_NO_ADVISER', 'adviserName', 'Item 21: the investment adviser must be identified.');
  if (!data.advisoryFeeSchedule || data.advisoryFeeSchedule.length === 0) {
    warn('SAI_NO_FEE_SCHED', 'advisoryFeeSchedule', 'Item 21: the advisory fee schedule (rate / breakpoints) is required.');
  }
  if (data.feeWaiverCap !== undefined && !data.feeWaiverExpiration) {
    warn('SAI_WAIVER_EXP', 'feeWaiverExpiration', 'Item 21: a contractual expense cap should disclose its expiration date.');
  }

  // Item 22 — portfolio managers
  (data.portfolioManagers || []).forEach((pm, i) => {
    const label = pm.name || `PM #${i + 1}`;
    if (!pm.name) err('SAI_PM_NAME', 'portfolioManagers', `Portfolio manager #${i + 1}: name is required.`);
    if (!pm.materialConflicts) warn('SAI_PM_CONFLICT', 'portfolioManagers', `${label}: Item 22 requires disclosure of material conflicts of interest (side-by-side management, performance fees).`);
    if (pm.ownershipOfFund === undefined) warn('SAI_PM_OWN', 'portfolioManagers', `${label}: Item 22 requires the PM's dollar-range of fund-share ownership.`);
    else if (!OWNERSHIP_BANDS.includes(pm.ownershipOfFund)) err('SAI_PM_OWN_INVALID', 'portfolioManagers', `${label}: "${pm.ownershipOfFund}" is not a valid ownership band.`);
    if (!pm.compensationStructure) warn('SAI_PM_COMP', 'portfolioManagers', `${label}: Item 22 requires a description of the PM's compensation structure.`);
  });

  // Item 25 — ETF mechanics
  if (data.isETF) {
    if (data.creationUnitSize === undefined) warn('SAI_CU_SIZE', 'creationUnitSize', 'Item 25 (ETF): creation-unit size should be disclosed.');
    if (!data.authorizedParticipantsDesc) warn('SAI_AP_DESC', 'authorizedParticipantsDesc', 'Item 25 (ETF): the authorized-participant / creation-redemption process should be described.');
  }

  // Item 26 — taxation
  if (data.ricQualified === undefined) warn('SAI_RIC', 'ricQualified', 'Item 26: disclose whether the Fund intends to qualify as a RIC under Subchapter M.');

  // Proxy voting
  if (!data.proxyVotingDelegatedTo) warn('SAI_PROXY', 'proxyVotingDelegatedTo', 'Proxy voting policies and delegation (adviser / sub-adviser / third-party) must be disclosed.');

  return { isValid: errors.length === 0, errors, warnings };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateSAI(data: SAIData, fundName = 'the Fund'): { html: string; facts: number } {
  data = data || {};
  let facts = 0;
  const f = (v: unknown): string => { if (v === undefined || v === null || v === '') return '—'; facts++; return esc(v); };

  const trusteeRows = (data.trustees || []).map((t) =>
    `<tr><td>${esc(t.name)}</td><td>${t.isInterested ? 'Interested' : 'Independent'}</td><td>${esc(t.position || '—')}</td><td>${esc(t.numPortfoliosOverseen ?? '—')}</td><td>${esc(t.ownershipInFund || '—')}</td><td>${esc(t.ownershipInComplex || '—')}</td></tr>`
  ).join('');

  const pmRows = (data.portfolioManagers || []).map((pm) =>
    `<tr><td>${esc(pm.name)}</td><td>${esc(pm.ricAccounts?.num ?? 0)} / ${esc(pm.pooledAccounts?.num ?? 0)} / ${esc(pm.otherAccounts?.num ?? 0)}</td><td>${esc(pm.ownershipOfFund || '—')}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(fundName)} — SAI</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a1a1a}h1{border-bottom:3px double #333}h2{font-size:15px;text-transform:uppercase;border-bottom:1px solid #ccc;margin-top:28px}table{border-collapse:collapse;width:100%;font-family:Arial;font-size:12px;margin:8px 0}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#f0f0f0}</style></head><body>
<h1>Statement of Additional Information</h1>
<p><strong>${esc(fundName)}</strong></p>
<h2>Item 17 — Fund History</h2><p>Organized as a ${f(data.entityForm)} under the laws of ${f(data.stateOfOrganization)} on ${f((data.dateOrganized || '').slice(0,10))}.</p>
<h2>Item 18 — Classification & Policies</h2><p>Classification: ${f(data.classification)}. Fundamental policies on file: ${f((data.fundamentalPolicies||[]).length || '')}.</p>
<h2>Item 19 — Board of Trustees</h2>
<table><thead><tr><th>Name</th><th>Status</th><th>Position</th><th># Portfolios</th><th>Owns (Fund)</th><th>Owns (Complex)</th></tr></thead><tbody>${trusteeRows || '<tr><td colspan="6">—</td></tr>'}</tbody></table>
<p class="meta">Ownership as of ${f((data.ownershipAsOfDate||'').slice(0,10))}.</p>
<h2>Item 20 — Control Persons & Principal Holders</h2><p>Control persons: ${f((data.controlPersons||[]).length || '')}; principal (≥5%) holders: ${f((data.principalHolders||[]).length || '')}.</p>
<h2>Item 21 — Investment Adviser</h2><p>Adviser: ${f(data.adviserName)}${data.adviserAffiliated ? ' (affiliated)' : ''}. Fee breakpoints: ${f((data.advisoryFeeSchedule||[]).length || '')}.</p>
<h2>Item 22 — Portfolio Managers</h2>
<table><thead><tr><th>Name</th><th>Other accounts (RIC/Pooled/Other)</th><th>Owns Fund</th></tr></thead><tbody>${pmRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
<h2>Item 25 — Purchase, Redemption & Pricing</h2><p>NAV struck at ${f(data.navPricingTime)}.${data.isETF ? ` ETF creation unit: ${f(data.creationUnitSize)} shares.` : ''}</p>
<h2>Item 26 — Taxation</h2><p>Intends to qualify as a RIC (Subchapter M): ${f(data.ricQualified === undefined ? '' : (data.ricQualified ? 'Yes' : 'No'))}.</p>
<h2>Proxy Voting</h2><p>Proxy voting delegated to: ${f(data.proxyVotingDelegatedTo)}. Voting record available via Form N-PX.</p>
</body></html>`;

  return { html, facts };
}
