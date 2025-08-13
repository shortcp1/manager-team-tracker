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

console.log('🏆 MULTI-FIRM METHODOLOGY COMPARISON');
console.log('='.repeat(50));
console.log('Fetching firms from database...\n');

// Get all firms from database (any status)
async function getAllFirms() {
  try {
    const allFirms = await db.select().from(firms);
    console.log(`📊 Found ${allFirms.length} firms in database`);
    
    if (allFirms.length === 0) {
      console.log('🔧 Adding test firms to database...');
      // Add some test firms
      await db.insert(firms).values([
        {
          name: 'Sequoia Capital',
          url: 'https://www.sequoiacap.com',
          teamPageUrl: 'https://www.sequoiacap.com/our-team/',
          type: 'Venture Capital',
          status: 'active'
        },
        {
          name: 'Andreessen Horowitz',
          url: 'https://a16z.com',
          teamPageUrl: 'https://a16z.com/team/',
          type: 'Venture Capital',
          status: 'active'
        }
      ]);
      
      const newFirms = await db.select().from(firms);
      console.log(`✅ Added ${newFirms.length} test firms`);
      return newFirms;
    }
    
    return allFirms;
  } catch (error) {
    console.error('❌ Error fetching firms:', error.message);
    return [];
  }
}

// Look for PDF files in common locations
function findPdfForFirm(firmName) {
  // Specific mappings for known firms
  const specificMappings = {
    'Sequoia Capital': '/Users/christianshort/sequoia_team.pdf',
    'Andreessen Horowitz': '/Users/christianshort/a16z_team.pdf'
  };
  
  if (specificMappings[firmName] && fs.existsSync(specificMappings[firmName])) {
    console.log(`📄 Found PDF for ${firmName}: ${specificMappings[firmName]}`);
    return specificMappings[firmName];
  }
  
  // Fallback to common patterns
  const commonPaths = [
    `/Users/christianshort/${firmName.toLowerCase().replace(/\s+/g, '_')}_team.pdf`,
    `/Users/christianshort/${firmName.toLowerCase().replace(/\s+/g, '')}_team.pdf`,
    `/Users/christianshort/${firmName.toLowerCase().replace(/[^a-z0-9]/g, '')}_team.pdf`
  ];
  
  for (const path of commonPaths) {
    if (fs.existsSync(path)) {
      console.log(`📄 Found PDF for ${firmName}: ${path}`);
      return path;
    }
  }
  
  console.log(`⚠️  No PDF found for ${firmName} in common locations`);
  return null;
}

// Method 1: Enhanced Web Scraping (from enhanced script)
async function webScrapingForFirm(firm, scrapeId) {
  console.log(`🌐 Web Scraping: ${firm.name}`);
  console.log(`   URL: ${firm.teamPageUrl}`);
  
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

    // === Enhanced helper functions ===
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

    await page.goto(firm.teamPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await acceptCookies(page);
    
    // Readiness check
    await page.locator('a[href*="/people/"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

    // === Enhanced selectors and logic ===
    // === COMPREHENSIVE SELECTOR LIST (50+ patterns) ===
    const CARD_NAME_SEL = [
      // Schema.org/Microdata Selectors
      '[itemprop="name"]',
      '[itemtype*="Person"] [itemprop="name"]',
      '[itemscope][itemtype*="Person"] h1',
      '[itemscope][itemtype*="Person"] h2',
      '[itemscope][itemtype*="Person"] h3',
      
      // Current Working Selectors (Sequoia & A16Z)
      'h2.ink__title', 'h3.ink__title',  // Sequoia
      '.member .name',  // A16Z
      
      // Generic Semantic Class Names
      '.team-member .name', '.staff-member .name', '.person-name', '.member-name',
      '.employee-name', '.team-name', '.staff-name',
      '.team-member h1', '.team-member h2', '.team-member h3',
      '.staff-member h1', '.staff-member h2', '.staff-member h3',
      
      // Card-Based Patterns (Bootstrap/Modern Frameworks)
      '.card-title',
      '.team-card .card-title', '.member-card .card-title', '.staff-card .card-title',
      '.person-card .card-title', '.profile-card .card-title', '.bio-card .card-title',
      '.employee-card .card-title',
      '.team-card h2', '.team-card h3', '.person-card h2', '.person-card h3',
      
      // Grid/Layout Patterns
      '.team-grid .name', '.staff-grid .name', '.team-list .name', '.staff-list .name',
      '.member-grid .name', '.employee-grid .name',
      
      // Section-Based Selectors
      '#team .name', '#team h2', '#team h3',
      '#staff .name', '#staff h2', '#staff h3',
      '#about .name', '#about h2', '#about h3',
      '.team-section .name', '.staff-section .name', '.about-section .name',
      
      // WordPress-Specific Patterns
      '.wp-team-member .name', '.wp-staff-list .name', '.team-showcase .name',
      '.staff-directory .name', '.meet-the-team .name', '.team-members .name',
      
      // Squarespace-Specific Patterns
      '.sqs-block-team .name', '.team-member-card .name', '.staff-item .name',
      
      // Webflow-Specific Patterns
      '.team-member-card_ .name', '.staff-card_ .name', '.member-item_ .name',
      
      // Legacy/Older Website Patterns
      '.team-member-name', '.staff-member-name', '.biography .name', '.profile .name',
      
      // Navigation/Link-Based Patterns
      'a[href*="/people/"]', 'a[href*="/team/"]', 'a[href*="/staff/"]',
      'a[href*="/about/"]', 'a[href*="/bio/"]', 'a[href*="/profile/"]',
      
      // Industry-Specific Patterns
      '.attorney .name', '.lawyer .name', '.partner .name', '.associate .name',
      '.consultant .name', '.advisor .name', '.principal .name', '.director .name',
      '.managing-director .name', '.investment-team .name',
      '.doctor .name', '.physician .name', '.practitioner .name',
      
      // Additional Generic Patterns
      '.team .name', '.staff .name', '.about .name',
      '.leadership-team .name', '.executive-team .name', '.portfolio-team .name'
    ].join(', ');
    const LOAD_MORE_SEL = '.facetwp-load-more:not(.facetwp-hidden), button:has-text("Load more"), a:has-text("Load more"), button:has-text("Show more"), a:has-text("Show more")';
    const tabsSel = [
      '[role="tablist"] [role="tab"]',
      '[role="tab"]',
      '.tabs [role="tab"]',
      '.ink-tabs [role="tab"]',
      '.ink-chips button', '.ink-chips a',
      '.segmented-control button', '.segmented-control a',
      '.facetwp-facet button', '.facetwp-facet a[role="button"]',
      '.facetwp-facet .facetwp-radio', '.facetwp-facet .facetwp-checkbox'
    ].join(',');

    async function collectVisibleNames(scope = page) {
      const base = (typeof scope.locator === 'function') ? scope.locator(CARD_NAME_SEL) : page.locator(CARD_NAME_SEL);
      
      const matchingElements = await base.count();
      
      if (matchingElements === 0) {
        const title = await page.title();
        console.log(`   ⚠️ No matching elements found on page: ${title}`);
      }
      
      const texts = await base.evaluateAll(els => {
        const out = [];
        const nameAtStart = /^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z'.-]+)+/;
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
            const lines = c.split('\n');
            const firstLine = lines[0].trim();
            const m = firstLine.match(nameAtStart);
            if (m && m[0]) { out.push(m[0]); break; }
          }
        }
        
        return Array.from(new Set(out));
      });
      
      // Convert to proper case and filter
      const properCaseNames = texts.map(name => {
        if (name === name.toUpperCase()) {
          return name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        }
        return name;
      });
      
      // Filter out false positives
      const falsePositives = [
        'Our Team', 'Load More', 'Toggle Categories', 'View Profile', 
        'Get In Touch', 'General Counsel', 'Senior Director', 'VP of Talent',
        'Deputy CCO', 'Principal Designer', 'Seed Early', 'Growth Operator',
        'What Does Sequoia Look', 'The Future', 'If You Are Heads Down',
        'The Future of Observability'
      ];
      const cleanedNames = properCaseNames.filter(name => 
        !falsePositives.some(fp => name.toLowerCase().includes(fp.toLowerCase())) &&
        name.split(' ').length <= 4
      );
      
      return cleanedNames;
    }

    async function expandWithinState(scope = page, deadlineTs = Date.now() + 60000) {
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
      await page.evaluate(el => el && el.scrollIntoView({ block: 'center' }), await tab.elementHandle().catch(() => null)).catch(() => {});
      await tab.click({ timeout: 1000, force: true }).catch(() => {});
      await page.waitForTimeout(600);
      await expandWithinState(page);
      const names = await collectVisibleNames(page).catch(() => []);
      return names;
    }

    // === Intelligence gathering and harvesting ===
    const intelligence = {
      discoveredSections: [],
      urlPatterns: [],
      siteStructure: "tab-based filtering",
      baseUrl: firm.teamPageUrl,
      defaultViewNames: 0,
      sitemapUrls: []
    };

    const collected = new Set();
    
    // Default state first
    await expandWithinState(page);
    const defaultNames = await collectVisibleNames(page);
    defaultNames.forEach(n => collected.add(n));
    intelligence.defaultViewNames = defaultNames.length;

    // Try to discover sitemap URLs
    try {
      await page.goto(`${new URL(firm.teamPageUrl).origin}/sitemap.xml`, { timeout: 5000 });
      const sitemapContent = await page.textContent('body').catch(() => '');
      const teamUrls = sitemapContent.match(/https?:\/\/[^<]+(?:team|people)[^<]*/gi) || [];
      intelligence.sitemapUrls = [...new Set(teamUrls)].slice(0, 10);
      
      await page.goto(firm.teamPageUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log(`   ℹ️ Could not access sitemap: ${e.message}`);
    }

    // Find and click tabs
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
        fullUrl: urlPattern ? `${firm.teamPageUrl}${urlPattern}` : null
      });
      
      if (newNamesCount === 0) {
        console.log(`   ⚠︎ No new names detected after clicking "${label}"`);
      }
      console.log(`   ↪︎ state "${label}" ⇒ total so far: ${collected.size}`);
    }

    // Store intelligence for Perplexity
    global.playwrightIntelligence = intelligence;
    console.log(`   🧠 Intelligence: ${intelligence.discoveredSections.length} sections, ${intelligence.urlPatterns.length} URL patterns`);

    names = Array.from(collected).sort();
    console.log(`   ✅ Found ${names.length} names`);
    
  } catch (err) {
    error = err.message;
    console.log(`   ❌ Error: ${error}`);
  }
  
  // Save to database for dashboard compatibility
  try {
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
    
    const namesJson = JSON.stringify(names);
    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${firm.id}::uuid, 'web', ${namesJson}::jsonb, ${error ? 'error' : 'success'}, ${error ?? null})
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
  } catch (e) {
    console.log(`   ⚠️ Database save failed: ${e.message}`);
  }
  
  try { if (context) await context.close(); } catch (_) {}
  try { if (browser) await browser.close(); } catch (_) {}
  
  return { names, error };
}

// Method 2: Enhanced Perplexity API (with intelligence from Playwright)
async function perplexityForFirm(firm, scrapeId) {
  console.log(`🤖 Perplexity API: ${firm.name}`);
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log('   ❌ API key not found');
    return { names: [], error: 'API key not found' };
  }
  
  let names = [];
  let error = null;
  
  // Get intelligence from Playwright if available
  const intelligence = global.playwrightIntelligence;
  let enhancedPrompt = `Visit ${firm.teamPageUrl} and collect ALL unique person names from the team roster.`;
  
  if (intelligence) {
    console.log(`   🧠 Using Playwright intelligence to enhance search...`);
    
    const sectionInfo = intelligence.discoveredSections
      .map(s => `- ${s.name}: ${s.memberCount} members${s.fullUrl ? ` at ${s.fullUrl}` : ''}`)
      .join('\n');
    
    const urlInfo = intelligence.urlPatterns.length > 0 
      ? `\nURL patterns discovered: ${intelligence.urlPatterns.join(', ')}`
      : '';
    
    const sitemapInfo = intelligence.sitemapUrls.length > 0
      ? `\nAdditional URLs from sitemap: ${intelligence.sitemapUrls.slice(0, 3).join(', ')}`
      : '';
    
    enhancedPrompt = `Based on initial reconnaissance of ${firm.teamPageUrl}, the following team sections have been discovered:

${sectionInfo}

The site structure: ${intelligence.siteStructure}
Default view contains: ${intelligence.defaultViewNames} names${urlInfo}${sitemapInfo}

Please systematically visit the team page and ALL discovered sections/URLs to collect every unique person name. Be thorough:
- Visit the main team page: ${firm.teamPageUrl}
- Click every tab/filter to switch between sections
- If URL patterns exist, try direct navigation to role-specific URLs
- Look for any additional team sections or individual profile pages
- Cross-check your results against the patterns discovered above
- Output ONLY the names, one per line (no roles, punctuation, or duplicates).`;
  } else {
    enhancedPrompt += ` Look for:
- Team members in all sections/tabs
- Partners, principals, associates, advisors
- Operations staff, platform team members
- Any filtering options or role-based views
Output ONLY the names, one per line (no titles, roles, or other text).`;
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
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    names = content.split(/\n|,|;/).map(n => n.trim()).filter(n => 
      n && /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(n)
    );
    
    names = [...new Set(names)].sort();
    console.log(`   ✅ Found ${names.length} names`);
    
  } catch (err) {
    error = err.message;
    console.log(`   ❌ Error: ${error}`);
  }
  
  // Save to database for dashboard compatibility
  try {
    const namesJson = JSON.stringify(names);
    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${firm.id}::uuid, 'perplexity', ${namesJson}::jsonb, ${error ? 'error' : 'success'}, ${error ?? null})
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
  } catch (e) {
    console.log(`   ⚠️ Database save failed: ${e.message}`);
  }
  
  return { names, error };
}

// Method 3: PDF Parsing
async function pdfParsingForFirm(firm, pdfPath, scrapeId) {
  console.log(`📄 PDF Parsing: ${firm.name}`);
  
  if (!pdfPath) {
    console.log('   ⚠️  No PDF available');
    return { names: [], error: 'No PDF file found' };
  }
  
  let names = [];
  let error = null;
  
  try {
    const buffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(buffer);
    const text = data.text || '';
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    
    names = lines.filter(line => /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(line));
    
    const falsePositives = [
      'Our Team', 'Load More', 'Toggle Categories', 'View Profile', 
      'Get In Touch', 'General Counsel', 'Senior Director', 'VP of Talent',
      'Deputy CCO', 'Principal Designer', 'Seed Early', 'Growth Operator'
    ];
    
    names = names.filter(name => !falsePositives.some(fp => name.toLowerCase().includes(fp.toLowerCase())));
    names = [...new Set(names)].sort();
    
    console.log(`   ✅ Found ${names.length} names`);
    
  } catch (err) {
    error = err.message;
    console.log(`   ❌ Error: ${error}`);
  }
  
  // Save to database for dashboard compatibility
  try {
    const namesJson = JSON.stringify(names);
    await sql`INSERT INTO scrape_results (scrape_id, firm_id, method, names, status, error_message)
              VALUES (${scrapeId}, ${firm.id}::uuid, 'pdf', ${namesJson}::jsonb, ${error ? 'error' : 'success'}, ${error ?? null})
              ON CONFLICT (scrape_id, method) DO UPDATE
              SET names = EXCLUDED.names, status = EXCLUDED.status, error_message = EXCLUDED.error_message`;
  } catch (e) {
    console.log(`   ⚠️ Database save failed: ${e.message}`);
  }
  
  return { names, error };
}

// Analyze results for a single firm
function analyzeFirmResults(firm, webNames, perplexityNames, pdfNames) {
  const webSet = new Set(webNames.map(n => n.toLowerCase()));
  const perplexitySet = new Set(perplexityNames.map(n => n.toLowerCase()));
  const pdfSet = new Set(pdfNames.map(n => n.toLowerCase()));
  
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
  
  const baselineSize = Math.max(webNames.length, perplexityNames.length, pdfNames.length);
  const agreement = baselineSize > 0 ? (allThree.length / baselineSize) * 100 : 0;
  
  return {
    firm: firm.name,
    webCount: webNames.length,
    perplexityCount: perplexityNames.length,
    pdfCount: pdfNames.length,
    totalUnique: allNames.size,
    webPerplexityOverlap: webPerplexity.length,
    webPdfOverlap: webPdf.length,
    perplexityPdfOverlap: perplexityPdf.length,
    allThreeOverlap: allThree.length,
    agreement: Math.round(agreement * 10) / 10,
    status: agreement > 70 ? '🟢 High' : agreement > 40 ? '🟡 Medium' : '🔴 Low'
  };
}

// Print summary table
function printSummaryTable(results) {
  console.log('\n📊 SUMMARY TABLE');
  console.log('='.repeat(120));
  
  console.table(results.map(r => ({
    Firm: r.firm,
    Web: r.webCount,
    Perplexity: r.perplexityCount,
    PDF: r.pdfCount,
    'Total Unique': r.totalUnique,
    'All 3 Overlap': r.allThreeOverlap,
    'Agreement %': r.agreement,
    'Confidence': r.status
  })));
}

// Main execution
async function runMultiFirmComparison() {
  const startTime = Date.now();
  
  const allFirms = await getAllFirms();
  if (allFirms.length === 0) {
    console.log('❌ No firms found in database');
    await sql.end();
    return;
  }
  
  const results = [];
  
  for (let i = 0; i < allFirms.length; i++) {
    const firm = allFirms[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏢 ${firm.name} (${i + 1}/${allFirms.length})`);
    console.log(`${'='.repeat(60)}`);
    
    const scrapeId = randomUUID();
    const pdfPath = findPdfForFirm(firm.name);
    
    // Create scrape session for dashboard compatibility
    try {
      await sql`CREATE TABLE IF NOT EXISTS scrape_sessions (
        id uuid PRIMARY KEY,
        firm_id uuid NOT NULL,
        started_at timestamptz DEFAULT now()
      )`;
      await sql`INSERT INTO scrape_sessions (id, firm_id) VALUES (${scrapeId}, ${firm.id}::uuid)`;
      console.log(`   🆔 Scrape session: ${scrapeId}`);
    } catch (e) {
      console.log(`   ⚠️ Session tracking error: ${e.message}`);
    }
    
    // Run methods sequentially for intelligence sharing (Playwright → Perplexity → PDF)
    console.log('   🔄 Running methods sequentially for intelligence sharing...');
    const webResult = await webScrapingForFirm(firm, scrapeId);
    const perplexityResult = await perplexityForFirm(firm, scrapeId);
    const pdfResult = await pdfParsingForFirm(firm, pdfPath, scrapeId);
    
    const analysis = analyzeFirmResults(
      firm, 
      webResult.names, 
      perplexityResult.names, 
      pdfResult.names
    );
    
    results.push(analysis);
    
    console.log(`\n📈 ${firm.name} Results:`);
    console.log(`   Web: ${analysis.webCount} names`);
    console.log(`   Perplexity: ${analysis.perplexityCount} names`);
    console.log(`   PDF: ${analysis.pdfCount} names`);
    console.log(`   Agreement: ${analysis.agreement}% ${analysis.status}`);
  }
  
  printSummaryTable(results);
  
  const duration = Date.now() - startTime;
  console.log(`\n⏱️  Total time: ${(duration / 1000).toFixed(1)} seconds`);
  console.log(`\n🎯 Best performing firms (>70% agreement):`);
  
  const bestFirms = results.filter(r => r.agreement > 70);
  if (bestFirms.length > 0) {
    bestFirms.forEach(firm => {
      console.log(`   • ${firm.firm}: ${firm.agreement}% agreement`);
    });
  } else {
    console.log('   None found - all firms need investigation');
  }
  
  await sql.end();
}

runMultiFirmComparison().catch(console.error);