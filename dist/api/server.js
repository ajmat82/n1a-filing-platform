"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const ixbrl_generator_1 = require("../xbrl/ixbrl-generator");
const deficiency_checker_1 = require("../validation/deficiency-checker");
function createServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    const generator = new ixbrl_generator_1.iXBRLGenerator();
    const checker = new deficiency_checker_1.DeficiencyChecker();
    app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });
    app.post('/api/v1/validate', (req, res) => {
        const result = checker.check(req.body);
        res.json(result);
    });
    app.post('/api/v1/generate-ixbrl', (req, res) => {
        const ixbrl = generator.generateiXBRL(req.body);
        res.json(ixbrl);
    });
    return app;
}
