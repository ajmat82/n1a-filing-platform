"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ixbrl_generator_1 = require("../xbrl/ixbrl-generator");
const deficiency_checker_1 = require("../validation/deficiency-checker");
const client_1 = require("../edgar/client");
const DASHBOARD_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>N-1A Filing Platform</title>
  <style>
    body { font-family: Arial; max-width: 900px; margin: 50px auto; padding: 20px; background: #f9f9f9; }
    h1 { color: #333; }
    p { color: #666; }
    .form-group { margin: 15px 0; }
    label { display: block; font-weight: bold; margin-bottom: 5px; }
    input, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    button { background: #007bff; color: white; padding: 10px 20px; margin: 5px 5px 5px 0; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .result { background: #fff; padding: 15px; margin-top: 20px; border-radius: 4px; border: 1px solid #ddd; white-space: pre-wrap; font-family: monospace; font-size: 12px; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>🚀 N-1A Filing Platform</h1>
  <p>SEC Form N-1A filing automation for ETFs</p>

  <div class="form-group">
    <label>Fund Name:</label>
    <input type="text" id="fundName" placeholder="e.g., Growth ETF" value="Sample Growth Fund">
  </div>

  <div class="form-group">
    <label>CIK:</label>
    <input type="text" id="cik" placeholder="e.g., 0001234567" value="0001234567">
  </div>

  <div class="form-group">
    <label>Investment Objective:</label>
    <input type="text" id="objective" placeholder="e.g., Capital appreciation" value="Capital appreciation">
  </div>

  <div class="form-group">
    <label>Net Expense Ratio (%):</label>
    <input type="number" id="expenseRatio" placeholder="e.g., 0.15" value="0.15" step="0.01">
  </div>

  <button onclick="validateFund()">✅ Validate Fund</button>
  <button onclick="generateiXBRL()">📄 Generate iXBRL</button>
  <button onclick="submitFiling()">🗂️ Submit Filing</button>

  <div id="result"></div>

  <script>
    async function validateFund() {
      const data = {
        basicInfo: {
          fundName: document.getElementById('fundName').value,
          cik: document.getElementById('cik').value,
          objective: document.getElementById('objective').value,
          strategies: ['Growth investing'],
          principalRisks: ['Market risk'],
          managerName: 'Fund Manager'
        },
        riskReturnMetrics: {},
        feeTables: [{ shareClass: 'Class A', expenseRatio: parseFloat(document.getElementById('expenseRatio').value) / 100, grossExpenseRatio: 0.002 }],
        prospectusDate: new Date().toISOString(),
        shareClasses: ['Class A']
      };

      const res = await fetch('/api/v1/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      document.getElementById('result').innerHTML = '<div class="result ' + (result.isValid ? 'success' : 'error') + '">✅ VALID\\n' + JSON.stringify(result, null, 2) + '</div>';
    }

    async function generateiXBRL() {
      const data = {
        basicInfo: {
          fundName: document.getElementById('fundName').value,
          cik: document.getElementById('cik').value,
          objective: document.getElementById('objective').value,
          strategies: ['Growth investing'],
          principalRisks: ['Market risk'],
          managerName: 'Fund Manager'
        },
        riskReturnMetrics: { oneYearReturn: 0.12 },
        feeTables: [{ shareClass: 'Class A', expenseRatio: 0.0015, grossExpenseRatio: 0.002 }],
        prospectusDate: new Date().toISOString(),
        shareClasses: ['Class A']
      };

      const res = await fetch('/api/v1/generate-ixbrl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      document.getElementById('result').innerHTML = '<div class="result success">📄 iXBRL GENERATED\\n' + JSON.stringify(result, null, 2) + '</div>';
    }

    async function submitFiling() {
      const data = {
        basicInfo: {
          fundName: document.getElementById('fundName').value,
          cik: document.getElementById('cik').value,
          objective: document.getElementById('objective').value,
          strategies: ['Growth investing'],
          principalRisks: ['Market risk'],
          managerName: 'Fund Manager'
        },
        riskReturnMetrics: { oneYearReturn: 0.12 },
        feeTables: [{ shareClass: 'Class A', expenseRatio: 0.0015, grossExpenseRatio: 0.002 }],
        prospectusDate: new Date().toISOString(),
        shareClasses: ['Class A']
      };

      const res = await fetch('/api/v1/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      document.getElementById('result').innerHTML = '<div class="result success">🗂️ FILING SUBMITTED\\n' + JSON.stringify(result, null, 2) + '</div>';
    }
  </script>
</body>
</html>`;
function createServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    const ixbrlGen = new ixbrl_generator_1.iXBRLGenerator();
    const deficiencyChecker = new deficiency_checker_1.DeficiencyChecker();
    const edgarClient = new client_1.EDGARClient();
    // Serve dashboard
    app.get('/', (req, res) => {
        res.set('Content-Type', 'text/html');
        res.send(DASHBOARD_HTML);
    });
    // Health check
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    // Validate fund data
    app.post('/api/v1/validate', (req, res) => {
        try {
            const fundData = req.body;
            const result = deficiencyChecker.check(fundData);
            res.json(result);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // Generate iXBRL
    app.post('/api/v1/generate-ixbrl', (req, res) => {
        try {
            const fundData = req.body;
            const ixbrl = ixbrlGen.generateiXBRL(fundData);
            res.json(ixbrl);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // File (complete workflow)
    app.post('/api/v1/file', (req, res) => {
        try {
            const fundData = req.body;
            const validation = deficiencyChecker.check(fundData);
            if (!validation.isValid) {
                return res.status(400).json({ error: 'Validation failed', details: validation.errors });
            }
            const ixbrl = ixbrlGen.generateiXBRL(fundData);
            const submission = edgarClient.submitFiling(fundData, ixbrl.html);
            res.json({ submission, ixbrlFacts: ixbrl.facts, validationWarnings: validation.warnings });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    return app;
}
