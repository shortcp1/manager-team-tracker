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
  bio?: string;
  focusAreas?: string[];
  imageUrl?: string;
  profileUrl?: string;
  // Enrichment fields
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  location?: string;
  officeCountry?: string;
  department?: string;
  seniorityLevel?: string;
  normalizedTitle?: string;
  normalizedName?: string;
  entityKey?: string;
  twitterUrl?: string;
  githubUrl?: string;
  personalWebsite?: string;
  orderIndex?: number;
  category?: string;
  profilePhotoHash?: string;
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
      '[role="tab"]',
      '.tabs button, .tabs [role="tab"]',
      'button[aria-controls]',
      '.tab, .tabs .tab',
    ];

    for (const sel of tabSelectors) {
      const tabs = await page.locator(sel).all();
      if (tabs.length > 0) {
        for (let i = 0; i < Math.min(tabs.length, 12); i++) {
          try {
            await tabs[i].click();
            await page.waitForLoadState('networkidle', { timeout: 5000 });
            await this.delay(200);
          } catch {}
        }
        break;
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

  private async detectAndHandlePagination(page: Page): Promise<ScrapedMember[]> {
    const allMembers: ScrapedMember[] = [];
    let pageNumber = 1;
    const maxPages = 10; // Safety limit

    do {
      console.log(`Scraping page ${pageNumber}...`);
      
      // Parse current page
      const html = await page.content();
      const currentPageMembers = await this.parseTeamPage(html, page.url());
      allMembers.push(...currentPageMembers);

      // Look for pagination - try multiple common patterns
      const nextButton = await this.findNextButton(page);
      if (!nextButton) break;

      console.log(`Found next button, navigating to page ${pageNumber + 1}...`);
      await nextButton.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      pageNumber++;

    } while (pageNumber <= maxPages);

    return this.deduplicateMembers(allMembers);
  }

  private async findNextButton(page: Page) {
    // Common pagination selectors in order of preference
    const nextSelectors = [
      // Text-based (most reliable)
      'button:has-text("Next")',
      'a:has-text("Next")',
      'button:has-text("Load More")',
      'a:has-text("Load More")',
      'button:has-text("Show More")',
      'a:has-text("Show More")',
      
      // Class/attribute-based
      '.pagination .next:not(.disabled)',
      '.pagination-next:not(.disabled)',
      'button[aria-label*="next"]:not([disabled])',
      'a[aria-label*="next"]',
      
      // Icon-based (arrows, etc)
      'button:has(.icon-arrow-right):not([disabled])',
      'a:has(.icon-arrow-right)',
      'button:has([data-icon="arrow-right"]):not([disabled])',
      
      // Generic patterns
      '.page-numbers .next',
      '.pager .next:not(.disabled)',
    ];

    for (const selector of nextSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          return element;
        }
      } catch {
        // Continue to next selector
      }
    }

    return null;
  }

  private async detectAndHandleStageFilters(page: Page): Promise<ScrapedMember[]> {
    const allMembers: ScrapedMember[] = [];
    
    // Detect stage/role filters
    const stageFilters = await this.detectStageFilters(page);
    
    if (stageFilters.length === 0) {
      // No filters detected, scrape normally
      return this.detectAndHandlePagination(page);
    }

    console.log(`Detected ${stageFilters.length} stage filters:`, stageFilters.map(f => f.name));

    // Scrape each stage
    for (const filter of stageFilters) {
      try {
        console.log(`Scraping stage: ${filter.name}...`);
        
        await filter.element.click();
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        
        // Handle pagination within this stage
        const stageMembers = await this.detectAndHandlePagination(page);
        
        // Tag members with their stage
        stageMembers.forEach(member => {
          member.category = filter.name;
        });
        
        allMembers.push(...stageMembers);
        
      } catch (error) {
        console.warn(`Error scraping stage ${filter.name}:`, error);
      }
    }

    return this.deduplicateMembers(allMembers);
  }

  private async detectStageFilters(page: Page): Promise<{name: string, element: any}[]> {
    const filters: {name: string, element: any}[] = [];
    
    // Common filter patterns
    const filterPatterns = [
      // FacetWP (like Sequoia)
      '.facetwp-radio:not(.checked)',
      
      // Tab-based filters
      '[role="tab"]:has-text(i)',
      'button[data-filter]',
      'a[data-filter]',
      
      // Dropdown filters
      'select[name*="stage"] option',
      'select[name*="role"] option',
      'select[name*="category"] option',
      
      // Button-based filters
      'button:has-text("Growth")',
      'button:has-text("Seed")',
      'button:has-text("Early")',
      'button:has-text("Partner")',
      'button:has-text("Principal")',
      'button:has-text("Associate")',
    ];

    for (const pattern of filterPatterns) {
      try {
        const elements = await page.locator(pattern).all();
        
        for (const element of elements) {
          try {
            const text = await element.textContent();
            if (text && text.trim().length > 0) {
              // Filter out generic words
              const normalizedText = text.trim().toLowerCase();
              if (this.isRelevantStageFilter(normalizedText)) {
                filters.push({
                  name: text.trim(),
                  element: element
                });
              }
            }
          } catch {
            // Skip elements that can't be read
          }
        }
        
        // If we found filters with this pattern, use them
        if (filters.length > 0) break;
        
      } catch {
        // Continue to next pattern
      }
    }

    return filters;
  }

  private isRelevantStageFilter(text: string): boolean {
    const relevantTerms = [
      'seed', 'early', 'growth', 'late', 'venture',
      'partner', 'principal', 'associate', 'analyst', 'director',
      'investment', 'operating', 'operator', 'advisory',
      'series a', 'series b', 'series c'
    ];
    
    return relevantTerms.some(term => text.includes(term)) && 
           !['all', 'any', 'filter', 'select', 'choose'].includes(text);
  }

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

        // Try DOM-anchored waits and old tab/load more logic first
        await this.delay(500);
        await this.clickAllTabs(page);
        await this.clickLoadMore(page);
        await this.infiniteScroll(page);

        // Now try new intelligent stage/pagination detection
        const members = await this.detectAndHandleStageFilters(page);
        
        const html = await page.content();
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

  private extractMemberInfo($: cheerio.CheerioAPI, element: any, baseUrl: string, orderIndex?: number): ScrapedMember | null {
    try {
      // Try to extract name
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

      // Extract title
      const titleSelectors = ['.title', '.position', '.role', '[class*="title"]', '[class*="position"]'];
      let title = '';
      
      for (const titleSelector of titleSelectors) {
        const titleEl = element.find(titleSelector).first();
        if (titleEl.length && titleEl.text().trim()) {
          title = titleEl.text().trim();
          break;
        }
      }

      // Extract bio
      const bioSelectors = ['.bio', '.description', 'p', '[class*="bio"]', '[class*="description"]'];
      let bio = '';
      
      for (const bioSelector of bioSelectors) {
        const bioEl = element.find(bioSelector).first();
        if (bioEl.length && bioEl.text().trim() && bioEl.text().trim() !== name && bioEl.text().trim() !== title) {
          bio = bioEl.text().trim();
          break;
        }
      }

      // Extract image URL
      const imgEl = element.find('img').first();
      let imageUrl = '';
      if (imgEl.length) {
        const src = imgEl.attr('src');
        if (src) {
          imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        }
      }

      // Extract primary link
      const linkEl = element.find('a').first();
      let profileUrl = '';
      if (linkEl.length) {
        const href = linkEl.attr('href');
        if (href) {
          profileUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        }
      }

      // Social links + email + other URLs within the element
      let linkedinUrl: string | undefined;
      let twitterUrl: string | undefined;
      let githubUrl: string | undefined;
      let personalWebsite: string | undefined;
      let email: string | undefined;

      element.find('a').each((_: number, aEl: any) => {
        const href = $(aEl).attr('href');
        if (!href) return;
        const abs = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        if (abs.includes('linkedin.com')) linkedinUrl = abs;
        else if (abs.includes('twitter.com') || abs.includes('x.com')) twitterUrl = abs;
        else if (abs.includes('github.com')) githubUrl = abs;
        else if (href.startsWith('mailto:')) email = href.replace('mailto:', '').trim();
        else if (!personalWebsite && /^https?:\/\//.test(abs)) personalWebsite = abs;
      });

      // Location / department heuristics
      let location = '';
      const locEl = element.find('.location, .office, [data-field="location"]').first();
      if (locEl.length) location = locEl.text().trim();

      // Derive seniority level from title
      const seniorityLevel = this.deriveSeniority(title);

      const normalizedName = this.normalizeName(name);
      const normalizedTitle = title ? this.normalizeTitle(title) : undefined;
      const entityKey = this.computeEntityKey({ name, linkedinUrl, email });

      return {
        name,
        title: title || undefined,
        bio: bio || undefined,
        imageUrl: imageUrl || undefined,
        profileUrl: profileUrl || undefined,
        linkedinUrl,
        twitterUrl,
        githubUrl,
        personalWebsite,
        email,
        location: location || undefined,
        seniorityLevel,
        normalizedName,
        normalizedTitle,
        entityKey,
        orderIndex,
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
      const key = (member.entityKey || member.normalizedName || member.name.toLowerCase().replace(/\s+/g, ' '));
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private normalizeName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,]/g, '')
      .toLowerCase();
  }

  private normalizeTitle(title: string): string {
    return title.trim().replace(/\s+/g, ' ');
  }

  private computeEntityKey({ name, linkedinUrl, email }: { name: string; linkedinUrl?: string; email?: string; }): string {
    const normalizedName = this.normalizeName(name);
    if (linkedinUrl) return `li:${linkedinUrl}`;
    if (email) return `em:${email.toLowerCase()}`;
    return `nm:${normalizedName}`;
  }

  private deriveSeniority(title?: string): string | undefined {
    if (!title) return undefined;
    const t = title.toLowerCase();
    if (/(managing|general) partner|gp/.test(t)) return 'partner';
    if (/partner/.test(t)) return 'partner';
    if (/(managing director|md)/.test(t)) return 'managing_director';
    if (/(principal)/.test(t)) return 'principal';
    if (/(vice president|vp)/.test(t)) return 'vice_president';
    if (/(associate)/.test(t)) return 'associate';
    if (/(analyst)/.test(t)) return 'analyst';
    return undefined;
  }

  async detectChanges(firmId: string, scrapedMembers: ScrapedMember[]): Promise<number> {
    const currentMembers = await storage.getActiveTeamMembersByFirm(firmId);
    const currentMemberMap = new Map(
      currentMembers.map(m => [ (m.entityKey || m.name.toLowerCase()), m ])
    );
    const scrapedMemberMap = new Map(
      scrapedMembers.map(m => [ (m.entityKey || (m.normalizedName || m.name.toLowerCase())), m ])
    );
    
    let changesDetected = 0;

    // Detect removed members
    for (const currentMember of currentMembers) {
      const key = currentMember.entityKey || currentMember.name.toLowerCase();
      if (!scrapedMemberMap.has(key)) {
        await storage.deactivateTeamMember(currentMember.id);
        await storage.createChangeHistory({
          firmId,
          memberId: currentMember.id,
          changeType: 'removed',
          memberName: currentMember.name,
          memberTitle: currentMember.title,
          previousData: {
            name: currentMember.name,
            title: currentMember.title,
            bio: currentMember.bio,
            location: (currentMember as any).location,
          },
          newData: null,
        });
        changesDetected++;
      }
    }

    // Detect added or updated members
    for (const scrapedMember of scrapedMembers) {
      const key = scrapedMember.entityKey || (scrapedMember.normalizedName || scrapedMember.name.toLowerCase());
      const existingMember = currentMemberMap.get(key);
      
      if (!existingMember) {
        // New member
        const newMember: InsertTeamMember = {
          firmId,
          name: scrapedMember.name,
          title: scrapedMember.title,
          bio: scrapedMember.bio,
          focusAreas: scrapedMember.focusAreas,
          imageUrl: scrapedMember.imageUrl,
          profileUrl: scrapedMember.profileUrl,
          isActive: true,
          // enrichment
          linkedinUrl: scrapedMember.linkedinUrl,
          email: scrapedMember.email,
          phone: scrapedMember.phone,
          location: scrapedMember.location,
          officeCountry: scrapedMember.officeCountry,
          department: scrapedMember.department,
          seniorityLevel: scrapedMember.seniorityLevel,
          normalizedTitle: scrapedMember.normalizedTitle,
          normalizedName: scrapedMember.normalizedName,
          entityKey: key,
          twitterUrl: scrapedMember.twitterUrl,
          githubUrl: scrapedMember.githubUrl,
          personalWebsite: scrapedMember.personalWebsite,
          orderIndex: scrapedMember.orderIndex,
          category: scrapedMember.category,
          profilePhotoHash: scrapedMember.profilePhotoHash,
        } as InsertTeamMember;
        
        const createdMember = await storage.createTeamMember(newMember);
        await storage.createChangeHistory({
          firmId,
          memberId: createdMember.id,
          changeType: 'added',
          memberName: scrapedMember.name,
          memberTitle: scrapedMember.title,
          previousData: null,
          newData: {
            name: scrapedMember.name,
            title: scrapedMember.title,
            bio: scrapedMember.bio,
            location: scrapedMember.location,
          },
        });
        changesDetected++;
      } else {
        // Check for updates
        const hasChanges = 
          (existingMember.title !== scrapedMember.title) ||
          (existingMember.bio !== scrapedMember.bio) ||
          (existingMember.imageUrl !== scrapedMember.imageUrl) ||
          ((existingMember as any).location !== scrapedMember.location) ||
          ((existingMember as any).seniorityLevel !== scrapedMember.seniorityLevel);
        
        if (hasChanges) {
          const previousData = {
            name: existingMember.name,
            title: existingMember.title,
            bio: existingMember.bio,
            location: (existingMember as any).location,
          };
          
          await storage.updateTeamMember(existingMember.id, {
            title: scrapedMember.title,
            bio: scrapedMember.bio,
            focusAreas: scrapedMember.focusAreas,
            imageUrl: scrapedMember.imageUrl,
            profileUrl: scrapedMember.profileUrl,
            location: scrapedMember.location,
            seniorityLevel: scrapedMember.seniorityLevel,
            normalizedTitle: scrapedMember.normalizedTitle,
            normalizedName: scrapedMember.normalizedName,
            entityKey: scrapedMember.entityKey || existingMember.entityKey,
          } as Partial<TeamMember>);

          await storage.createChangeHistory({
            firmId,
            memberId: existingMember.id,
            changeType: 'updated',
            memberName: existingMember.name,
            memberTitle: scrapedMember.title || existingMember.title,
            previousData,
            newData: {
              name: existingMember.name,
              title: scrapedMember.title,
              bio: scrapedMember.bio,
              location: scrapedMember.location,
            },
          });
          changesDetected++;
        }
      }
    }

    return changesDetected;
  }
}

export const webScraper = new WebScraper();
