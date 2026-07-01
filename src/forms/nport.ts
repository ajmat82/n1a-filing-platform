import { ValidationResult, ValidationIssue } from '../core/types';

// ============================================================================
// Form N-PORT (NPORT-P) — monthly portfolio-holdings report (structured XML).
// Representative subset: fund-level totals/returns/flows (Part B) plus the
// per-position schedule (Part C). Grounded in Form N-PORT and General
// Instruction F (confidentiality). Note: only the 3rd month of each fiscal
// quarter is public; certain items are always non-public.
// ============================================================================

export const HOLDING_UNITS = ['NS', 'PA', 'NC', 'OU'] as const;       // shares / principal / contracts / other
export const PAYOFF_PROFILES = ['Long', 'Short', 'N/A'] as const;
export const FAIR_VALUE_LEVELS = ['1', '2', '3', 'N/A'] as const;
export const LIQUIDITY_BUCKETS = ['Highly Liquid', 'Moderately Liquid', 'Less Liquid', 'Illiquid'] as const;

export interface NPortHolding {
  issuerName?: string;
  lei?: string;
  title?: string;
  cusip?: string;
  isin?: string;
  ticker?: string;
  balance?: number;
  units?: (typeof HOLDING_UNITS)[number];
  currency?: string;
  valueUSD?: number;
  pctNetAssets?: number;
  payoffProfile?: (typeof PAYOFF_PROFILES)[number];
  assetCategory?: string;
  issuerCategory?: string;
  country?: string;
  isRestricted?: boolean;
  fairValueLevel?: (typeof FAIR_VALUE_LEVELS)[number];
  liquidityClassification?: (typeof LIQUIDITY_BUCKETS)[number]; // confidential
}

export interface NPortData {
  registrantName?: string;
  cik?: string;
  lei?: string;
  seriesName?: string;
  seriesId?: string;
  fiscalYearEnd?: string;
  reportPeriodEnd?: string;
  isFinalFiling?: boolean;
  monthInQuarter?: 1 | 2 | 3; // drives public/non-public treatment
  totalAssets?: number;
  totalLiabilities?: number;
  netAssets?: number;
  monthlyReturns?: number[]; // up to 3 months
  salesFlow?: number;
  reinvestmentFlow?: number;
  redemptionFlow?: number;
  holdings?: NPortHolding[];
  signature?: { name?: string; title?: string; date?: string };
}

const LEI_RE = /^[A-Z0-9]{20}$/i;
const CUSIP_RE = /^[A-Z0-9]{9}$/i;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/i;

export function checkNPort(data: NPortData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, field: string, message: string) => errors.push({ code, field, message });
  const warn = (code: string, field: string, message: string) => warnings.push({ code, field, message });
  data = data || {};

  if (!data.registrantName) err('PORT_NAME', 'registrantName', 'Registrant name is required.');
  if (!data.cik) err('PORT_CIK', 'cik', 'Registrant CIK is required.');
  if (!data.seriesName) warn('PORT_SERIES', 'seriesName', 'Series name should be provided.');
  if (!data.reportPeriodEnd) err('PORT_PERIOD', 'reportPeriodEnd', 'Report period-end date ("as of") is required.');
  if (data.lei && !LEI_RE.test(data.lei)) warn('PORT_LEI', 'lei', 'Registrant LEI should be 20 alphanumeric characters.');

  // Assets/liabilities identity (B.1): net = total assets − total liabilities.
  if (data.totalAssets !== undefined && data.totalLiabilities !== undefined && data.netAssets !== undefined) {
    const implied = data.totalAssets - data.totalLiabilities;
    if (Math.abs(implied - data.netAssets) > Math.max(1, Math.abs(data.netAssets) * 0.001)) {
      err('PORT_NAV_IDENTITY', 'netAssets', `Net assets (${data.netAssets}) ≠ total assets − total liabilities (${implied}).`);
    }
  }

  const holdings = data.holdings || [];
  if (holdings.length === 0) {
    warn('PORT_NO_HOLDINGS', 'holdings', 'No portfolio positions provided — the Schedule of Portfolio Investments (Part C) is normally required.');
  }

  let pctSum = 0;
  holdings.forEach((h, i) => {
    const label = h.issuerName || h.title || `Position #${i + 1}`;
    if (!h.issuerName) err('PORT_H_ISSUER', 'holdings', `Position #${i + 1}: issuer name is required (C.1.a).`);
    if (!h.title) warn('PORT_H_TITLE', 'holdings', `${label}: title/description of the issue is required (C.1.c).`);
    if (!h.cusip && !h.isin && !h.ticker) {
      err('PORT_H_ID', 'holdings', `${label}: at least one identifier (CUSIP, ISIN, or ticker) is required (C.1.d/e).`);
    }
    if (h.cusip && !CUSIP_RE.test(h.cusip)) warn('PORT_H_CUSIP', 'holdings', `${label}: CUSIP should be 9 alphanumeric characters.`);
    if (h.isin && !ISIN_RE.test(h.isin)) warn('PORT_H_ISIN', 'holdings', `${label}: ISIN format looks invalid.`);
    if (h.lei && !LEI_RE.test(h.lei)) warn('PORT_H_LEI', 'holdings', `${label}: issuer LEI should be 20 alphanumeric characters.`);
    if (h.valueUSD === undefined) err('PORT_H_VALUE', 'holdings', `${label}: USD value is required (C.2.c).`);
    if (h.pctNetAssets === undefined) warn('PORT_H_PCT', 'holdings', `${label}: percentage of net assets is required (C.2.d).`);
    else pctSum += h.pctNetAssets;
    if (h.units && !HOLDING_UNITS.includes(h.units)) err('PORT_H_UNITS', 'holdings', `${label}: units must be one of NS/PA/NC/OU.`);
    if (h.fairValueLevel && !FAIR_VALUE_LEVELS.includes(h.fairValueLevel)) err('PORT_H_FVL', 'holdings', `${label}: fair-value level must be 1, 2, 3, or N/A.`);
    if (h.liquidityClassification && !LIQUIDITY_BUCKETS.includes(h.liquidityClassification)) {
      err('PORT_H_LIQ', 'holdings', `${label}: liquidity classification is invalid.`);
    }
  });
  if (pctSum > 105) warn('PORT_PCT_SUM', 'holdings', `Holdings sum to ${pctSum.toFixed(1)}% of net assets — verify values (should approximate 100%).`);

  // Confidentiality reminder (General Instruction F).
  if (data.monthInQuarter && data.monthInQuarter !== 3) {
    warn('PORT_CONFIDENTIAL_MONTH', 'monthInQuarter', `Month ${data.monthInQuarter} of the quarter is non-public — only the 3rd month's report is disclosed publicly.`);
  }
  if (holdings.some((h) => h.liquidityClassification)) {
    warn('PORT_LIQ_CONFIDENTIAL', 'holdings', 'Liquidity classification (C.7) is filed non-public under General Instruction F — it will not appear in the public report.');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateNPort(data: NPortData): { xml: string; facts: number; confidentialFacts: number } {
  data = data || {};
  let facts = 0;
  let confidentialFacts = 0;
  const tag = (name: string, value: unknown, indent = '    ', confidential = false): string => {
    if (value === undefined || value === null || value === '') return '';
    facts++;
    if (confidential) { confidentialFacts++; return `${indent}<${name} confidential="true">${esc(value)}</${name}>\n`; }
    return `${indent}<${name}>${esc(value)}</${name}>\n`;
  };

  const holdingsXml = (data.holdings || []).map((h) =>
    `      <invstOrSec>\n${tag('name', h.issuerName, '        ')}${tag('lei', h.lei, '        ')}${tag('title', h.title, '        ')}${tag('cusip', h.cusip, '        ')}${tag('isin', h.isin, '        ')}${tag('balance', h.balance, '        ')}${tag('units', h.units, '        ')}${tag('curCd', h.currency, '        ')}${tag('valUSD', h.valueUSD, '        ')}${tag('pctVal', h.pctNetAssets, '        ')}${tag('payoffProfile', h.payoffProfile, '        ')}${tag('assetCat', h.assetCategory, '        ')}${tag('issuerCat', h.issuerCategory, '        ')}${tag('invCountry', h.country, '        ')}${tag('isRestrictedSec', h.isRestricted, '        ')}${tag('fairValLevel', h.fairValueLevel, '        ')}${tag('liquidityClassification', h.liquidityClassification, '        ', true)}      </invstOrSec>\n`
  ).join('');

  const returnsXml = (data.monthlyReturns || []).map((r, i) => tag(`monthlyReturn${i + 1}`, r, '      ')).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/nport" submissionType="NPORT-P">
  <genInfo>
${tag('regName', data.registrantName, '    ')}${tag('regCik', data.cik, '    ')}${tag('regLei', data.lei, '    ')}${tag('seriesName', data.seriesName, '    ')}${tag('seriesId', data.seriesId, '    ')}${tag('repPdEnd', (data.reportPeriodEnd || '').slice(0, 10), '    ')}${tag('isFinalFiling', data.isFinalFiling, '    ')}  </genInfo>
  <fundInfo>
${tag('totAssets', data.totalAssets, '    ')}${tag('totLiabs', data.totalLiabilities, '    ')}${tag('netAssets', data.netAssets, '    ')}
    <returnInfo>
${returnsXml}    </returnInfo>
    <flowInfo>
${tag('sales', data.salesFlow, '      ')}${tag('reinvestment', data.reinvestmentFlow, '      ')}${tag('redemption', data.redemptionFlow, '      ')}    </flowInfo>
  </fundInfo>
  <invstOrSecs>
${holdingsXml}  </invstOrSecs>
  <signature>
${tag('signerName', data.signature?.name, '    ')}${tag('title', data.signature?.title, '    ')}${tag('signatureDate', (data.signature?.date || '').slice(0, 10), '    ')}  </signature>
</edgarSubmission>`;

  return { xml, facts, confidentialFacts };
}
