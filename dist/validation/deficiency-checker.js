"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeficiencyChecker = void 0;
class DeficiencyChecker {
    check(fundData) {
        const errors = [];
        if (!fundData.basicInfo.fundName)
            errors.push('Fund name required');
        if (!fundData.basicInfo.cik)
            errors.push('CIK required');
        if (!fundData.basicInfo.objective)
            errors.push('Objective required');
        return { isValid: errors.length === 0, errors, warnings: [] };
    }
}
exports.DeficiencyChecker = DeficiencyChecker;
