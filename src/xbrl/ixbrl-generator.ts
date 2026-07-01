import { N1AFilingData, iXBRLDocument, FeeTable } from '../core/types';

// ============================================================================
// iXBRLGenerator
// Produces a mock inline-XBRL (iXBRL) prospectus document from the filing data.
// Tagged values are wrapped in <ix:nonFraction>/<ix:nonNumeric> so the output
// resembles a real EDGAR RR-taxonomy submission, and `facts` counts the tags.
// ============================================================================

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(n: number | undefined): string {
  return n === undefined ? '—' : (n * 100).toFixed(2) + '%';
}

function netRatio(f: FeeTable): number | undefined {
  return f.netExpenseRatio ?? f.expenseRatio;
}

export class iXBRLGenerator {
  generateiXBRL(fundData: N1AFilingData): iXBRLDocument {
    let facts = 0;
    const tag = (name: string, value: unknown, numeric = false): string => {
      if (value === undefined || value === null || value === '') return '—';
      facts++;
      const el = numeric ? 'ix:nonFraction' : 'ix:nonNumeric';
      return `<${el} name="rr:${esc(name)}" contextRef="c1">${esc(value)}</${el}>`;
    };

    const info = fundData.basicInfo || ({} as any);
    const fees = fundData.feeTables || [];
    const perf = fundData.riskReturnMetrics?.performance || [];
    const managers = fundData.managers || [];
    const board = fundData.governance?.boardMembers || [];
    const pm = fundData.portfolioMetrics || {};

    const feeRows = fees
      .map(
        (f) => `<tr>
        <td>${tag('ClassName', f.shareClass)}</td>
        <td>${tag('ExpensesNetOfFeeWaiver', pct(netRatio(f)), true)}</td>
        <td>${tag('OperatingExpensesRatio', pct(f.grossExpenseRatio), true)}</td>
        <td>${esc(f.waiverDescription || '—')}${f.waiverExpiration ? ` (through ${esc(f.waiverExpiration)})` : ''}</td>
      </tr>`
      )
      .join('\n');

    const perfRows = perf
      .map(
        (p) => `<tr>
        <td>${esc(p.period)}</td>
        <td>${tag('AverageAnnualReturn', pct(p.annualReturn), true)}</td>
        <td>${p.volatility !== undefined ? pct(p.volatility) : '—'}</td>
        <td>${p.sharpeRatio ?? '—'}</td>
        <td>${p.standardDeviation !== undefined ? pct(p.standardDeviation) : '—'}</td>
      </tr>`
      )
      .join('\n');

    const managerRows = managers
      .map(
        (m) => `<li><strong>${tag('PortfolioManagerName', m.name)}</strong>${
          m.tenureYears !== undefined ? ` — ${esc(m.tenureYears)} yr tenure` : ''
        }<br><span>${esc(m.bio || '')}</span></li>`
      )
      .join('\n');

    const boardRows = board
      .map(
        (b) => `<tr><td>${esc(b.name)}</td><td>${b.independent ? 'Independent' : 'Interested'}</td><td>${esc(b.conflicts || '—')}</td></tr>`
      )
      .join('\n');

    const html = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:rr="http://xbrl.sec.gov/rr/2023">
<head>
  <meta charset="utf-8"/>
  <title>${esc(info.fundName)} — Prospectus</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;color:#1a1a1a;line-height:1.5;padding:0 24px;}
    h1{font-size:24px;border-bottom:3px double #333;padding-bottom:8px;}
    h2{font-size:17px;margin-top:32px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #ccc;padding-bottom:4px;}
    table{border-collapse:collapse;width:100%;margin:12px 0;font-family:Arial,sans-serif;font-size:13px;}
    th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;}
    th{background:#f0f0f0;}
    .meta{color:#555;font-size:13px;}
    ul{padding-left:20px;} li{margin:8px 0;}
    ix\\:nonFraction,ix\\:nonNumeric{background:#fffbe6;}
  </style>
</head>
<body>
  <div style="display:none"><ix:header><ix:references/><ix:resources/></ix:header></div>

  <h1>${tag('EntityRegistrantName', info.fundName)}</h1>
  <p class="meta">CIK ${tag('EntityCentralIndexKey', info.cik)}${info.ticker ? ` · Ticker ${tag('TradingSymbol', info.ticker)}` : ''} · Prospectus dated ${tag('ProspectusDate', (fundData.prospectusDate || '').slice(0, 10))}</p>

  <h2>Investment Objective</h2>
  <p>${tag('ObjectivePrimaryTextBlock', info.objective)}</p>

  <h2>Principal Investment Strategies</h2>
  <ul>${(info.strategies || []).map((s: string) => `<li>${esc(s)}</li>`).join('') || '<li>—</li>'}</ul>

  <h2>Principal Risks</h2>
  <ul>${(info.principalRisks || []).map((r: string) => `<li>${esc(r)}</li>`).join('') || '<li>—</li>'}</ul>

  <h2>Fees and Expenses</h2>
  <table><thead><tr><th>Share Class</th><th>Net Expense Ratio</th><th>Gross Expense Ratio</th><th>Fee Waiver</th></tr></thead>
  <tbody>${feeRows || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
  <p class="meta">Portfolio Turnover: ${pm.portfolioTurnover !== undefined ? tag('PortfolioTurnoverRate', pct(pm.portfolioTurnover), true) : '—'}</p>

  <h2>Performance</h2>
  <table><thead><tr><th>Period</th><th>Avg Annual Return</th><th>Volatility</th><th>Sharpe</th><th>Std Dev</th></tr></thead>
  <tbody>${perfRows || '<tr><td colspan="5">Performance information is not available for a full calendar year.</td></tr>'}</tbody></table>

  <h2>Fund Management</h2>
  <ul>${managerRows || '<li>—</li>'}</ul>

  ${pm.distributionPolicy ? `<h2>Distribution Policy</h2><p>${esc(pm.distributionPolicy)}</p>` : ''}

  ${board.length ? `<h2>Board &amp; Governance</h2>
  <table><thead><tr><th>Trustee</th><th>Status</th><th>Material Relationships</th></tr></thead>
  <tbody>${boardRows}</tbody></table>` : ''}

  <hr/>
  <p class="meta">This document is a machine-generated mock prospectus for platform demonstration purposes and is not an offer to sell securities.</p>
</body>
</html>`;

    return {
      html,
      xbrlNamespace: 'http://xbrl.sec.gov/rr/2023',
      facts,
    };
  }
}
