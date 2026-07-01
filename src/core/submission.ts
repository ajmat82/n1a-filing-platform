import { ValidationIssue, ValidationResult } from './types';

// ============================================================================
// EDGAR submission-type lifecycle for Form N-1A.
// Each type carries different effectiveness mechanics (Rule 485(a)/(b), 498)
// and therefore different validation. Grounded in 17 CFR 230.485 / .497 / .498
// and Rule 24f-2.
// ============================================================================

export type SubmissionType =
  | 'N-1A'      // initial registration statement
  | '485APOS'   // post-effective amendment, delayed effectiveness (Rule 485(a))
  | '485BPOS'   // post-effective amendment, immediately effective (Rule 485(b))
  | '485BXT'    // extension of a pending 485(a) effective date
  | '497'       // definitive prospectus / SAI / supplement (Rule 497)
  | '497K'      // summary prospectus (Rule 498)
  | '24F-2';    // annual net-sales / registration-fee notice

export interface SubmissionMeta {
  type: SubmissionType;
  label: string;
  rule: string;
  summary: string;
  effectiveness: 'immediate' | 'delayed' | 'as-used' | 'notice';
}

export const SUBMISSION_TYPES: SubmissionMeta[] = [
  { type: 'N-1A', label: 'N-1A — Initial registration', rule: 'Form N-1A / §8(a)', summary: 'Initial registration statement (1933 & 1940 Acts). Requires N-8A on file for a first-time registrant.', effectiveness: 'delayed' },
  { type: '485APOS', label: '485APOS — Material amendment', rule: 'Rule 485(a)', summary: 'Post-effective amendment with material changes or a new series; delayed effectiveness (day 60 material / day 75 new series).', effectiveness: 'delayed' },
  { type: '485BPOS', label: '485BPOS — Annual/immediate update', rule: 'Rule 485(b)', summary: 'Immediately-effective amendment for routine/annual updates. No material changes permitted; Interactive Data (XBRL) must be current.', effectiveness: 'immediate' },
  { type: '485BXT', label: '485BXT — Extension', rule: 'Rule 485(b)(1)(iii)', summary: 'Extends the effective date of a pending 485(a) amendment; no other changes; new date ≤ prior + 30 days.', effectiveness: 'delayed' },
  { type: '497', label: '497 — Definitive materials', rule: 'Rule 497', summary: 'Files the definitive statutory prospectus/SAI or a supplement (sticker) as used.', effectiveness: 'as-used' },
  { type: '497K', label: '497K — Summary Prospectus', rule: 'Rule 498', summary: 'Summary Prospectus containing only Form N-1A Items 2–8, matching the statutory prospectus.', effectiveness: 'as-used' },
  { type: '24F-2', label: '24F-2 — Annual fee notice', rule: 'Rule 24f-2', summary: 'Annual notice of securities sold and registration-fee reconciliation; due within 90 days of fiscal year-end.', effectiveness: 'notice' },
];

export interface SubmissionContext {
  prospectusDate?: string;          // effective date of the current prospectus
  proposedEffectiveDate?: string;   // for 485(a) filings
  priorEffectiveDate?: string;      // designated date being extended (485BXT)
  priorAccession?: string;          // pending 485(a) accession (485BXT)
  isFirstTimeRegistrant?: boolean;  // N-1A / N-8A ordering
  hasN8AOnFile?: boolean;
  hasMaterialChanges?: boolean;     // strategy/risk/fee changes needing staff review
  interactiveDataCurrent?: boolean; // XBRL current (485BPOS eligibility)
  counselReviewed?: boolean;        // triggers Rule 485(b)(4) representation
  hasCounselRepresentation?: boolean;
  fiscalYearEnd?: string;           // for 24F-2 deadline
  netSalesAmount?: number;          // for 24F-2 fee computation
  isSummaryOnly?: boolean;          // payload limited to Items 2–8 (497K)
}

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (a?: string, b?: string): number | undefined => {
  if (!a || !b) return undefined;
  const t1 = new Date(a).getTime(), t2 = new Date(b).getTime();
  if (isNaN(t1) || isNaN(t2)) return undefined;
  return Math.round((t1 - t2) / DAY);
};

// Current §6(b) fee rate (per $1M of net sales). Rate changes annually — verify
// against the SEC fee-rate advisory before relying on the computed amount.
export const SEC_FEE_RATE_PER_DOLLAR = 0.00014760;

export function validateSubmission(
  type: SubmissionType,
  ctx: SubmissionContext
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string) => errors.push({ code, field: 'submission', message });
  const warn = (code: string, message: string) => warnings.push({ code, field: 'submission', message });

  switch (type) {
    case 'N-1A':
      if (ctx.isFirstTimeRegistrant && ctx.hasN8AOnFile === false) {
        err('S_N8A_REQUIRED', 'A first-time registrant must have Form N-8A on file before/with the N-1A (§8(a)).');
      }
      break;

    case '485APOS': {
      if (!ctx.proposedEffectiveDate) {
        err('S_485A_NO_EFFDATE', '485APOS requires a proposed (delayed) effective date — immediate effectiveness is not permitted under Rule 485(a).');
      } else {
        const d = daysBetween(ctx.proposedEffectiveDate, ctx.prospectusDate || new Date().toISOString());
        if (d !== undefined) {
          if (d < 60) warn('S_485A_TOO_SOON', `Proposed effective date is ${d} days out — Rule 485(a) delays effectiveness to ~day 60 (material) or 75 (new series).`);
          if (d > 95) warn('S_485A_TOO_FAR', `Proposed effective date is ${d} days out — beyond the 80/95-day Rule 485(a) ceiling.`);
        }
      }
      break;
    }

    case '485BPOS':
      if (ctx.hasMaterialChanges) {
        err('S_485B_MATERIAL', '485BPOS cannot introduce material changes requiring staff review — file a 485APOS instead (Rule 485(a)).');
      }
      if (ctx.interactiveDataCurrent === false) {
        err('S_485B_XBRL', 'Immediate effectiveness under Rule 485(b) is unavailable while Interactive Data (XBRL) filings are delinquent.');
      }
      if (ctx.counselReviewed && !ctx.hasCounselRepresentation) {
        warn('S_485B_COUNSEL_REP', 'Counsel-reviewed 485BPOS should include the Rule 485(b)(4) representation that the amendment does not contain disclosure rendering it ineligible for immediate effectiveness.');
      }
      break;

    case '485BXT':
      if (!ctx.priorAccession) {
        err('S_485BXT_PRIOR', '485BXT must reference the pending 485APOS accession whose effective date it extends.');
      }
      {
        const d = daysBetween(ctx.proposedEffectiveDate, ctx.priorEffectiveDate);
        if (d !== undefined) {
          if (d < 0) err('S_485BXT_EARLIER', 'Extended effective date cannot be earlier than the previously designated date.');
          else if (d > 30) warn('S_485BXT_30', `Extension is ${d} days beyond the prior date — Rule 485(b)(1)(iii) caps the extension at 30 days.`);
        }
      }
      break;

    case '497K':
      if (ctx.isSummaryOnly === false) {
        err('S_497K_SUMMARY_ONLY', '497K (Summary Prospectus) may contain only Form N-1A Items 2–8 (Rule 498) — the full statutory prospectus body is not permitted here.');
      }
      break;

    case '24F-2': {
      const d = daysBetween(new Date().toISOString(), ctx.fiscalYearEnd);
      if (d !== undefined && d > 90) {
        warn('S_24F2_LATE', `Form 24F-2 is due within 90 days of fiscal year-end — this is ${d} days after ${(ctx.fiscalYearEnd || '').slice(0, 10)}.`);
      }
      if (ctx.netSalesAmount !== undefined && ctx.netSalesAmount < 0) {
        warn('S_24F2_NEGSALES', 'Aggregate net sales (Item 5) is negative — no fee is due, but verify the computation.');
      }
      break;
    }

    case '497':
      // Rule 497 accepts definitive materials as used — minimal gating.
      break;
  }

  return { isValid: errors.length === 0, errors, warnings };
}

// Registration fee for a 24F-2 filing (aggregate net sales × current rate).
export function computeRegistrationFee(netSales: number): number {
  return Math.max(0, netSales) * SEC_FEE_RATE_PER_DOLLAR;
}
