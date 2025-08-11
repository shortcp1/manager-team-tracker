import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../storage';
import { type Firm, type TeamMember, type InsertTeamMember } from '@shared/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Playwright has built-in stealth capabilities

export interface ScrapedMember {
  name: string;
  title?: string;
  imageUrl?: string;
  profileUrl?: string;
}

export class WebScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    }
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async preparePage(page: Page) {
    // Playwright handles user agent and viewport in context creation
    // Add any additional page-specific setup here if needed
  }

  private async delay(ms: number) {
    await new Promise((res) => setTimeout(res, ms));
  }

  private async clickAllTabs(page: Page) {
    const tabSelectors = [
      // Standard tab patterns
      '[role="tab"]',
      '.tabs button, .tabs [role="tab"]',
      'button[aria-controls]',
      '.tab, .tabs .tab',
      // Filter-based navigation (like FacetwP, Isotope, etc.)
      '.facetwp-radio',
      '.filter-button',
      '.filter-tab',
      '[data-filter]',
      '.category-filter',
      '.portfolio-filter',
      // Common filter patterns on investment firm sites
      '.stage-filter',
      '.investment-type-filter',
      'input[type="radio"][name*="filter"]',
      'button[data-category]',
      'button[data-stage]',
    ];

    let totalClicked = 0;
    for (const sel of tabSelectors) {
      const tabs = await page.locator(sel).all();
      if (tabs.length > 0) {
        console.log(`Found ${tabs.length} elements for selector: ${sel}`);
        for (let i = 0; i < Math.min(tabs.length, 12); i++) {
          try {
            // Check if element is visible and clickable
            const isVisible = await tabs[i].isVisible();
            const isEnabled = await tabs[i].isEnabled();
            
            if (isVisible && isEnabled) {
              await tabs[i].click();
              totalClicked++;
              await page.waitForLoadState('networkidle', { timeout: 3000 });
              await this.delay(300);
              console.log(`Clicked tab ${i + 1}/${tabs.length} for selector: ${sel}`);
            }
          } catch (error) {
            console.log(`Failed to click tab ${i + 1} for selector ${sel}:`, error);
          }
        }
        // Don't break - try multiple selector types to catch all variations
        if (totalClicked > 0) {
          console.log(`Successfully clicked ${totalClicked} tabs/filters`);
        }
      }
    }
  }

  private async clickLoadMore(page: Page) {
    for (let iter = 0; iter < 5; iter++) {
      const clicked = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const target = nodes.find((el) => /\b(load more|show more|more)\b/i.test(el.textContent || ''));
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      if (!clicked) break;
      await page.waitForLoadState('networkidle', { timeout: 5000 });
      await this.delay(250);
    }
  }

  private async infiniteScroll(page: Page) {
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    let stableCount = 0;
    for (let i = 0; i < 10; i++) {
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await this.delay(500);
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === lastHeight) {
        stableCount++;
        if (stableCount >= 2) break;
      } else {
        stableCount = 0;
        lastHeight = newHeight;
      }
    }
  }

  private async handleDynamicFilters(page: Page) {
    // Handle JavaScript-based filters (like FacetwP, Isotope, etc.)
    const filterPatterns = [
      // FacetwP pattern (Sequoia uses this)
      {
        selector: '.facetwp-radio',
        trigger: async (element: any) => {
          await element.check(); // For radio inputs
        }
      },
      // Generic data-filter pattern
      {
        selector: '[data-filter]:not(.active)',
        trigger: async (element: any) => {
          await element.click();
        }
      },
      // Category/tag filters
      {
        selector: '.category-filter:not(.active), .tag-filter:not(.active)',
        trigger: async (element: any) => {
          await element.click();
        }
      }
    ];

    for (const pattern of filterPatterns) {
      try {
        const elements = await page.locator(pattern.selector).all();
        if (elements.length > 0) {
          console.log(`Found ${elements.length} dynamic filters for pattern: ${pattern.selector}`);
          
          for (let i = 0; i < Math.min(elements.length, 8); i++) {
            try {
              const isVisible = await elements[i].isVisible();
              if (isVisible) {
                await pattern.trigger(elements[i]);
                console.log(`Triggered dynamic filter ${i + 1}/${elements.length}`);
                
                // Wait for AJAX content to load
                await page.waitForFunction(() => {
                  return document.readyState === 'complete';
                }, { timeout: 5000 });
                await this.delay(800); // Extra time for AJAX
              }
            } catch (error) {
              console.log(`Failed to trigger filter ${i + 1}:`, error);
            }
          }
        }
      } catch (error) {
        console.log(`Error handling filter pattern ${pattern.selector}:`, error);
      }
    }
  }

  // Removed complex pagination and stage detection for serverless compatibility

  private buildArtifactPaths(firm: Firm) {
    const ts = new Date();
    const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2,'0')}_${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}`;
    const baseDir = path.resolve(__dirname, '..', 'public', 'artifacts', firm.id, stamp);
    const relBase = `/artifacts/${firm.id}/${stamp}`;
    const htmlPathAbs = path.join(baseDir, 'team.html');
    const screenshotPathAbs = path.join(baseDir, 'team.png');
    const htmlPathRel = `${relBase}/team.html`;
    const screenshotPathRel = `${relBase}/team.png`;
    return { baseDir, htmlPathAbs, screenshotPathAbs, htmlPathRel, screenshotPathRel };
  }

  async scrapeFirmWithFallback(firm: Firm): Promise<{
    members: ScrapedMember[];
    html?: string;
    screenshot?: Buffer;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      console.log(`Scraping ${firm.name} at ${firm.teamPageUrl}`);
      
      // Try with simple HTTP request first (faster and more reliable)
      const response = await fetch(firm.teamPageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const members = await this.parseTeamPage(html, firm.url);
      
      if (members.length >= 5) {
        console.log(`Successfully scraped ${firm.name} via HTTP - found ${members.length} members`);
        return { members, html };
      } else {
        console.log(`HTTP scrape for ${firm.name} returned ${members.length} members; trying Playwright fallback...`);
        throw new Error('HTTP result insufficient');
      }
      
    } catch (httpError) {
      console.log(`HTTP scraping failed for ${firm.name}, trying Playwright...`);
      
      // Fallback to Playwright for JavaScript-heavy sites
      try {
        await this.initialize();
        
        const page = await this.context!.newPage();
        await this.preparePage(page);
        
        await page.goto(firm.teamPageUrl, { 
          waitUntil: 'networkidle',
          timeout: 45000 
        });

        // Enhanced dynamic content loading
        await this.delay(500);
        await this.clickAllTabs(page);
        await this.handleDynamicFilters(page);
        await this.clickLoadMore(page);
        await this.infiniteScroll(page);

        // Simplified scraping - no stage/pagination detection
        const html = await page.content();
        const members = await this.parseTeamPage(html, firm.url);
        const screenshot = await page.screenshot({ fullPage: true }) as Buffer;

        await page.close();
        
        console.log(`Successfully scraped ${firm.name} using Playwright - found ${members.length} members`);
        return { members, html, screenshot };
      } catch (playwrightError) {
        console.error(`Both HTTP and Playwright scraping failed for ${firm.name}:`, playwrightError);
        throw playwrightError;
      }
    }
  }

  async scrapeFirm(firm: Firm): Promise<{
    members: ScrapedMember[];
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const result = await this.scrapeFirmWithFallback(firm);

      // Persist artifacts if available
      let htmlPath: string | undefined;
      let screenshotPath: string | undefined;
      if (result.html) {
        const { baseDir, htmlPathAbs, screenshotPathAbs, htmlPathRel, screenshotPathRel } = this.buildArtifactPaths(firm);
        await fs.promises.mkdir(baseDir, { recursive: true });
        await fs.promises.writeFile(htmlPathAbs, result.html, 'utf-8');
        htmlPath = htmlPathRel;
        if (result.screenshot) {
          await fs.promises.writeFile(screenshotPathAbs, result.screenshot);
          screenshotPath = screenshotPathRel;
        }
      }

      // Record scrape history
      await storage.createScrapeHistory({
        firmId: firm.id,
        status: 'success',
        membersFound: result.members.length,
        changesDetected: 0, // Will be updated after change detection
        duration: Date.now() - startTime,
        htmlPath,
        screenshotPath,
      });

      // Update firm's last scraped timestamp
      await storage.updateFirm(firm.id, { lastScraped: new Date() });

      return { members: result.members };
    } catch (error) {
      console.error(`Error scraping ${firm.name}:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Record failed scrape
      await storage.createScrapeHistory({
        firmId: firm.id,
        status: 'error',
        membersFound: 0,
        changesDetected: 0,
        errorMessage,
        duration: Date.now() - startTime,
      });

      // Update firm status to error
      await storage.updateFirm(firm.id, { status: 'error' });

      return { members: [], error: errorMessage };
    }
  }

  // Made public so scripts/tests can reuse it
  async parseTeamPage(html: string, baseUrl: string): Promise<ScrapedMember[]> {
    const $ = cheerio.load(html);
    const members: ScrapedMember[] = [];

    // JSON-LD Person extraction
    members.push(...this.extractPersonsFromJsonLd($, baseUrl));

    // Common selectors for team member sections
    const selectors = [
      // Sequoia-specific likely containers/cards
      '.team-members__grid .grid__instance',
      '.grid__instance',
      'a.ink',
      '.ink',
      // Generic fallbacks
      '.team-member',
      '.person',
      '.profile',
      '.bio',
      '.member',
      '[class*="team"]',
      '[class*="person"]',
      '[class*="profile"]',
    ];

    let orderIndex = 0;
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length === 0) continue;
      elements.each((_: number, element: any) => {
        const member = this.extractMemberInfo($, $(element), baseUrl, orderIndex++);
        if (member && member.name) {
          members.push(member);
        }
      });
    }

    // Fallback: look for common patterns in the HTML
    if (members.length === 0) {
      members.push(...this.extractMembersFallback($, baseUrl));
    }

    return this.deduplicateMembers(members);
  }

  private extractPersonsFromJsonLd($: cheerio.CheerioAPI, baseUrl: string): ScrapedMember[] {
    const results: ScrapedMember[] = [];
    $('script[type="application/ld+json"]').each((_: number, el: any) => {
      try {
        const raw = $(el).contents().text();
        const json = JSON.parse(raw);
        const arr = Array.isArray(json) ? json : [json];
        for (const node of arr) {
          const graph = node['@graph'] || [node];
          for (const item of graph) {
            if (item['@type'] === 'Person' || (Array.isArray(item['@type']) && item['@type'].includes('Person'))) {
              const name = item.name || '';
              if (!name) continue;
              const profileUrl = item.url ? new URL(item.url, baseUrl).href : undefined;
              const imageUrl = item.image ? new URL(item.image, baseUrl).href : undefined;
              const title = item.jobTitle || undefined;
              const email = item.email || undefined;
              const telephone = item.telephone || undefined;
              const sameAs: string[] = Array.isArray(item.sameAs) ? item.sameAs : [];
              const linkedinUrl = sameAs.find((u) => typeof u === 'string' && u.includes('linkedin.com'));
              const twitterUrl = sameAs.find((u) => typeof u === 'string' && u.includes('twitter.com'));
              const githubUrl = sameAs.find((u) => typeof u === 'string' && u.includes('github.com'));

              const normalizedName = this.normalizeName(name);
              const normalizedTitle = title ? this.normalizeTitle(title) : undefined;
              const entityKey = this.computeEntityKey({ name, linkedinUrl: linkedinUrl, email });

              results.push({
                name,
                title,
                profileUrl,
                imageUrl,
                email,
                phone: telephone,
                linkedinUrl: linkedinUrl || undefined,
                twitterUrl: twitterUrl || undefined,
                githubUrl: githubUrl || undefined,
                normalizedName,
                normalizedTitle,
                entityKey,
              });
            }
          }
        }
      } catch {}
    });
    return results;
  }

  private extractMemberInfo($: cheerio.CheerioAPI, element: any, baseUrl: string): ScrapedMember | null {
    try {
      // Extract name (essential)
      const nameSelectors = ['h1', 'h2', 'h3', 'h4', '.name', '.ink__title', '[class*="name"]', 'strong', 'b'];
      let name = '';
      
      for (const nameSelector of nameSelectors) {
        const nameEl = element.find(nameSelector).first();
        if (nameEl.length && nameEl.text().trim()) {
          name = nameEl.text().trim();
          break;
        }
      }

      if (!name) return null;

      // Extract title (nice to have)
      const titleSelectors = ['.title', '.position', '.role', '[class*="title"]', '[class*="position"]'];
      let title = '';
      
      for (const titleSelector of titleSelectors) {
        const titleEl = element.find(titleSelector).first();
        if (titleEl.length && titleEl.text().trim()) {
          title = titleEl.text().trim();
          break;
        }
      }

      // Extract image URL (nice to have)
      const imgEl = element.find('img').first();
      let imageUrl = '';
      if (imgEl.length) {
        const src = imgEl.attr('src');
        if (src) {
          imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        }
      }

      // Extract primary link (nice to have)
      const linkEl = element.find('a').first();
      let profileUrl = '';
      if (linkEl.length) {
        const href = linkEl.attr('href');
        if (href) {
          profileUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        }
      }

      return {
        name,
        title: title || undefined,
        imageUrl: imageUrl || undefined,
        profileUrl: profileUrl || undefined,
      };
    } catch (error) {
      console.warn('Error extracting member info:', error);
      return null;
    }
  }

  private extractMembersFallback($: cheerio.CheerioAPI, baseUrl: string): ScrapedMember[] {
    const members: ScrapedMember[] = [];
    
    // Look for patterns like "Name, Title" in text content
    $('*').each((_: number, element: any) => {
      const text = $(element).text().trim();
      if (text && text.length > 5 && text.length < 200) {
        const patterns = [
          /^([A-Z][a-z]+\s+[A-Z][a-z]+),\s*(.+)$/,
          /^([A-Z][a-z]+\s+[A-Z][a-z]+)\s*-\s*(.+)$/,
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            const name = match[1].trim();
            const title = match[2].trim();
            members.push({
              name,
              title,
              normalizedName: this.normalizeName(name),
              normalizedTitle: this.normalizeTitle(title),
              entityKey: this.computeEntityKey({ name }),
            });
          }
        }
      }
    });

    return members;
  }

  private deduplicateMembers(members: ScrapedMember[]): ScrapedMember[] {
    const seen = new Set<string>();
    return members.filter(member => {
      const key = member.name.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async saveMembers(firmId: string, scrapedMembers: ScrapedMember[]): Promise<number> {
    // Simplified: just replace all members for this firm
    // Remove complex change tracking for serverless compatibility
    
    // Clear existing members
    await storage.deactivateAllTeamMembers(firmId);
    
    // Add new members
    let savedCount = 0;
    for (const member of scrapedMembers) {
      try {
        await storage.createTeamMember({
          firmId,
          name: member.name,
          title: member.title,
          imageUrl: member.imageUrl,
          profileUrl: member.profileUrl,
          isActive: true,
        } as any);
        savedCount++;
      } catch (error) {
        console.warn(`Failed to save member ${member.name}:`, error);
      }
    }
    
    return savedCount;
  }
}

export const webScraper = new WebScraper();
