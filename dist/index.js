"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const deficiency_checker_1 = require("./validation/deficiency-checker");
const ixbrl_generator_1 = require("./xbrl/ixbrl-generator");
const sample = {
    basicInfo: { fundName: 'Test Fund', cik: '123', objective: 'Growth', strategies: [], principalRisks: [], managerName: 'John' },
    riskReturnMetrics: {},
    feeTables: [],
    prospectusDate: new Date().toISOString(),
    shareClasses: []
};
const checker = new deficiency_checker_1.DeficiencyChecker();
const gen = new ixbrl_generator_1.iXBRLGenerator();
console.log('Validation:', checker.check(sample));
console.log('iXBRL Generated:', gen.generateiXBRL(sample));
