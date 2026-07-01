"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxonomyLoader = void 0;
class TaxonomyLoader {
    constructor() {
        this.concepts = new Map();
        this.loadMutualFundTaxonomy();
    }
    loadMutualFundTaxonomy() {
        const mutualFundConcepts = [
            { name: 'mf:FundName', label: 'Fund Name', type: 'string' },
            { name: 'mf:InvestmentObjective', label: 'Investment Objective', type: 'string' },
            { name: 'mf:NetExpenseRatio', label: 'Net Expense Ratio', type: 'decimal' },
        ];
        mutualFundConcepts.forEach(c => this.concepts.set(c.name, c));
    }
    getConcept(name) {
        return this.concepts.get(name);
    }
}
exports.TaxonomyLoader = TaxonomyLoader;
