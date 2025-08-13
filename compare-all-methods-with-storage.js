#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { nameScrapeResults, pdfUploads, scrapeHistory, firms } from './shared/schema.ts';
import { randomUUID } from 'crypto';

dotenv.config();

// Database setup
const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql);

const sequoia = {
  id: 'e89f47b7-1c40-44ab-a6e8-cb6640c4e1b2',
  name: 'Sequoia Capital',
  teamPageUrl: 'https://www.sequoiacap.com/our-team/'
};

console.log('🏆 COMPREHENSIVE METHODOLOGY COMPARISON WITH DATABASE STORAGE');
console.log('============================================================\n');
console.log(`Testing: ${sequoia.name}`);
console.log(`URL: ${sequoia.teamPageUrl}\n`);

// Method 1: Web Scraping with Storage
async function webScrapingWithStorage(scrapeId) {
  console.log('🌐 Method 1: Web Scraping');
  console.log('-'.repeat(40));
  
  const startTime = Date.now();
  let names = [];
  let error = null;
  let browser;
  let context;
  
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1366, height: 900 }
    });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const page = await context.newPage();

    await page.setDefaultTimeout(3000);
    await page.setDefaultNavigationTimeout(15000);

    async function acceptCookies(page) {
      const candidates = [
        '#onetrust-accept-btn-handler',
        '#truste-consent-button',
        '#CybotCookiebotDialogBodyButtonAccept',
        '[data-didomi-accept-button]',
        '.qc-cmp2-summary-buttons .qc-cmp2-accept-all, .qc-cmp2-button.qc-cmp2-accept-all',
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        'button:has-text("Allow all")',
        'button:has-text("Got it")',
        'button[aria-label="Accept all"]'
      ];
      for (const sel of candidates) {
        const btn = page.locator(sel).first();
        const visible = await btn.isVisible().catch(() => false);
        if (visible) {
          await btn.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
          break;
        }
      }
    }

    const METHOD_TIMEOUT_MS = 90000; // hard stop so we never spin forever
    const deadline = Date.now() + METHOD_TIMEOUT_MS;

    await page.goto(sequoia.teamPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await acceptCookies(page);
    // Readiness: ensure at least one person link is visible
    await page.locator('a[href*="/people/"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

    // === Generic roster-harvest helpers (site-agnostic) ===
    const CARD_NAME_SEL =
      'h2.ink__title, h3.ink__title, [itemprop="name"], .team-card h2, .team-card h3, .person-card h2, .person-card h3, a[href*="/people/"]';
    const LOAD_MORE_SEL = '.facetwp-load-more:not(.facetwp-hidden), button:has-text("Load more"), a:has-text("Load more"), button:has-text("Show more"), a:has-text("Show more")';
    const tabsSel = [
      '[role="tablist"] [role="tab"]',
      '[role="tab"]',
      '.tabs [role="tab"]',
      '.ink-tabs [role="tab"]',
      // generic chips/segments commonly used for category filters
      '.ink-chips button', '.ink-chips a',
      '.segmented-control button', '.segmented-control a',
      '.facetwp-facet button', '.facetwp-facet a[role="button"]',
      '.facetwp-facet .facetwp-radio', '.facetwp-facet .facetwp-checkbox'
    ].join(',');

    async function collectVisibleNames(scope = page) {
      const base = (typeof scope.locator === 'function') ? scope.locator(CARD_NAME_SEL) : page.locator(CARD_NAME_SEL);
      
      const matchingElements = await base.count();
      
      if (matchingElements === 0) {
        // Try to get page title and some basic content for debugging
        const title = await page.title();
        console.log(`⚠️ No matching elements found on page: ${title}`);
      }
      
      const texts = await base.evaluateAll(els => {
        const out = [];
        const nameAtStart = /^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z'.-]+)+/; // leading proper name (>=2 words), handles both proper case and ALL CAPS
        for (const el of els) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const visible = style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
          
          if (!visible) continue;

          const candidates = [];
          const t = (el.innerText || '').trim(); if (t) candidates.push(t);
          const al = (el.getAttribute('aria-label') || '').trim(); if (al) candidates.push(al);
          const title = (el.getAttribute('title') || '').trim(); if (title) candidates.push(title);

          for (const c of candidates) {
            // First try to extract just the name part if there's additional text after newline
            const lines = c.split('\n');
            const firstLine = lines[0].trim();
            
            const m = firstLine.match(nameAtStart);
            if (m && m[0]) { out.push(m[0]); break; }
          }
        }
        
        return Array.from(new Set(out)); // de-dupe preserve order
      });
      
      // Final sanity filter - handle both proper case and ALL CAPS
      const filteredNames = texts.filter(n => /^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z'.-]+)+$/.test(n));
      
      // Convert ALL CAPS names to proper case
      const properCaseNames = filteredNames.map(name => {
        // If name is all caps, convert to proper case
        if (name === name.toUpperCase()) {
          return name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        }
        return name;
      });
      
      // Filter out obvious non-person names (common false positives)
      const falsePositives = [
        'Our Team', 'Load More', 'Toggle Categories', 'View Profile', 
        'Get In Touch', 'General Counsel', 'Senior Director', 'VP of Talent',
        'Deputy CCO', 'Principal Designer', 'Seed Early', 'Growth Operator',
        'What Does Sequoia Look', 'The Future', 'If You Are Heads Down',
        'The Future of Observability'
      ];
      const cleanedNames = properCaseNames.filter(name => 
        !falsePositives.some(fp => name.toLowerCase().includes(fp.toLowerCase())) &&
        name.split(' ').length <= 4 // Most real names are 2-4 words
      );
      
      return cleanedNames;
    }

    async function namesSignature(scope = page) {
      const texts = await scope.locator(CARD_NAME_SEL).allInnerTexts().catch(() => []);
      return texts.map(t => t.trim()).filter(Boolean).join('|');
    }

    async function expandWithinState(scope = page, deadlineTs = Date.now() + 60000) {
      // Click load-more a few times AND scroll until height stabilizes
      for (let i = 0; i < 12 && Date.now() < deadlineTs; i++) {
        const loadMore = scope.locator(LOAD_MORE_SEL).first();
        const visible = await loadMore.isVisible().catch(() => false);
        if (visible) {
          await loadMore.click({ timeout: 1000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
        }
        const stable = await page.evaluate(async () => {
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          let last = 0, same = 0;
          for (let j = 0; j < 8; j++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(150);
            const h = document.scrollingElement?.scrollHeight || document.body.scrollHeight;
            if (h === last) { same++; if (same >= 2) return true; }
            else { same = 0; last = h; }
          }
          return false;
        });
        if (!visible && stable) break;
      }
    }

    async function clickStateAndHarvest(tab, label) {
      const controlsId = await tab.getAttribute('aria-controls').catch(() => null);
      const panel = controlsId ? page.locator(`#${controlsId}`) : null;

      const beforeSig = await namesSignature(panel || page);

      // Ensure tab is visible in viewport before clicking
      await page.evaluate(el => el && el.scrollIntoView({ block: 'center' }), await tab.elementHandle().catch(() => null)).catch(() => {});
      await tab.click({ timeout: 1000, force: true }).catch(() => {});

      const ACTIVE_CLASS_RE = /\b(active|is-active|selected|current)\b/i;

      // Wait for either: (1) aria-selected true, (2) active-like class, or (3) roster signature change
      const waited = await Promise.race([
        page.waitForFunction((sel, label, reStr) => {
          const re = new RegExp(reStr, 'i');
          const els = Array.from(document.querySelectorAll(sel));
          const el = els.find(e => (e.innerText || '').trim() === label || (e.getAttribute('aria-label') || '').trim() === label);
          if (!el) return false;
          const selected = el.getAttribute('aria-selected') === 'true' || re.test(el.className || '');
          return !!selected;
        }, tabsSel, label, ACTIVE_CLASS_RE.source, { timeout: 2000 }).then(() => true).catch(() => false),
        page.waitForFunction(([sel, prev]) => {
          const texts = Array.from(document.querySelectorAll(sel))
            .filter(el => {
              const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && el.offsetParent !== null;
            })
            .map(el => el.innerText.trim())
            .filter(Boolean)
            .join('|');
          return texts && texts !== prev;
        }, [CARD_NAME_SEL, beforeSig], { timeout: 3000 }).then(() => true).catch(() => false)
      ]);
      if (!waited) await page.waitForTimeout(600);

      await expandWithinState(panel || page);
      const names = await collectVisibleNames(panel || page).catch(() => []);
      return names;
    }

    async function harvestAllStates() {
      const collected = new Set();
      const intelligence = {
        discoveredSections: [],
        urlPatterns: [],
        siteStructure: "tab-based filtering",
        baseUrl: sequoia.teamPageUrl,
        defaultViewNames: 0,
        sitemapUrls: []
      };

      // Capture initial URL and default state
      const initialUrl = page.url();
      
      // default state first
      await expandWithinState(page);
      const defaultNames = await collectVisibleNames(page);
      defaultNames.forEach(n => collected.add(n));
      intelligence.defaultViewNames = defaultNames.length;
      
      // Retry once if still nothing
      if (collected.size === 0) {
        await expandWithinState(page);
        (await collectVisibleNames(page)).forEach(n => collected.add(n));
      }

      // Try to discover sitemap URLs
      try {
        await page.goto(`${new URL(sequoia.teamPageUrl).origin}/sitemap.xml`, { timeout: 5000 });
        const sitemapContent = await page.textContent('body').catch(() => '');
        const teamUrls = sitemapContent.match(/https?:\/\/[^<]+(?:team|people)[^<]*/gi) || [];
        intelligence.sitemapUrls = [...new Set(teamUrls)].slice(0, 10);
        
        // Go back to team page
        await page.goto(sequoia.teamPageUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      } catch (e) {
        console.log(`  ℹ️ Could not access sitemap: ${e.message}`);
      }

      const labels = await page.$$eval(tabsSel, els => {
        const vals = [];
        for (const el of els) {
          const t = (el.innerText || '').trim();
          const a = (el.getAttribute('aria-label') || '').trim();
          const label = (a || t).slice(0, 80);
          if (label) vals.push(label);
        }
        return [...new Set(vals)].slice(0, 24);
      }).catch(() => []);

      const FALLBACK_LABELS = ['Seed', 'Early', 'Seed/Early', 'Growth', 'Operator', 'Operations', 'Platform'];
      for (const w of FALLBACK_LABELS) {
        if (!labels.includes(w)) {
          const loc = page.locator(tabsSel).filter({ hasText: w }).first();
          const exists = await loc.count().catch(() => 0);
          if (exists > 0) labels.push(w);
        }
      }

      for (const label of labels) {
        const tab = page.locator(tabsSel).filter({ hasText: label }).first();
        const visible = await tab.isVisible().catch(() => false);
        if (!visible) continue;
        
        const beforeCount = collected.size;
        const beforeUrl = page.url();
        
        const names = await clickStateAndHarvest(tab, label);
        const afterUrl = page.url();
        
        // Capture URL pattern if it changed
        let urlPattern = null;
        if (afterUrl !== beforeUrl) {
          const afterUrlObj = new URL(afterUrl);
          const beforeUrlObj = new URL(beforeUrl);
          if (afterUrlObj.search !== beforeUrlObj.search) {
            urlPattern = afterUrlObj.search;
          }
        }
        
        names.forEach(n => collected.add(n));
        const newNamesCount = collected.size - beforeCount;
        
        intelligence.discoveredSections.push({
          name: label,
          memberCount: names.length,
          newMembersFound: newNamesCount,
          urlPattern: urlPattern,
          fullUrl: urlPattern ? `${sequoia.teamPageUrl}${urlPattern}` : null
        });
        
        if (newNamesCount === 0) {
          console.log(`  ⚠︎ No new names detected after clicking "${label}" (possible hidden panel/lazy load).`);
        }
        console.log(`↪︎ state "${label}" ⇒ total so far: ${collected.size}`);
      }

      // Discover URL patterns from successful sections
      intelligence.urlPatterns = intelligence.discoveredSections
        .filter(s => s.urlPattern)
        .map(s => s.urlPattern);

      // Test direct navigation to discovered URLs for additional coverage
      await testDirectUrlNavigation(intelligence, collected);

      // Store intelligence for use by other methods
      global.playwrightIntelligence = intelligence;
      console.log(`🧠 Intelligence gathered: ${intelligence.discoveredSections.length} sections, ${intelligence.urlPatterns.length} URL patterns, ${intelligence.sitemapUrls.length} sitemap URLs`);

      return Array.from(collected).sort();
    }

    async function testDirectUrlNavigation(intelligence, collected) {
      console.log(`🔍 Testing direct URL navigation for additional coverage...`);
      
      // Test common role patterns that might not have been found via tabs
      const commonRoles = ['partner', 'advisor', 'board', 'team', 'leadership', 'investment', 'venture'];
      const urlsToTest = new Set();
      
      // Add sitemap URLs
      intelligence.sitemapUrls.forEach(url => urlsToTest.add(url));
      
      // Generate potential URLs based on discovered patterns
      if (intelligence.urlPatterns.length > 0) {
        // If we found a pattern like ?_role=operator, try other common roles
        const pattern = intelligence.urlPatterns[0];
        if (pattern.includes('_role=')) {
          commonRoles.forEach(role => {
            urlsToTest.add(`${sequoia.teamPageUrl}?_role=${role}`);
          });
        }
      }
      
      // Test a few URLs to see if they yield additional names
      const urlArray = Array.from(urlsToTest).slice(0, 5); // Limit to avoid too many requests
      
      for (const url of urlArray) {
        try {
          console.log(`  🌐 Testing URL: ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(2000);
          
          const beforeSize = collected.size;
          const urlNames = await collectVisibleNames(page);
          urlNames.forEach(n => collected.add(n));
          const newNames = collected.size - beforeSize;
          
          if (newNames > 0) {
            console.log(`  ✅ Found ${newNames} additional names at ${url}`);
            intelligence.discoveredSections.push({
              name: `Direct URL: ${new URL(url).search || url}`,
              memberCount: urlNames.length,
              newMembersFound: newNames,
              urlPattern: new URL(url).search,
              fullUrl: url
            });
          }
        } catch (e) {
          console.log(`  ⚠️ Could not access ${url}: ${e.message}`);
        }
      }
    }
    // === End helpers ===

    names = await harvestAllStates();

  } catch (err) {
    error = err.message;
    console.log(`❌ Failed: ${error}`);
  }

  try { if (context) await context.close(); } catch (_) {}
  try { if (browser) await browser.close(); } catch (_) {}

  const duration = Date.now() - startTime;

  // Save to database
  try {
    await db.insert(nameScrapeResults).values({
      firmId: sequoia.id,
      method: 'web',
      names: names,
      status: error ? 'error' : 'success',
      errorMessage: error
    });

    await db.insert(scrapeHistory).values({
      firmId: sequoia.id,
      status: error ? 'error' : 'success',
      membersFound: names.length,
      changesDetected: 0,
      errorMessage: error,
      duration
    });

    console.log('💾 Saved to database');
  } catch (dbError) {
    console.log(`⚠️  Database save failed: ${dbError.message}`);
  }

  // Also persist into per-run results (session-scoped)
  await sql`CREATE TABLE IF NOT EXISTS scrape_results (
    scrape_id uuid NOT NULL,
    firm_id uuid NOT NULL,
    method text NOT NULL,
    names jsonb NOT NULL,
    status text NOT NULL,
    error_message text,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (scrape_id, method)
  )`;

  try {
    const namesJson = JSON.stringify(names);
    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${sequoia.id}, 'web', ${namesJson}::jsonb, ${error ? 'error' : 'success'}, ${error ?? null})
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
  } catch (e) {
    console.log('⚠️  scrape_results insert failed (web):', e.message);
  }

  return names;
}

// Method 2: Perplexity API with Storage
async function perplexityAPIWithStorage(scrapeId) {
  console.log('\n🤖 Method 2: Perplexity API');
  console.log('-'.repeat(40));
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log('❌ API key not found');
    
    await db.insert(nameScrapeResults).values({
      firmId: sequoia.id,
      method: 'perplexity',
      names: [],
      status: 'error',
      errorMessage: 'API key not found'
    });

    // Also persist into per-run results (session-scoped)
    await sql`CREATE TABLE IF NOT EXISTS scrape_results (
      scrape_id uuid NOT NULL,
      firm_id uuid NOT NULL,
      method text NOT NULL,
      names jsonb NOT NULL,
      status text NOT NULL,
      error_message text,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (scrape_id, method)
    )`;

    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${sequoia.id}, 'perplexity', ${sql.json([])}, 'error', 'API key not found')
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
    
    return [];
  }
  
  const startTime = Date.now();
  let names = [];
  let error = null;
  
  // Get intelligence from Playwright if available
  const intelligence = global.playwrightIntelligence;
  let enhancedPrompt = `Visit ${sequoia.teamPageUrl} and collect ALL unique person names from the team's roster by FULLY interacting with the UI.`;
  
  if (intelligence) {
    console.log(`🧠 Using Playwright intelligence to enhance Perplexity search...`);
    
    const sectionInfo = intelligence.discoveredSections
      .map(s => `- ${s.name}: ${s.memberCount} members${s.fullUrl ? ` at ${s.fullUrl}` : ''}`)
      .join('\n');
    
    const urlInfo = intelligence.urlPatterns.length > 0 
      ? `\nURL patterns discovered: ${intelligence.urlPatterns.join(', ')}`
      : '';
    
    const sitemapInfo = intelligence.sitemapUrls.length > 0
      ? `\nAdditional URLs from sitemap: ${intelligence.sitemapUrls.slice(0, 3).join(', ')}`
      : '';
    
    enhancedPrompt = `Based on initial reconnaissance of ${sequoia.teamPageUrl}, the following team sections have been discovered:

${sectionInfo}

The site structure: ${intelligence.siteStructure}
Default view contains: ${intelligence.defaultViewNames} names${urlInfo}${sitemapInfo}

Please systematically visit the team page and ALL discovered sections/URLs to collect every unique person name. Be thorough:
- Visit the main team page: ${sequoia.teamPageUrl}
- Click every tab/filter to switch between sections
- If URL patterns exist, try direct navigation to role-specific URLs
- Look for any additional team sections or individual profile pages
- Cross-check your results against the patterns discovered above
- Output ONLY the names, one per line (no roles, punctuation, or duplicates).`;
  } else {
    enhancedPrompt += ` Do this in a generic way:
- Click every tab within any element that has role="tablist" (i.e., [role="tab"]) to switch categories/sections.
- If there are filters, chips, or facets near the roster, click each state and re-collect.
- For each state, click any "Load more" or pagination controls until exhausted and scroll to the bottom.
- Output ONLY the names, one per line (no roles, punctuation, or duplicates).`;
  }
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    names = content.split(/\n|,|;/).map(n => n.trim()).filter(n => 
      n && /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(n)
    );
    
    names = [...new Set(names)].sort();
    console.log(`✅ Success: ${names.length} names found`);
    
  } catch (err) {
    error = err.message;
    console.log(`❌ Failed: ${error}`);
  }
  
  const duration = Date.now() - startTime;
  
  // Save to database
  try {
    await db.insert(nameScrapeResults).values({
      firmId: sequoia.id,
      method: 'perplexity',
      names: names,
      status: error ? 'error' : 'success',
      errorMessage: error
    });
    
    console.log('💾 Saved to database');
  } catch (dbError) {
    console.log(`⚠️  Database save failed: ${dbError.message}`);
  }

  await sql`CREATE TABLE IF NOT EXISTS scrape_results (
    scrape_id uuid NOT NULL,
    firm_id uuid NOT NULL,
    method text NOT NULL,
    names jsonb NOT NULL,
    status text NOT NULL,
    error_message text,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (scrape_id, method)
  )`;

  try {
    const namesJson = JSON.stringify(names);
    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${sequoia.id}, 'perplexity', ${namesJson}::jsonb, ${error ? 'error' : 'success'}, ${error ?? null})
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
  } catch (e) {
    console.log('⚠️  scrape_results insert failed (perplexity):', e.message);
  }
  
  return names;
}

// Method 3: PDF Parsing with Storage
async function pdfParsingWithStorage(scrapeId) {
  console.log('\n📄 Method 3: PDF Parsing');
  console.log('-'.repeat(40));
  
  const pdfPath = '/Users/christianshort/sequoia_team.pdf';
  const startTime = Date.now();
  let names = [];
  let error = null;
  
  try {
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF file not found');
    }
    
    const buffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(buffer);
    const text = data.text || '';
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

    // Track first-seen PDF order per name
    const orderMap = new Map();
    let orderIdx = 1;

    // Detect team sections and map names => team(s)
    const teamMap = new Map(); // name => Set(teams)
    let currentTeam = 'Unknown';
    const setTeam = (t) => { currentTeam = t; };

    const isName = (s) => /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(s);

    const TEAM_MARKERS = [
      { re: /^(growth|growth team|growth fund)$/i, label: 'Growth' },
      { re: /^(operations|ops|operator|operators|operating|platform|platform team)$/i, label: 'Operations' },
      { re: /^(seed|early|seed & early|seed\/early|early team)$/i, label: 'Seed/Early' }
    ];

    for (const line of lines) {
      // Treat clear section headers as team switches
      const marker = TEAM_MARKERS.find(m => m.re.test(line));
      if (marker) { setTeam(marker.label); continue; }

      if (isName(line)) {
        // Skip obvious non-person lines even if regex matches
        const fp = ['Our Team','Load More','Toggle Categories','View Profile','Get In Touch','General Counsel','Senior Director','VP of Talent','Deputy CCO','Principal Designer','Seed Early','Growth Operator'];
        if (fp.some(x => line.toLowerCase().includes(x.toLowerCase()))) continue;
        if (!orderMap.has(line)) orderMap.set(line, orderIdx++);
        if (!teamMap.has(line)) teamMap.set(line, new Set());
        teamMap.get(line).add(currentTeam);
      }
    }

    // Prefer names derived while tracking team sections; fallback to regex-only
    if (teamMap.size > 0) {
      names = Array.from(teamMap.keys()).sort();
    } else {
      names = lines.filter(line => /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(line));
      const falsePositives = [
        'Our Team', 'Load More', 'Toggle Categories', 'View Profile', 
        'Get In Touch', 'General Counsel', 'Senior Director', 'VP of Talent',
        'Deputy CCO', 'Principal Designer', 'Seed Early', 'Growth Operator'
      ];
      names = names.filter(name => !falsePositives.some(fp => name.toLowerCase().includes(fp.toLowerCase())));
      names = [...new Set(names)].sort();
    }

    console.log(`✅ Success: ${names.length} names found`);

    // Persist canonical roster (PDF-derived) with team labels for this firm
    await sql`CREATE TABLE IF NOT EXISTS canonical_roster (
      firm_id uuid NOT NULL,
      name text NOT NULL,
      team text NOT NULL,
      pdf_order integer,
      PRIMARY KEY (firm_id, name)
    )`;
    await sql`ALTER TABLE canonical_roster ADD COLUMN IF NOT EXISTS pdf_order integer`;

    // Merge teams if multiple sections list the same person
    const rosterRows = names.map(n => {
      const teams = teamMap.get(n) ? Array.from(teamMap.get(n)) : ['Unknown'];
      const combined = teams.sort().join(' / ');
      const ord = orderMap.get(n) ?? null;
      return { name: n, team: combined, pdf_order: ord };
    });

    for (const row of rosterRows) {
      await sql`INSERT INTO canonical_roster (firm_id, name, team, pdf_order)
                VALUES (${sequoia.id}, ${row.name}, ${row.team}, ${row.pdf_order})
                ON CONFLICT (firm_id, name) DO UPDATE
                SET team = EXCLUDED.team,
                    pdf_order = COALESCE(EXCLUDED.pdf_order, canonical_roster.pdf_order)`;
    }

    // Save PDF upload record
    await db.insert(pdfUploads).values({
      firmId: sequoia.id,
      filePath: pdfPath
    });
    
  } catch (err) {
    error = err.message;
    console.log(`❌ Failed: ${error}`);
  }
  
  const duration = Date.now() - startTime;
  
  // Save to database
  try {
    await db.insert(nameScrapeResults).values({
      firmId: sequoia.id,
      method: 'pdf',
      names: names,
      status: error ? 'error' : 'success',
      errorMessage: error
    });
    
    console.log('💾 Saved to database');
  } catch (dbError) {
    console.log(`⚠️  Database save failed: ${dbError.message}`);
  }

  await sql`CREATE TABLE IF NOT EXISTS scrape_results (
    scrape_id uuid NOT NULL,
    firm_id uuid NOT NULL,
    method text NOT NULL,
    names jsonb NOT NULL,
    status text NOT NULL,
    error_message text,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (scrape_id, method)
  )`;

  try {
    const namesJson = JSON.stringify(names);
    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${sequoia.id}, 'pdf', ${namesJson}::jsonb, ${error ? 'error' : 'success'}, ${error ?? null})
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
  } catch (e) {
    console.log('⚠️  scrape_results insert failed (pdf):', e.message);
  }
  
  return names;
}

// Enhanced Analysis with Database Queries
async function analyzeResultsWithHistory(webNames, perplexityNames, pdfNames) {
  console.log('\n🔍 DETAILED ANALYSIS');
  console.log('='.repeat(50));
  
  // Convert to sets for easier comparison
  const webSet = new Set(webNames.map(n => n.toLowerCase()));
  const perplexitySet = new Set(perplexityNames.map(n => n.toLowerCase()));
  const pdfSet = new Set(pdfNames.map(n => n.toLowerCase()));
  
  // Find intersections
  const allNames = new Set([...webNames, ...perplexityNames, ...pdfNames]);
  
  const webPerplexity = webNames.filter(name => 
    perplexitySet.has(name.toLowerCase())
  );
  
  const webPdf = webNames.filter(name => 
    pdfSet.has(name.toLowerCase())
  );
  
  const perplexityPdf = perplexityNames.filter(name => 
    pdfSet.has(name.toLowerCase())
  );
  
  const allThree = webNames.filter(name => 
    perplexitySet.has(name.toLowerCase()) && pdfSet.has(name.toLowerCase())
  );
  
  // Display results
  console.log(`📊 Current Run Results:`);
  console.log(`  🌐 Web Scraping: ${webNames.length} names`);
  console.log(`  🤖 Perplexity: ${perplexityNames.length} names`);
  console.log(`  📄 PDF Parsing: ${pdfNames.length} names`);
  console.log(`  📈 Total Unique: ${allNames.size} names\n`);
  
  console.log(`🤝 Overlap Analysis:`);
  console.log(`  Web ∩ Perplexity: ${webPerplexity.length} names`);
  console.log(`  Web ∩ PDF: ${webPdf.length} names`);
  console.log(`  Perplexity ∩ PDF: ${perplexityPdf.length} names`);
  console.log(`  All Three: ${allThree.length} names\n`);
  
  // Query historical data
  try {
    console.log('📚 Historical Analysis:');
    
    const historicalResults = await db.select()
      .from(nameScrapeResults)
      .where(sql`firm_id = ${sequoia.id}`)
      .orderBy(sql`created_at DESC`)
      .limit(10);
    
    const methodCounts = historicalResults.reduce((acc, result) => {
      acc[result.method] = (acc[result.method] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`  Total historical runs: ${historicalResults.length}`);
    Object.entries(methodCounts).forEach(([method, count]) => {
      console.log(`  ${method.toUpperCase()}: ${count} runs`);
    });
    
    // Show recent successful runs
    const recentSuccessful = historicalResults.filter(r => r.status === 'success');
    if (recentSuccessful.length > 0) {
      console.log('\n📈 Recent Successful Results:');
      recentSuccessful.slice(0, 3).forEach((result, index) => {
        const timeAgo = new Date() - new Date(result.createdAt);
        const minutesAgo = Math.floor(timeAgo / 60000);
        console.log(`  ${index + 1}. ${result.method.toUpperCase()}: ${result.names.length} names (${minutesAgo}m ago)`);
      });
    }
    
  } catch (dbError) {
    console.log(`⚠️  Historical analysis failed: ${dbError.message}`);
  }
  
  if (allThree.length > 0) {
    console.log(`\n✨ Names found by ALL methods:`);
    allThree.forEach(name => console.log(`    • ${name}`));
  }
  
  // Accuracy assessment
  const baselineSize = Math.max(webNames.length, perplexityNames.length, pdfNames.length);
  const agreement = (allThree.length / baselineSize) * 100;
  
  console.log(`\n📈 Quality Assessment:`);
  console.log(`  Baseline (largest result): ${baselineSize} names`);
  console.log(`  Three-way agreement: ${agreement.toFixed(1)}%`);
  
  if (agreement > 70) {
    console.log(`  🏆 High confidence - methods strongly agree`);
  } else if (agreement > 40) {
    console.log(`  ⚠️  Medium confidence - some disagreement`);
  } else {
    console.log(`  🔍 Low confidence - significant disagreement, investigation needed`);
  }
  
  return {
    webNames,
    perplexityNames, 
    pdfNames,
    allNames: Array.from(allNames).sort(),
    commonToAll: allThree,
    agreement
  };
}

// Build and persist a comparison table based off canonical PDF roster
async function savePdfAnchoredComparisonTable(scrapeId, webNames, perplexityNames, pdfNames) {
  // Ensure destination table exists
  await sql`CREATE TABLE IF NOT EXISTS scrape_comparison_runs (
    scrape_id uuid NOT NULL,
    firm_id uuid NOT NULL,
    name text NOT NULL,
    team text,
    web text,
    perplexity text,
    pdf text,
    PRIMARY KEY (scrape_id, name)
  )`;

  // Pull canonical roster for this firm
  const roster = await sql`SELECT name, team FROM canonical_roster WHERE firm_id = ${sequoia.id} ORDER BY pdf_order NULLS LAST, name`;

  // Build presence sets from the current run results
  const webSet = new Set(webNames.map(n => n.toLowerCase()));
  const pxSet = new Set(perplexityNames.map(n => n.toLowerCase()));
  const pdfSet = new Set(pdfNames.map(n => n.toLowerCase()));

  // Clear existing rows for this run and insert fresh
  await sql`DELETE FROM scrape_comparison_runs WHERE scrape_id = ${scrapeId}`;

  const rows = roster.map(r => ({
    name: r.name,
    team: r.team,
    web: webSet.has(r.name.toLowerCase()) ? 'x' : '',
    perplexity: pxSet.has(r.name.toLowerCase()) ? 'x' : '',
    pdf: pdfSet.has(r.name.toLowerCase()) ? 'x' : ''
  }));

  // Batch insert
  for (const row of rows) {
    await sql`INSERT INTO scrape_comparison_runs (scrape_id, firm_id, name, team, web, perplexity, pdf)
              VALUES (${scrapeId}, ${sequoia.id}, ${row.name}, ${row.team}, ${row.web}, ${row.perplexity}, ${row.pdf})
              ON CONFLICT (scrape_id, name) DO UPDATE
              SET team = EXCLUDED.team, web = EXCLUDED.web, perplexity = EXCLUDED.perplexity, pdf = EXCLUDED.pdf`;
  }

  console.log(`📋 Built scrape_comparison_runs for run ${scrapeId}, firm ${sequoia.name}: ${rows.length} rows`);
}

// Print the PDF-anchored comparison table to the terminal
async function printComparisonTable(scrapeId) {
  // Perplexity-only names (not present in PDF), with fuzzy matches (printed before table)
  try {
    const pxRows = await sql`SELECT names FROM scrape_results WHERE scrape_id = ${scrapeId} AND method = 'perplexity' LIMIT 1`;
    const rosterRows = await sql`SELECT name FROM canonical_roster WHERE firm_id = ${sequoia.id}`;
    const pdfNames = rosterRows.map(r => r.name);
    const pdfSet = new Set(pdfNames.map(n => n.toLowerCase()));
    const pxList = (pxRows?.[0]?.names || []).map(n => String(n)).filter(Boolean);
    const pxOnly = pxList.filter(n => !pdfSet.has(n.toLowerCase()));

    function lev(a, b) {
      a = a.toLowerCase(); b = b.toLowerCase();
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }
      return dp[m][n];
    }

    function bestMatch(name) {
      let bestCand = null; let bestScore = -1;
      for (const cand of pdfNames) {
        const d = lev(name, cand);
        const score = 1 - d / Math.max(name.length, cand.length);
        if (score > bestScore) { bestScore = score; bestCand = cand; }
      }
      return { candidate: bestCand, score: Number(bestScore.toFixed(2)) };
    }

    if (pxOnly.length > 0) {
      console.log('\n🔎 Perplexity-only names (not in PDF) with closest PDF match:');
      for (const n of pxOnly.sort((a, b) => a.localeCompare(b))) {
        const { candidate, score } = bestMatch(n);
        const hint = candidate ? ` (closest: ${candidate}, score ${score})` : '';
        console.log('  •', n + hint);
      }
    } else {
      console.log('\n🔎 Perplexity-only names (not in PDF): (none)');
    }
  } catch (e) {
    console.log('⚠️  Could not compute Perplexity-only names:', e.message);
  }

  // Query rows ordered by PDF appearance
  const rows = await sql`SELECT scr.name, cr.team, scr.web, scr.perplexity, scr.pdf
                         FROM scrape_comparison_runs scr
                         JOIN canonical_roster cr
                           ON cr.firm_id = scr.firm_id
                          AND cr.name = scr.name
                         WHERE scr.scrape_id = ${scrapeId}
                         ORDER BY cr.pdf_order NULLS LAST, scr.name`;

  if (!rows || rows.length === 0) {
    console.log('\n( No rows to display for this run. )');
    return;
  }

  console.log('\n🗒️  PDF-anchored comparison table (x = found)');
  console.table(rows.map(r => ({
    Name: r.name,
    Team: r.team,
    Web: r.web,
    Perplexity: r.perplexity,
    PDF: r.pdf,
  })));
}

// Run comprehensive test with database storage
async function runComprehensiveTestWithStorage() {
  const startTime = Date.now();

  const scrapeId = randomUUID();
  await sql`CREATE TABLE IF NOT EXISTS scrape_sessions (
    id uuid PRIMARY KEY,
    firm_id uuid NOT NULL,
    started_at timestamptz DEFAULT now()
  )`;
  await sql`INSERT INTO scrape_sessions (id, firm_id) VALUES (${scrapeId}, ${sequoia.id})`;
  console.log('🆔 Scrape session:', scrapeId);

  console.log('🗄️  Database: Connected to local PostgreSQL');
  console.log('💾 All results will be saved for historical analysis\n');

  // Run Playwright first to gather intelligence, then Perplexity with that intel, then PDF
  console.log('🔄 Running methods sequentially for intelligence sharing...');
  const webNames = await webScrapingWithStorage(scrapeId);
  const perplexityNames = await perplexityAPIWithStorage(scrapeId);
  const pdfNames = await pdfParsingWithStorage(scrapeId);

  const results = await analyzeResultsWithHistory(webNames, perplexityNames, pdfNames);

  await savePdfAnchoredComparisonTable(scrapeId, webNames, perplexityNames, pdfNames);
  await printComparisonTable(scrapeId);
  console.log(`\n🧮 Query this run (PDF order):\n  SELECT scr.name, cr.team, scr.web, scr.perplexity, scr.pdf\n  FROM scrape_comparison_runs scr\n  JOIN canonical_roster cr\n    ON cr.firm_id = '${sequoia.id}'\n   AND cr.name = scr.name\n  WHERE scr.scrape_id = '${scrapeId}'\n  ORDER BY cr.pdf_order NULLS LAST, scr.name;`);

  const duration = Date.now() - startTime;

  console.log(`\n⏱️  Total time: ${(duration / 1000).toFixed(1)} seconds`);
  console.log('\n🎯 RECOMMENDATION:');

  if (results.agreement > 70) {
    console.log('Use any method - they all produce consistent results');
  } else if (results.commonToAll.length > 10) {
    console.log('Focus on the names agreed upon by all three methods for highest confidence');
  } else if (webNames.length > 0) {
    console.log('Web scraping appears most reliable - use as primary method');
  } else {
    console.log('Methods show significant disagreement - manual verification needed');
  }

  console.log('\n📊 Next steps:');
  console.log('  • Run `npm run db:view` to see all stored results');
  console.log('  • Historical data available for trend analysis');
  console.log('  • Each run builds comparison database for insights');

  // Close database connection
  await sql.end();
}

runComprehensiveTestWithStorage().catch(console.error);