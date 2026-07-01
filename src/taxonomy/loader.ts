export interface XBRLConcept {
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
}