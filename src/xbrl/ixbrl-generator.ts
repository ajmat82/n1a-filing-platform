import { N1AFilingData, iXBRLDocument } from '../core/types';

export class iXBRLGenerator {
  generateiXBRL(fundData: N1AFilingData): iXBRLDocument {
    const html = `<?xml version="1.0"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>${fundData.basicInfo.fundName}</h1>
  <p>Objective: ${fundData.basicInfo.objective}</p>
</body>
</html>`;

    return {
      html,
      xbrlNamespace: 'http://xbrl.sec.gov/rr/mf',
      facts: 5
    };
  }
}