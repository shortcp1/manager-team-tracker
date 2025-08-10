#!/usr/bin/env tsx
import { webScraper } from '../server/services/scraper';
import fs from 'fs';
import path from 'path';

async function main() {
  const sequoia = {
    id: 'sequoia-test',
    name: 'Sequoia Capital',
    url: 'https://www.sequoiacap.com',
    teamPageUrl: 'https://www.sequoiacap.com/people/',
    type: 'Venture Capital',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const outDir = path.resolve(process.cwd(), 'attached_assets');
  await fs.promises.mkdir(outDir, { recursive: true });

  // HTTP fetch only
  const httpRes = await fetch(sequoia.teamPageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await httpRes.text();
  await fs.promises.writeFile(path.join(outDir, 'sequoia-http.html'), html, 'utf-8');
  const httpMembers = await webScraper.parseTeamPage(html, sequoia.url);

  // Puppeteer render
  await webScraper.initialize();
  const browser: any = (webScraper as any).browser;
  const page = await browser.newPage();
  await (webScraper as any).preparePage(page);
  await page.goto(sequoia.teamPageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
  await (webScraper as any).clickAllTabs(page);
  await (webScraper as any).clickLoadMore(page);
  await (webScraper as any).infiniteScroll(page);
  const renderedHtml = await page.content();
  await fs.promises.writeFile(path.join(outDir, 'sequoia-puppeteer.html'), renderedHtml, 'utf-8');
  const puppeteerMembers = await webScraper.parseTeamPage(renderedHtml, sequoia.url);
  await page.close();
  await webScraper.close();

  function sample(names: string[], n = 10) {
    return names.slice(0, n).join(', ');
  }

  console.log('HTTP count:', httpMembers.length);
  console.log('HTTP sample:', sample(httpMembers.map(m => `${m.name}${m.title ? ' - ' + m.title : ''}`)));
  console.log('Puppeteer count:', puppeteerMembers.length);
  console.log('Puppeteer sample:', sample(puppeteerMembers.map(m => `${m.name}${m.title ? ' - ' + m.title : ''}`)));
  console.log('Saved:', path.join(outDir, 'sequoia-http.html'));
  console.log('Saved:', path.join(outDir, 'sequoia-puppeteer.html'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}); 