import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./utils";
import { handleDeployWebhook } from "./webhook";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Playwright scraper route
app.get('/api/scrape-names', async (req, res) => {
  try {
    const { chromium } = await import('playwright');
    const url = (req.query.url as string) || 'https://www.sequoiacap.com/our-team/';
    const selectorParam = (req.query.selector as string) || '';
    const defaults = [
      '[class*="member"] h3, [class*="member"] .name',
      '[class*="person"] h3, [class*="person"] .name',
      '[class*="team"] a, [class*="people"] a',
      '.team-member, .member-card, .person-card, .profile .name, .bio-card .name'
    ];
    const selectors = selectorParam ? [selectorParam] : defaults;

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      try { await page.click('text=/^(accept|agree|allow|got it|ok|accept all)$/i', { timeout: 2000 }); } catch {}
      await page.evaluate(async () => { await new Promise<void>(r => { let t=0,d=350,i=setInterval(()=>{window.scrollBy(0,d);t+=d;if(t>=1400||(innerHeight+scrollY)>=document.documentElement.scrollHeight){clearInterval(i);r();}},120); }); });
      let names: string[] = [];
      for (const sel of selectors) {
        const any = await page.$(sel);
        if (!any) continue;
        const found = await page.$$eval(sel, els => els.map(el => (el as HTMLElement).innerText?.trim()).filter(Boolean));
        names.push(...found);
      }
      names = names.flatMap(t=>t.split('\n')).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean)
                   .filter(s=>/^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(s))
                   .filter((v,i,a)=>a.indexOf(v)===i).slice(0,200);

      res.status(200).json({ message:'Playwright scrape OK', url, selector: selectorParam || '(defaults)', count: names.length, names, timestamp: new Date().toISOString() });
    } finally { await browser.close(); }
  } catch (err:any) { res.status(500).json({ error:'Scrape failed', details: err?.message || String(err) }); }
});

(async () => {
  // Webhook route for auto-deployment
  app.post('/api/deploy', handleDeployWebhook);

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
