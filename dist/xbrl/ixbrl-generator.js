"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iXBRLGenerator = void 0;
class iXBRLGenerator {
    generateiXBRL(fundData) {
        const html = `<?xml version="1.0"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>${fundData.basicInfo.fundName}</h1>
  <p>Objective: ${fundData.basicInfo.objective}</p>
</body>
</html>`;
        return {
            html,
            xbrlNamespace: 'http://xbrl.sec.gov/rr/mf',
            facts: 5
        };
    }
}
exports.iXBRLGenerator = iXBRLGenerator;
