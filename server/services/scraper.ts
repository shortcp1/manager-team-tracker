import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { storage } from '../storage';
import { type Firm, type TeamMember, type InsertTeamMember } from '@shared/schema';

export interface ScrapedMember {
  name: string;
  title?: string;
  bio?: string;
  focusAreas?: string[];
  imageUrl?: string;
  profileUrl?: string;
}

export class WebScraper {
  private browser: puppeteer.Browser | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrapeFirm(firm: Firm): Promise<{
    members: ScrapedMember[];
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      const page = await this.browser!.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      console.log(`Scraping ${firm.name} at ${firm.teamPageUrl}`);
      
      await page.goto(firm.teamPageUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for dynamic content to load
      await page.waitForTimeout(2000);

      const html = await page.content();
      const members = await this.parseTeamPage(html, firm.url);

      await page.close();

      // Record scrape history
      await storage.createScrapeHistory({
        firmId: firm.id,
        status: 'success',
        membersFound: members.length,
        changesDetected: 0, // Will be updated after change detection
        duration: Date.now() - startTime,
      });

      // Update firm's last scraped timestamp
      await storage.updateFirm(firm.id, { lastScraped: new Date() });

      return { members };
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

  private async parseTeamPage(html: string, baseUrl: string): Promise<ScrapedMember[]> {
    const $ = cheerio.load(html);
    const members: ScrapedMember[] = [];

    // Common selectors for team member sections
    const selectors = [
      '.team-member',
      '.person',
      '.profile',
      '.bio',
      '.member',
      '[class*="team"]',
      '[class*="person"]',
      '[class*="profile"]',
    ];

    for (const selector of selectors) {
      const elements = $(selector);
      
      if (elements.length > 0) {
        elements.each((_, element) => {
          const member = this.extractMemberInfo($, $(element), baseUrl);
          if (member && member.name) {
            members.push(member);
          }
        });
        
        if (members.length > 0) {
          break; // Found members with this selector, no need to try others
        }
      }
    }

    // Fallback: look for common patterns in the HTML
    if (members.length === 0) {
      members.push(...this.extractMembersFallback($, baseUrl));
    }

    return this.deduplicateMembers(members);
  }

  private extractMemberInfo($: cheerio.CheerioAPI, element: cheerio.Cheerio, baseUrl: string): ScrapedMember | null {
    try {
      // Try to extract name
      const nameSelectors = ['h1', 'h2', 'h3', 'h4', '.name', '[class*="name"]', 'strong', 'b'];
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

      // Extract profile URL
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
        bio: bio || undefined,
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
    $('*').each((_, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 5 && text.length < 200) {
        const patterns = [
          /^([A-Z][a-z]+\s+[A-Z][a-z]+),\s*(.+)$/, // "John Doe, Managing Director"
          /^([A-Z][a-z]+\s+[A-Z][a-z]+)\s*-\s*(.+)$/, // "John Doe - Managing Director"
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            members.push({
              name: match[1].trim(),
              title: match[2].trim(),
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

  async detectChanges(firmId: string, scrapedMembers: ScrapedMember[]): Promise<number> {
    const currentMembers = await storage.getActiveTeamMembersByFirm(firmId);
    const currentMemberMap = new Map(currentMembers.map(m => [m.name.toLowerCase(), m]));
    const scrapedMemberMap = new Map(scrapedMembers.map(m => [m.name.toLowerCase(), m]));
    
    let changesDetected = 0;

    // Detect removed members
    for (const currentMember of currentMembers) {
      if (!scrapedMemberMap.has(currentMember.name.toLowerCase())) {
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
          },
          newData: null,
        });
        changesDetected++;
      }
    }

    // Detect added or updated members
    for (const scrapedMember of scrapedMembers) {
      const existingMember = currentMemberMap.get(scrapedMember.name.toLowerCase());
      
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
        };
        
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
          },
        });
        changesDetected++;
      } else {
        // Check for updates
        const hasChanges = 
          existingMember.title !== scrapedMember.title ||
          existingMember.bio !== scrapedMember.bio ||
          existingMember.imageUrl !== scrapedMember.imageUrl;
        
        if (hasChanges) {
          const previousData = {
            name: existingMember.name,
            title: existingMember.title,
            bio: existingMember.bio,
          };
          
          await storage.updateTeamMember(existingMember.id, {
            title: scrapedMember.title,
            bio: scrapedMember.bio,
            focusAreas: scrapedMember.focusAreas,
            imageUrl: scrapedMember.imageUrl,
            profileUrl: scrapedMember.profileUrl,
            lastSeen: new Date(),
          });
          
          await storage.createChangeHistory({
            firmId,
            memberId: existingMember.id,
            changeType: 'updated',
            memberName: scrapedMember.name,
            memberTitle: scrapedMember.title,
            previousData,
            newData: {
              name: scrapedMember.name,
              title: scrapedMember.title,
              bio: scrapedMember.bio,
            },
          });
          changesDetected++;
        } else {
          // Update last seen
          await storage.updateTeamMember(existingMember.id, {
            lastSeen: new Date(),
          });
        }
      }
    }

    return changesDetected;
  }
}

export const webScraper = new WebScraper();
