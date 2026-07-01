"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ixbrl_generator_1 = require("../xbrl/ixbrl-generator");
const deficiency_checker_1 = require("../validation/deficiency-checker");
const client_1 = require("../edgar/client");
// Resolve the dashboard HTML from disk. Works whether the process is started
// from repo root (`node dist/server.js`) or from within dist/.
function loadDashboard() {
    const candidates = [
        path.join(__dirname, '../../public/dashboard.html'),
        path.join(process.cwd(), 'public/dashboard.html'),
        path.join(process.cwd(), 'src/dashboard.html'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p))
                return fs.readFileSync(p, 'utf-8');
        }
        catch {
            /* try next */
        }
    }
    return '<!DOCTYPE html><html><body><h1>N-1A Filing Platform</h1><p>Dashboard asset not found on server.</p></body></html>';
}
function createServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: '2mb' }));
    const ixbrlGen = new ixbrl_generator_1.iXBRLGenerator();
    const deficiencyChecker = new deficiency_checker_1.DeficiencyChecker();
    const edgarClient = new client_1.EDGARClient();
    // Serve dashboard (re-read in non-production so edits show without rebuild)
    let cachedDashboard = loadDashboard();
    app.get('/', (req, res) => {
        if (process.env.NODE_ENV !== 'production')
            cachedDashboard = loadDashboard();
        res.set('Content-Type', 'text/html');
        res.send(cachedDashboard);
    });
    // Health check
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    // Validate fund data (real-time deficiency check)
    app.post('/api/v1/validate', (req, res) => {
        try {
            const result = deficiencyChecker.check(req.body);
            res.json(result);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // Generate iXBRL / mock prospectus
    app.post('/api/v1/generate-ixbrl', (req, res) => {
        try {
            res.json(ixbrlGen.generateiXBRL(req.body));
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // Download a rendered prospectus as an HTML attachment
    app.post('/api/v1/generate-prospectus', (req, res) => {
        try {
            const doc = ixbrlGen.generateiXBRL(req.body);
            const name = (req.body?.basicInfo?.fundName || 'prospectus')
                .replace(/[^a-z0-9]+/gi, '-')
                .toLowerCase();
            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', `attachment; filename="${name}-prospectus.html"`);
            res.send(doc.html);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    // File (complete workflow: validate -> generate -> submit)
    app.post('/api/v1/file', (req, res) => {
        try {
            const fundData = req.body;
            const validation = deficiencyChecker.check(fundData);
            if (!validation.isValid) {
                return res.status(400).json({
                    error: 'Validation failed',
                    errors: validation.errors,
                    warnings: validation.warnings,
                });
            }
            const ixbrl = ixbrlGen.generateiXBRL(fundData);
            const submission = edgarClient.submitFiling(fundData, ixbrl.html);
            res.json({
                submission,
                ixbrlFacts: ixbrl.facts,
                prospectusHtml: ixbrl.html,
                validationWarnings: validation.warnings,
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    return app;
}
