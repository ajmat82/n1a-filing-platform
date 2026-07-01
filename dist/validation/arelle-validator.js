"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArelleValidator = void 0;
class ArelleValidator {
    validate(document) {
        const errors = [];
        if (!document.html.includes('<?xml'))
            errors.push('Missing XML declaration');
        return { isValid: errors.length === 0, errors, warnings: [] };
    }
}
exports.ArelleValidator = ArelleValidator;
