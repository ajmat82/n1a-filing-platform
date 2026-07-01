"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = require("fs");
const path_1 = require("path");
const ixbrl_generator_1 = require("../xbrl/ixbrl-generator");
const deficiency_checker_1 = require("../validation/deficiency-checker");
const client_1 = require("../edgar/client");
function createServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    const ixbrlGen = new ixbrl_generator_1.iXBRLGenerator();
    const deficiencyChecker = new deficiency_checker_1.DeficiencyChecker();
    const edgarClient = new client_1.EDGARClient();
    // Serve dashboard
    app.get('/', (req, res) => {
        try {
            const html = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../dashboard.html'), 'utf-8');
            res.set('Content-Type', 'text/html');
            res.send(html);
        }
        catch (e) {
            res.send('<h1>N-1A Platform</h1><p>Dashboard not available</p>');
        }
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
