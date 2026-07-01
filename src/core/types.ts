// ============================================================================
// N-1A Filing Platform — Core Data Model
// Mirrors the structure of an SEC Form N-1A prospectus (Items 2–10 + SAI)
// All rich fields are optional so the API stays backward compatible with the
// original minimal payload while supporting the full comprehensive form.
// ============================================================================

export interface FundBasicInfo {
  fundName: string;
  cik: string;
  ticker?: string;
  objective: string;
  strategies: string[];
  principalRisks: string[];
  // Legacy single-manager field (kept for backward compatibility)
  managerName?: string;
}

// One row per performance period (Item 4 — Risk/Return Bar Chart & Table)
export interface PerformancePeriod {
  period: '1yr' | '3yr' | '5yr' | '10yr';
  annualReturn?: number;      // e.g. 0.1234 == 12.34%
  volatility?: number;        // annualized std dev of returns
  sharpeRatio?: number;
  standardDeviation?: number;
}

export interface RiskReturnMetrics {
  // Legacy flat fields (kept for backward compatibility)
  oneYearReturn?: number;
  fiveYearReturn?: number;
  volatility?: number;
  // Rich structured performance
  performance?: PerformancePeriod[];
}

export interface Breakpoint {
  threshold: number;   // investment amount at which the reduced load applies
  loadPercent: number; // sales load / fee at this breakpoint
}

// Item 3 — Fee Table (one per share class)
export interface FeeTable {
  shareClass: string;
  netExpenseRatio?: number;    // after waivers/reimbursements
  grossExpenseRatio?: number;  // before waivers/reimbursements
  // Legacy alias for netExpenseRatio
  expenseRatio?: number;
  waiverDescription?: string;
  waiverExpiration?: string;   // ISO date — contractual waiver expiry
  breakpoints?: Breakpoint[];
}

// Item 10 — Fund Management
export interface Manager {
  name: string;
  bio?: string;
  tenureYears?: number;
}

export interface PortfolioMetrics {
  portfolioTurnover?: number;   // e.g. 0.45 == 45%
  distributionPolicy?: string;
}

// SAI — Board & Governance
export interface BoardMember {
  name: string;
  independent: boolean;
  conflicts?: string;
}

export interface Governance {
  boardMembers?: BoardMember[];
}

export interface N1AFilingData {
  basicInfo: FundBasicInfo;
  riskReturnMetrics: RiskReturnMetrics;
  feeTables: FeeTable[];
  managers?: Manager[];
  portfolioMetrics?: PortfolioMetrics;
  governance?: Governance;
  prospectusDate: string;
  shareClasses: string[];
}

export interface ValidationIssue {
  code: string;      // stable identifier for the deficiency pattern
  field: string;     // logical field / section the issue relates to
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface iXBRLDocument {
  html: string;
  xbrlNamespace: string;
  facts: number;
}

export interface EDGARSubmission {
  accessionNumber: string;
  status: 'pending' | 'accepted' | 'rejected' | 'deficiency';
  fundName: string;
  filingDate: string;
}
