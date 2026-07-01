import { ValidationResult, ValidationIssue } from '../core/types';

// ============================================================================
// Form N-CEN — annual census report (structured XML on EDGAR), replacing
// Form N-SAR. Representative subset for an open-end fund / ETF, grounded in
// Form N-CEN, the Rule 6c-11 ETF amendments, and the 2024 liquidity-provider
// amendment (compliance Nov 17, 2025).
// ============================================================================

export interface NCenServiceProvider {
  role: string;
  name?: string;
  fileNo?: string;
  lei?: string;
  isAffiliated?: boolean;
}

export interface NCenAuthorizedParticipant {
  name?: string;
  lei?: string;
  purchaseValue?: number;
  redemptionValue?: number;
}

export interface NCenSeries {
  seriesName?: string;
  seriesId?: string;
  lei?: string;
  classes?: { className?: string; classId?: string; ticker?: string }[];
  isETF?: boolean;
  isIndexFund?: boolean;
  isNonDiversified?: boolean;
  reliesOn6c11?: boolean;
  securitiesLending?: { authorized?: boolean; agentName?: string; agentLei?: string; netIncome?: number };
  expenseLimitationInPlace?: boolean;
  // ETF (Part C)
  exchange?: string;
  etfTicker?: string;
  authorizedParticipants?: NCenAuthorizedParticipant[];
  creationUnitShares?: number;
  // 2024 amendment
  liquidityServiceProvider?: { name?: string; lei?: string };
}

export interface NCenData {
  registrantName?: string;
  cik?: string;
  lei?: string;
  fileNumber811?: string;
  fiscalYearEnd?: string;
  isFirstFiling?: boolean;
  isLastFiling?: boolean;
  totalSeries?: number;
  serviceProviders?: NCenServiceProvider[]; // registrant-level: adviser, custodian, transfer agent, underwriter, accountant
  series?: NCenSeries[];
  signature?: { name?: string; title?: string; date?: string };
}

const LEI_RE = /^[A-Z0-9]{20}$/i;
const F811_RE = /^811-\d{3,6}$/;
// The 2024 rule requires the liquidity-service-provider block for filings with
// fiscal year-end on/after this compliance date.
const LIQUIDITY_PROVIDER_COMPLIANCE = Date.parse('2025-11-17');

export function checkNCen(data: NCenData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, field: string, message: string) => errors.push({ code, field, message });
  const warn = (code: string, field: string, message: string) => warnings.push({ code, field, message });
  data = data || {};

  if (!data.registrantName) err('CEN_NAME', 'registrantName', 'Registrant name is required.');
  if (!data.cik) err('CEN_CIK', 'cik', 'Registrant CIK is required.');
  if (data.lei && !LEI_RE.test(data.lei)) warn('CEN_LEI', 'lei', 'Registrant LEI should be 20 alphanumeric characters.');
  if (!data.fileNumber811) warn('CEN_811', 'fileNumber811', 'Investment Company Act file number (811-…) is required.');
  else if (!F811_RE.test(data.fileNumber811)) warn('CEN_811_FMT', 'fileNumber811', 'File number should be formatted like "811-01234".');

  if (!data.fiscalYearEnd) {
    err('CEN_FYE', 'fiscalYearEnd', 'Reporting period (fiscal year-end) is required.');
  } else {
    const due = Date.parse(data.fiscalYearEnd) + 75 * 864e5;
    if (!isNaN(due) && Date.now() > due) {
      warn('CEN_LATE', 'fiscalYearEnd', 'Form N-CEN is due within 75 days of fiscal year-end — this period appears past due.');
    }
  }

  // Registrant-level service providers
  const roles = (data.serviceProviders || []).map((s) => (s.role || '').toLowerCase());
  if (!roles.some((r) => r.includes('advis'))) err('CEN_NO_ADVISER', 'serviceProviders', 'An investment adviser must be reported.');
  if (!roles.some((r) => r.includes('custod'))) warn('CEN_NO_CUSTODIAN', 'serviceProviders', 'A custodian should be reported.');
  if (!roles.some((r) => r.includes('account') || r.includes('auditor'))) warn('CEN_NO_ACCOUNTANT', 'serviceProviders', 'An independent public accountant should be reported.');
  (data.serviceProviders || []).forEach((s) => {
    if (s.lei && !LEI_RE.test(s.lei)) warn('CEN_SP_LEI', 'serviceProviders', `${s.role || 'Service provider'}: LEI should be 20 alphanumeric characters.`);
  });

  const series = data.series || [];
  if (series.length === 0) err('CEN_NO_SERIES', 'series', 'At least one series must be reported.');
  if (data.totalSeries !== undefined && data.totalSeries !== series.length) {
    warn('CEN_SERIES_COUNT', 'totalSeries', `totalSeries (${data.totalSeries}) does not match the ${series.length} series provided.`);
  }

  const fyeTime = data.fiscalYearEnd ? Date.parse(data.fiscalYearEnd) : NaN;
  series.forEach((s, i) => {
    const label = s.seriesName || `Series #${i + 1}`;
    if (!s.seriesName) err('CEN_SERIES_NAME', 'series', `Series #${i + 1}: name is required.`);
    if (!s.seriesId) warn('CEN_SERIES_ID', 'series', `${label}: SEC series ID (S-number) should be provided.`);

    if (s.isETF) {
      // ETF gating (Part C)
      if (!s.exchange) err('CEN_ETF_EXCHANGE', 'series', `${label}: an ETF must report the listing exchange (Part C).`);
      if (!s.authorizedParticipants || s.authorizedParticipants.length === 0) {
        err('CEN_ETF_NO_AP', 'series', `${label}: an ETF must report its authorized participants and their creation/redemption values.`);
      } else {
        s.authorizedParticipants.forEach((ap) => {
          if (ap.lei && !LEI_RE.test(ap.lei)) warn('CEN_AP_LEI', 'series', `${label}: authorized participant LEI should be 20 alphanumeric characters.`);
        });
      }
      if (s.creationUnitShares === undefined) warn('CEN_ETF_CU', 'series', `${label}: creation-unit size (shares) should be reported.`);
      if (!s.reliesOn6c11) warn('CEN_ETF_6C11', 'series', `${label}: ETFs generally operate under Rule 6c-11 — confirm reliance (unless the fund uses an exemptive order).`);
    }

    if (s.securitiesLending?.authorized && !s.securitiesLending?.agentName) {
      warn('CEN_SEC_LEND_AGENT', 'series', `${label}: securities lending is authorized but no lending agent is reported.`);
    }

    // 2024 liquidity-service-provider requirement (open-end funds subject to the
    // liquidity rule; in-kind ETFs are excepted).
    if (!isNaN(fyeTime) && fyeTime >= LIQUIDITY_PROVIDER_COMPLIANCE && !s.isETF && !s.liquidityServiceProvider?.name) {
      warn('CEN_LIQ_PROVIDER', 'series', `${label}: for FYE on/after 2025-11-17, N-CEN requires liquidity-service-provider disclosure (2024 amendment).`);
    }
  });

  if (!data.signature?.name) warn('CEN_SIGNATURE', 'signature', 'The N-CEN filing must be signed.');

  return { isValid: errors.length === 0, errors, warnings };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateNCen(data: NCenData): { xml: string; facts: number } {
  data = data || {};
  let facts = 0;
  const tag = (name: string, value: unknown, indent = '    '): string => {
    if (value === undefined || value === null || value === '') return '';
    facts++;
    return `${indent}<${name}>${esc(value)}</${name}>\n`;
  };

  const spXml = (data.serviceProviders || []).map((s) =>
    `    <serviceProvider role="${esc(s.role)}">\n${tag('name', s.name, '      ')}${tag('fileNumber', s.fileNo, '      ')}${tag('lei', s.lei, '      ')}${tag('isAffiliated', s.isAffiliated, '      ')}    </serviceProvider>\n`
  ).join('');

  const seriesXml = (data.series || []).map((s) => {
    const apXml = (s.authorizedParticipants || []).map((ap) =>
      `        <authorizedParticipant>\n${tag('name', ap.name, '          ')}${tag('lei', ap.lei, '          ')}${tag('purchaseValue', ap.purchaseValue, '          ')}${tag('redemptionValue', ap.redemptionValue, '          ')}        </authorizedParticipant>\n`
    ).join('');
    const classXml = (s.classes || []).map((c) =>
      `        <class>\n${tag('className', c.className, '          ')}${tag('classId', c.classId, '          ')}${tag('tickerSymbol', c.ticker, '          ')}        </class>\n`
    ).join('');
    return `    <fundInfo>\n${tag('mgmtInvFundName', s.seriesName, '      ')}${tag('mgmtInvSeriesId', s.seriesId, '      ')}${tag('mgmtInvLei', s.lei, '      ')}${tag('isETF', s.isETF, '      ')}${tag('isIndexFund', s.isIndexFund, '      ')}${tag('isNonDiversified', s.isNonDiversified, '      ')}${tag('reliesOnRule6c11', s.reliesOn6c11, '      ')}${tag('creationUnitNumOfShares', s.creationUnitShares, '      ')}${tag('securityExchange', s.exchange, '      ')}${tag('tickerSymbol', s.etfTicker, '      ')}${classXml}${apXml}${s.liquidityServiceProvider?.name ? tag('liquidityServiceProvider', s.liquidityServiceProvider.name, '      ') : ''}    </fundInfo>\n`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/ncen" submissionType="N-CEN">
  <headerData>
${tag('registrantFullName', data.registrantName, '    ')}${tag('registrantCik', data.cik, '    ')}${tag('registrantLei', data.lei, '    ')}${tag('investmentCompFileNo', data.fileNumber811, '    ')}${tag('reportEndingPeriod', (data.fiscalYearEnd || '').slice(0, 10), '    ')}${tag('isRegistrantFirstFiling', data.isFirstFiling, '    ')}${tag('isRegistrantLastFiling', data.isLastFiling, '    ')}${tag('totalSeries', data.totalSeries ?? (data.series || []).length, '    ')}  </headerData>
  <formData>
${spXml}${seriesXml}    <signature>
${tag('registrantSignedName', data.signature?.name, '      ')}${tag('title', data.signature?.title, '      ')}${tag('signedDate', (data.signature?.date || '').slice(0, 10), '      ')}    </signature>
  </formData>
</edgarSubmission>`;

  return { xml, facts };
}
