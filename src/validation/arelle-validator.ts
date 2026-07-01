import { iXBRLDocument, ValidationResult } from '../core/types';

export class ArelleValidator {
  validate(document: iXBRLDocument): ValidationResult {
    const errors: string[] = [];
    if (!document.html.includes('<?xml')) errors.push('Missing XML declaration');
    return { isValid: errors.length === 0, errors, warnings: [] };
  }
}