import { EDGARSubmission, N1AFilingData } from '../core/types';

export class EDGARClient {
  submitFiling(fundData: N1AFilingData, ixbrl: string): EDGARSubmission {
    return {
      accessionNumber: '0000950154-' + Date.now(),
      status: 'pending',
      fundName: fundData.basicInfo.fundName,
      filingDate: new Date().toISOString(),
    };
  }
}