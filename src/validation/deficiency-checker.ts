import { N1AFilingData, ValidationResult } from '../core/types';

export class DeficiencyChecker {
  check(fundData: N1AFilingData): ValidationResult {
    const errors: string[] = [];

    if (!fundData.basicInfo.fundName) errors.push('Fund name required');
    if (!fundData.basicInfo.cik) errors.push('CIK required');
    if (!fundData.basicInfo.objective) errors.push('Objective required');

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}