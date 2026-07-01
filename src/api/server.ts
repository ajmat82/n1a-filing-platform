import express, { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join } from 'path';
import { iXBRLGenerator } from '../xbrl/ixbrl-generator';
import { DeficiencyChecker } from '../validation/deficiency-checker';
import { EDGARClient } from '../edgar/client';

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const ixbrlGen = new iXBRLGenerator();
  const deficiencyChecker = new DeficiencyChecker();
  const edgarClient = new EDGARClient();

  // Serve dashboard
  app.get('/', (req: Request, res: Response) => {
    try {
      const html = readFileSync(join(__dirname, '../dashboard.html'), 'utf-8');
      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (e) {
      res.send('<h1>N-1A Platform</h1><p>Dashboard not available</p>');
    }
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Validate fund data
  app.post('/api/v1/validate', (req: Request, res: Response) => {
    try {
      const fundData = req.body;
      const result = deficiencyChecker.check(fundData);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Generate iXBRL
  app.post('/api/v1/generate-ixbrl', (req: Request, res: Response) => {
    try {
      const fundData = req.body;
      const ixbrl = ixbrlGen.generateiXBRL(fundData);
      res.json(ixbrl);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // File (complete workflow)
  app.post('/api/v1/file', (req: Request, res: Response) => {
    try {
      const fundData = req.body;
      const validation = deficiencyChecker.check(fundData);
      if (!validation.isValid) {
        return res.status(400).json({ error: 'Validation failed', details: validation.errors });
      }
      const ixbrl = ixbrlGen.generateiXBRL(fundData);
      const submission = edgarClient.submitFiling(fundData, ixbrl.html);
      res.json({ submission, ixbrlFacts: ixbrl.facts, validationWarnings: validation.warnings });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return app;
}
