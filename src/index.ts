import { DeficiencyChecker } from './validation/deficiency-checker';
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
console.log('iXBRL Generated:', gen.generateiXBRL(sample));