"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArelleValidator = void 0;
class ArelleValidator {
    validate(document) {
        const errors = [];
        if (!document.html.includes('<?xml')) {
            errors.push({ code: 'E_XML_DECL', field: 'html', message: 'Missing XML declaration' });
        }
        if (!document.html.includes('xmlns:ix')) {
            errors.push({ code: 'E_IX_NS', field: 'html', message: 'Missing inline-XBRL namespace declaration' });
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
    }
}
exports.ArelleValidator = ArelleValidator;
