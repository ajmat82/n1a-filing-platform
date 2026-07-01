const fs = require('fs');
const path = require('path');

const dirs = ['src/core', 'src/taxonomy', 'src/xbrl', 'src/edgar', 'src/validation', 'src/api', 'src/__tests__'];
dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// types.ts
fs.writeFileSync('src/core/types.ts', `export interface FundBasicInfo {
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
}`);

// taxonomy/loader.ts
fs.writeFileSync('src/taxonomy/loader.ts', `export interface XBRLConcept {
  name: string;
  label: string;
  type: string;
}

export class TaxonomyLoader {
  private concepts: Map<string, XBRLConcept> = new Map();

  constructor() {
    this.loadMutualFundTaxonomy();
  }

  private loadMutualFundTaxonomy(): void {
    const mutualFundConcepts: XBRLConcept[] = [
      { name: 'mf:FundName', label: 'Fund Name', type: 'string' },
      { name: 'mf:InvestmentObjective', label: 'Investment Objective', type: 'string' },
      { name: 'mf:NetExpenseRatio', label: 'Net Expense Ratio', type: 'decimal' },
    ];
    mutualFundConcepts.forEach(c => this.concepts.set(c.name, c));
  }

  getConcept(name: string): XBRLConcept | undefined {
    return this.concepts.get(name);
  }
}`);

// xbrl/ixbrl-generator.ts
fs.writeFileSync('src/xbrl/ixbrl-generator.ts', `import { N1AFilingData, iXBRLDocument } from '../core/types';

export class iXBRLGenerator {
  generateiXBRL(fundData: N1AFilingData): iXBRLDocument {
    const html = \`<?xml version="1.0"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>\${fundData.basicInfo.fundName}</h1>
  <p>Objective: \${fundData.basicInfo.objective}</p>
</body>
</html>\`;

    return {
      html,
      xbrlNamespace: 'http://xbrl.sec.gov/rr/mf',
      facts: 5
    };
  }
}`);

// validation/deficiency-checker.ts
fs.writeFileSync('src/validation/deficiency-checker.ts', `import { N1AFilingData, ValidationResult } from '../core/types';

export class DeficiencyChecker {
  check(fundData: N1AFilingData): ValidationResult {
    const errors: string[] = [];

    if (!fundData.basicInfo.fundName) errors.push('Fund name required');
    if (!fundData.basicInfo.cik) errors.push('CIK required');
    if (!fundData.basicInfo.objective) errors.push('Objective required');

    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}`);

// validation/arelle-validator.ts
fs.writeFileSync('src/validation/arelle-validator.ts', `import { iXBRLDocument, ValidationResult } from '../core/types';

export class ArelleValidator {
  validate(document: iXBRLDocument): ValidationResult {
    const errors: string[] = [];
    if (!document.html.includes('<?xml')) errors.push('Missing XML declaration');
    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}`);

// edgar/client.ts
fs.writeFileSync('src/edgar/client.ts', `import { EDGARSubmission, N1AFilingData } from '../core/types';

export class EDGARClient {
  submitFiling(fundData: N1AFilingData, ixbrl: string): EDGARSubmission {
    return {
      accessionNumber: '0000950154-' + Date.now(),
      status: 'pending',
      fundName: fundData.basicInfo.fundName,
      filingDate: new Date().toISOString(),
    };
  }
}`);

// api/server.ts
fs.writeFileSync('src/api/server.ts', `import express from 'express';
import { iXBRLGenerator } from '../xbrl/ixbrl-generator';
import { DeficiencyChecker } from '../validation/deficiency-checker';

export function createServer() {
  const app = express();
  app.use(express.json());

  const generator = new iXBRLGenerator();
  const checker = new DeficiencyChecker();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/v1/validate', (req, res) => {
    const result = checker.check(req.body);
    res.json(result);
  });

  app.post('/api/v1/generate-ixbrl', (req, res) => {
    const ixbrl = generator.generateiXBRL(req.body);
    res.json(ixbrl);
  });

  return app;
}`);

// src/index.ts
fs.writeFileSync('src/index.ts', `import { DeficiencyChecker } from './validation/deficiency-checker';
import { iXBRLGenerator } from './xbrl/ixbrl-generator';

const sample = {
  basicInfo: { fundName: 'Test Fund', cik: '123', objective: 'Growth', strategies: [], principalRisks: [], managerName: 'John' },
  riskReturnMetrics: {},
  feeTables: [],
  prospectusDate: new Date().toISOString(),
  shareClasses: []
};

const checker = new DeficiencyChecker();
const gen = new iXBRLGenerator();

console.log('Validation:', checker.check(sample));
console.log('iXBRL Generated:', gen.generateiXBRL(sample));`);

// src/server.ts
fs.writeFileSync('src/server.ts', `import { createServer } from './api/server';

const app = createServer();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});`);

// tsconfig.json
fs.writeFileSync('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'commonjs',
    outDir: './dist',
    rootDir: './src',
    strict: true,
    esModuleInterop: true,
  },
  include: ['src/**/*'],
}, null, 2));

// jest.config.js
fs.writeFileSync('jest.config.js', `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts']
};`);

console.log('✅ Project structure created!');
