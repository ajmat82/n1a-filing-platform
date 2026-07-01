import express from 'express';
import { iXBRLGenerator } from '../xbrl/ixbrl-generator';
import { DeficiencyChecker } from '../validation/deficiency-checker';

export function createServer() {
  const app = express();
  app.use(express.json());

  const generator = new iXBRLGenerator();
  const checker = new DeficiencyChecker();

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