export interface FundBasicInfo {
  fundName: string;
  cik: string;
  objective: string;
  strategies: string[];
  principalRisks: string[];
  managerName: string;
}

export interface RiskReturnMetrics {
  oneYearReturn?: number;
  fiveYearReturn?: number;
  volatility?: number;
}

export interface FeeTable {
  shareClass: string;
  expenseRatio: number;
  grossExpenseRatio: number;
}

export interface N1AFilingData {
  basicInfo: FundBasicInfo;
  riskReturnMetrics: RiskReturnMetrics;
  feeTables: FeeTable[];
  prospectusDate: string;
  shareClasses: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
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