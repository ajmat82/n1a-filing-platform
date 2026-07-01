import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { iXBRLGenerator } from '../xbrl/ixbrl-generator';
import { DeficiencyChecker } from '../validation/deficiency-checker';
import { EDGARClient } from '../edgar/client';
import { checkSAI, generateSAI, OWNERSHIP_BANDS } from '../forms/sai';
import { checkPartC, generatePartC, EXHIBIT_CATALOG } from '../forms/partc';
import { checkNCen, generateNCen } from '../forms/ncen';
import { checkNPort, generateNPort, HOLDING_UNITS, PAYOFF_PROFILES, FAIR_VALUE_LEVELS, LIQUIDITY_BUCKETS } from '../forms/nport';
import { validateSubmission, computeRegistrationFee, SUBMISSION_TYPES, SubmissionType } from '../core/submission';

// Resolve the dashboard HTML from disk. Works whether the process is started
// from repo root (`node dist/server.js`) or from within dist/.
function loadDashboard(): string {
  const candidates = [
    path.join(__dirname, '../../public/dashboard.html'),
    path.join(process.cwd(), 'public/dashboard.html'),
    path.join(process.cwd(), 'src/dashboard.html'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    } catch {
      /* try next */
    }
  }
  return '<!DOCTYPE html><html><body><h1>N-1A Filing Platform</h1><p>Dashboard asset not found on server.</p></body></html>';
}

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const ixbrlGen = new iXBRLGenerator();
  const deficiencyChecker = new DeficiencyChecker();
  const edgarClient = new EDGARClient();

  // Serve dashboard (re-read in non-production so edits show without rebuild)
  let cachedDashboard = loadDashboard();
  app.get('/', (req: Request, res: Response) => {
    if (process.env.NODE_ENV !== 'production') cachedDashboard = loadDashboard();
    res.set('Content-Type', 'text/html');
    res.send(cachedDashboard);
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Validate fund data (real-time deficiency check)
  app.post('/api/v1/validate', (req: Request, res: Response) => {
    try {
      const result = deficiencyChecker.check(req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Generate iXBRL / mock prospectus
  app.post('/api/v1/generate-ixbrl', (req: Request, res: Response) => {
    try {
      res.json(ixbrlGen.generateiXBRL(req.body));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Download a rendered prospectus as an HTML attachment
  app.post('/api/v1/generate-prospectus', (req: Request, res: Response) => {
    try {
      const doc = ixbrlGen.generateiXBRL(req.body);
      const name = (req.body?.basicInfo?.fundName || 'prospectus')
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase();
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Disposition', `attachment; filename="${name}-prospectus.html"`);
      res.send(doc.html);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Metadata for the dashboard (enums, catalogs) so the UI stays in sync
  app.get('/api/v1/meta', (req: Request, res: Response) => {
    res.json({
      submissionTypes: SUBMISSION_TYPES,
      ownershipBands: OWNERSHIP_BANDS,
      exhibitCatalog: EXHIBIT_CATALOG,
      nport: {
        units: HOLDING_UNITS,
        payoffProfiles: PAYOFF_PROFILES,
        fairValueLevels: FAIR_VALUE_LEVELS,
        liquidityBuckets: LIQUIDITY_BUCKETS,
      },
    });
  });

  // Submission-type lifecycle validation (485APOS / 485BPOS / 497K / 24F-2 ...)
  app.post('/api/v1/submission/validate', (req: Request, res: Response) => {
    try {
      const { type, context } = req.body || {};
      const result = validateSubmission(type as SubmissionType, context || {});
      const fee = context?.netSalesAmount !== undefined ? computeRegistrationFee(context.netSalesAmount) : undefined;
      res.json({ ...result, registrationFee: fee });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Generic per-form validate + generate endpoints
  const forms: Record<string, { check: (d: any) => any; gen: (d: any, name?: string) => any; format: 'html' | 'xml' }> = {
    sai: { check: checkSAI, gen: (d, n) => generateSAI(d, n), format: 'html' },
    partc: { check: checkPartC, gen: (d, n) => generatePartC(d, n), format: 'html' },
    ncen: { check: checkNCen, gen: (d) => generateNCen(d), format: 'xml' },
    nport: { check: checkNPort, gen: (d) => generateNPort(d), format: 'xml' },
  };

  Object.entries(forms).forEach(([name, handler]) => {
    app.post(`/api/v1/${name}/validate`, (req: Request, res: Response) => {
      try {
        res.json(handler.check(req.body));
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
    app.post(`/api/v1/${name}/generate`, (req: Request, res: Response) => {
      try {
        const fundName = req.body?.__fundName || req.body?.registrantName || req.body?.seriesName;
        res.json(handler.gen(req.body, fundName));
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
    // Downloadable document
    app.post(`/api/v1/${name}/download`, (req: Request, res: Response) => {
      try {
        const fundName = req.body?.__fundName || req.body?.registrantName || req.body?.seriesName;
        const doc = handler.gen(req.body, fundName);
        const body = handler.format === 'xml' ? doc.xml : doc.html;
        const ext = handler.format === 'xml' ? 'xml' : 'html';
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${name}.${ext}"`);
        res.send(body);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
  });

  // File (complete workflow: validate -> generate -> submit)
  app.post('/api/v1/file', (req: Request, res: Response) => {
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
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return app;
}
