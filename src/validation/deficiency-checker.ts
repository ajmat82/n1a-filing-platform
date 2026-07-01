import {
  N1AFilingData,
  ValidationResult,
  ValidationIssue,
  FeeTable,
} from '../core/types';

// ============================================================================
// DeficiencyChecker
// Encodes the recurring SEC staff comment / deficiency patterns for Form N-1A
// prospectuses. Errors block filing; warnings are advisory (staff-comment risk).
// ============================================================================

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

// Keyword map: strategy signal -> risk that staff expect to be disclosed.
// If a strategy references the concept but no matching principal risk exists,
// that is a classic "strategy/risk mismatch" comment.
const STRATEGY_RISK_MAP: { signals: string[]; risk: string; label: string }[] = [
  { signals: ['derivative', 'option', 'future', 'swap', 'forward'], risk: 'derivativ', label: 'Derivatives risk' },
  { signals: ['foreign', 'international', 'emerging', 'global'], risk: 'foreign', label: 'Foreign/Emerging markets risk' },
  { signals: ['high yield', 'high-yield', 'junk', 'below investment grade'], risk: 'credit', label: 'High-yield/Credit risk' },
  { signals: ['leverage', 'borrow'], risk: 'leverage', label: 'Leverage risk' },
  { signals: ['small cap', 'small-cap', 'smaller compan'], risk: 'small', label: 'Small-cap risk' },
  { signals: ['concentrat', 'sector'], risk: 'concentrat', label: 'Concentration/Sector risk' },
  { signals: ['bond', 'fixed income', 'fixed-income', 'debt', 'treasury'], risk: 'interest', label: 'Interest rate risk' },
];

function netRatio(f: FeeTable): number | undefined {
  return f.netExpenseRatio ?? f.expenseRatio;
}

export class DeficiencyChecker {
  check(fundData: N1AFilingData): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    const err = (code: string, field: string, message: string) =>
      errors.push({ code, field, message });
    const warn = (code: string, field: string, message: string) =>
      warnings.push({ code, field, message });

    const info = fundData.basicInfo || ({} as any);

    // ---- Item 2/9: Basic identification ------------------------------------
    if (!info.fundName || !info.fundName.trim()) err('E_FUND_NAME', 'fundName', 'Fund name is required.');
    if (!info.cik || !info.cik.trim()) {
      err('E_CIK', 'cik', 'CIK is required.');
    } else if (!/^\d{1,10}$/.test(info.cik.replace(/^0+/, '') || '0')) {
      warn('W_CIK_FORMAT', 'cik', 'CIK should be numeric (up to 10 digits, typically zero-padded).');
    }

    if (!info.objective || !info.objective.trim()) {
      err('E_OBJECTIVE', 'objective', 'Investment objective is required (Item 2).');
    } else if (info.objective.trim().split(/\s+/).length < 3) {
      warn('W_OBJECTIVE_VAGUE', 'objective', 'Investment objective appears too brief/vague — staff frequently comment on non-specific objectives.');
    }

    // ---- Item 4: Principal strategies & risks ------------------------------
    const strategies = (info.strategies || []).filter((s: string) => s && s.trim());
    const risks = (info.principalRisks || []).filter((r: string) => r && r.trim());

    if (strategies.length === 0) err('E_NO_STRATEGY', 'strategies', 'At least one principal investment strategy is required (Item 4/9).');
    if (risks.length === 0) err('E_NO_RISK', 'principalRisks', 'At least one principal risk is required (Item 4).');

    // Strategy/risk correspondence — the single most common N-1A comment.
    const strategyText = strategies.join(' ').toLowerCase();
    const riskText = risks.join(' ').toLowerCase();
    for (const rule of STRATEGY_RISK_MAP) {
      const strategyMentions = rule.signals.some((s) => strategyText.includes(s));
      const riskDisclosed = riskText.includes(rule.risk);
      if (strategyMentions && !riskDisclosed) {
        warn(
          'W_STRATEGY_RISK_MISMATCH',
          'principalRisks',
          `Strategy references ${rule.label.toLowerCase()} exposure but no matching "${rule.label}" is disclosed in principal risks (strategy/risk correspondence).`
        );
      }
    }

    // ---- Item 3: Fee table -------------------------------------------------
    const fees = fundData.feeTables || [];
    if (fees.length === 0) {
      err('E_NO_FEE_TABLE', 'feeTables', 'At least one share class fee table is required (Item 3).');
    }

    const seenClasses = new Set<string>();
    fees.forEach((f, i) => {
      const label = f.shareClass || `Share class #${i + 1}`;
      const net = netRatio(f);
      const gross = f.grossExpenseRatio;

      if (!f.shareClass || !f.shareClass.trim()) {
        warn('W_CLASS_UNNAMED', 'feeTables', `Fee table #${i + 1} has no share class name.`);
      } else if (seenClasses.has(f.shareClass.toLowerCase())) {
        err('E_DUP_CLASS', 'feeTables', `Duplicate share class "${f.shareClass}" in fee tables.`);
      } else {
        seenClasses.add(f.shareClass.toLowerCase());
      }

      if (net === undefined) {
        err('E_NO_NET_RATIO', 'feeTables', `${label}: net expense ratio is required.`);
      }
      if (gross === undefined) {
        warn('W_NO_GROSS_RATIO', 'feeTables', `${label}: gross expense ratio is missing — required in the fee table.`);
      }

      // Sanity ranges (ratios stored as decimals, e.g. 0.0075 == 0.75%).
      if (net !== undefined && (net < 0 || net > 0.05)) {
        warn('W_NET_RATIO_RANGE', 'feeTables', `${label}: net expense ratio ${(net * 100).toFixed(2)}% is outside the typical 0–5% range — verify units (decimal, not percent).`);
      }
      if (gross !== undefined && net !== undefined && gross < net) {
        err('E_GROSS_LT_NET', 'feeTables', `${label}: gross expense ratio (${(gross * 100).toFixed(2)}%) cannot be less than net (${(net * 100).toFixed(2)}%).`);
      }

      // Waiver logic — if net < gross, a fee waiver with expiration is required,
      // and staff require the waiver to run at least one year from the
      // prospectus effective date.
      const hasWaiverGap = gross !== undefined && net !== undefined && gross > net;
      if (hasWaiverGap) {
        if (!f.waiverDescription || !f.waiverDescription.trim()) {
          err('E_WAIVER_DESC', 'feeTables', `${label}: net expense ratio is below gross, so a fee-waiver/reimbursement description is required.`);
        }
        if (!f.waiverExpiration) {
          err('E_WAIVER_EXP', 'feeTables', `${label}: a contractual waiver must disclose an expiration date.`);
        } else {
          const exp = new Date(f.waiverExpiration).getTime();
          const prosp = new Date(fundData.prospectusDate).getTime();
          if (!isNaN(exp) && !isNaN(prosp) && exp - prosp < MS_PER_YEAR - MS_PER_YEAR * 0.02) {
            warn('W_WAIVER_SHORT', 'feeTables', `${label}: waiver expires less than one year after the prospectus date — staff require contractual waivers to run at least one year.`);
          }
        }
      }

      // Breakpoints must be monotonic (higher investment -> lower load).
      const bps = f.breakpoints || [];
      for (let b = 1; b < bps.length; b++) {
        if (bps[b].threshold <= bps[b - 1].threshold) {
          warn('W_BREAKPOINT_ORDER', 'feeTables', `${label}: breakpoint thresholds should increase monotonically.`);
          break;
        }
      }
    });

    // ---- Item 4: Performance data ------------------------------------------
    const perf = fundData.riskReturnMetrics?.performance || [];
    const hasAnyReturn =
      perf.some((p) => p.annualReturn !== undefined) ||
      fundData.riskReturnMetrics?.oneYearReturn !== undefined;
    if (!hasAnyReturn) {
      warn('W_NO_PERFORMANCE', 'performance', 'No performance data provided. Funds with at least one full calendar year of operations must present a bar chart and average annual total return table (Item 4).');
    }
    perf.forEach((p) => {
      if (p.annualReturn !== undefined && (p.annualReturn < -1 || p.annualReturn > 5)) {
        warn('W_RETURN_RANGE', 'performance', `${p.period} return ${(p.annualReturn * 100).toFixed(1)}% looks out of range — verify units (decimal, not percent).`);
      }
      if (p.sharpeRatio !== undefined && (p.sharpeRatio < -5 || p.sharpeRatio > 5)) {
        warn('W_SHARPE_RANGE', 'performance', `${p.period} Sharpe ratio ${p.sharpeRatio} looks implausible.`);
      }
    });

    // ---- Item 10: Management -----------------------------------------------
    const managers = fundData.managers || [];
    const hasLegacyManager = !!(info.managerName && info.managerName.trim());
    if (managers.length === 0 && !hasLegacyManager) {
      err('E_NO_MANAGER', 'managers', 'At least one portfolio manager is required (Item 10).');
    }
    managers.forEach((m, i) => {
      const label = m.name || `Manager #${i + 1}`;
      if (!m.name || !m.name.trim()) {
        err('E_MANAGER_NAME', 'managers', `Manager #${i + 1}: name is required.`);
      }
      if (!m.bio || !m.bio.trim()) {
        warn('W_MANAGER_BIO', 'managers', `${label}: business experience/bio for the past 5 years is required (Item 10).`);
      }
      if (m.tenureYears === undefined) {
        warn('W_MANAGER_TENURE', 'managers', `${label}: length of service (tenure) should be disclosed.`);
      }
    });

    // ---- Item 9(b): Portfolio turnover -------------------------------------
    const pm = fundData.portfolioMetrics || {};
    if (pm.portfolioTurnover === undefined) {
      warn('W_NO_TURNOVER', 'portfolioMetrics', 'Portfolio turnover rate is required (Item 3 / Item 9(b)).');
    } else if (pm.portfolioTurnover < 0 || pm.portfolioTurnover > 20) {
      warn('W_TURNOVER_RANGE', 'portfolioMetrics', `Portfolio turnover ${(pm.portfolioTurnover * 100).toFixed(0)}% looks out of range — verify units (decimal).`);
    }

    // ---- SAI: Board & Governance -------------------------------------------
    const board = fundData.governance?.boardMembers || [];
    if (board.length > 0) {
      const independentCount = board.filter((b) => b.independent).length;
      const ratio = independentCount / board.length;
      if (ratio < 0.5) {
        warn('W_BOARD_INDEPENDENCE', 'governance', `Only ${independentCount}/${board.length} board members are independent — a majority-independent board is expected under the 1940 Act governance standards.`);
      }
      board.forEach((b, i) => {
        if (!b.name || !b.name.trim()) {
          warn('W_BOARD_NAME', 'governance', `Board member #${i + 1}: name is missing.`);
        }
        if (!b.independent && (!b.conflicts || !b.conflicts.trim())) {
          warn('W_BOARD_CONFLICT', 'governance', `Board member "${b.name || i + 1}" is interested/non-independent but no material conflict/relationship is disclosed.`);
        }
      });
    }

    // ---- Prospectus date ----------------------------------------------------
    if (!fundData.prospectusDate || isNaN(new Date(fundData.prospectusDate).getTime())) {
      warn('W_PROSPECTUS_DATE', 'prospectusDate', 'A valid prospectus date is required.');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}
