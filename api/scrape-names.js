// Enhanced Playwright-only name scraper with pagination and stage detection
import { chromium } from 'playwright';

export default async function handler(req, res) {
  let browser = null;
  
  try {
    const testUrl = req.query.url || 'https://www.sequoiacap.com/our-team/';
    
    console.log(`Enhanced Playwright scraping ${testUrl}`);

    let members = [];
    const method = 'playwright';
    console.log('Starting Playwright enhanced scraping...');
    
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const page = await context.newPage();
    
    // Navigate to page
    await page.goto(testUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 
    });

    // Wait for initial content
    await page.waitForTimeout(1000);

    // Enhanced stage/filter detection and activation
    const stagesActivated = await detectAndActivateStages(page);
    console.log(`Activated ${stagesActivated} stage filters`);

    // Enhanced pagination handling
    const pagesProcessed = await handlePagination(page);
    console.log(`Processed ${pagesProcessed} additional pages`);

    // Extract final HTML after all interactions
    const html = await page.content();
    await page.close();
    await context.close();

    // Parse the enhanced HTML
    members = await parseTeamPage(html, testUrl);
    
    res.status(200).json({
      message: 'Enhanced Playwright name scraping successful',
      method: method,
      url: testUrl,
      stagesActivated: stagesActivated,
      pagesProcessed: pagesProcessed,
      membersFound: members.length,
      members: members,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Enhanced Playwright scraping failed:', error);
    res.status(500).json({
      error: 'Enhanced Playwright scraping failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('Error closing browser:', closeError);
      }
    }
  }
}

async function detectAndActivateStages(page) {
  let activatedCount = 0;
  
  // Common stage/filter selectors for VC firms
  const stageSelectors = [
    // Sequoia-specific
    '[data-filter]',
    '.filter-button',
    '.stage-filter',
    // Generic toggle patterns
    'button[aria-pressed="false"]',
    '[role="tab"]:not([aria-selected="true"])',
    '.tabs button:not(.active)',
    '.toggle:not(.active)',
    // Common text patterns
    'button:has-text("Seed")',
    'button:has-text("Early")', 
    'button:has-text("Growth")',
    'button:has-text("Operator")',
    'button:has-text("All")',
    'a:has-text("View All")',
    'a:has-text("Show All")'
  ];

  for (const selector of stageSelectors) {
    try {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        console.log(`Found ${elements.length} stage elements for selector: ${selector}`);
        
        for (let i = 0; i < Math.min(elements.length, 8); i++) {
          try {
            const element = elements[i];
            const text = await element.textContent();
            
            // Skip if already active or irrelevant
            if (text && (
              text.toLowerCase().includes('active') ||
              text.toLowerCase().includes('selected') ||
              text.length > 50
            )) continue;
            
            console.log(`Clicking stage button: "${text}"`);
            await element.click();
            await page.waitForTimeout(500);
            await page.waitForLoadState('networkidle', { timeout: 5000 });
            activatedCount++;
            
          } catch (clickError) {
            console.log('Click failed on stage element:', clickError.message);
          }
        }
        
        // If we found and clicked elements, don't try other selectors
        if (activatedCount > 0) break;
      }
    } catch (error) {
      // Selector might not exist, continue
    }
  }

  return activatedCount;
}

async function handlePagination(page) {
  let pagesProcessed = 0;
  
  // Handle "Load More" / "Show More" buttons
  for (let attempt = 0; attempt < 8; attempt++) {
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const target = buttons.find(el => {
        const text = el.textContent || '';
        return /\b(load more|show more|view more|see more|more|next)\b/i.test(text) &&
               text.length < 30 &&
               el.offsetParent !== null; // visible
      });
      
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) break;
    
    console.log(`Clicked "Load More" button (attempt ${attempt + 1})`);
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle', { timeout: 8000 });
    pagesProcessed++;
  }
  
  // Handle infinite scroll
  let scrollAttempts = 0;
  let lastHeight = await page.evaluate('document.body.scrollHeight');
  
  while (scrollAttempts < 6) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(1500);
    
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === lastHeight) {
      scrollAttempts++;
      if (scrollAttempts >= 2) break;
    } else {
      scrollAttempts = 0;
      lastHeight = newHeight;
      pagesProcessed++;
      console.log(`Infinite scroll triggered new content`);
    }
  }

  // Handle numbered pagination
  try {
    const paginationLinks = await page.locator('a').filter({
      hasText: /^[2-9]$|^1[0-5]$/  // Pages 2-15
    }).all();
    
    for (let i = 0; i < Math.min(paginationLinks.length, 5); i++) {
      try {
        await paginationLinks[i].click();
        await page.waitForLoadState('networkidle', { timeout: 8000 });
        pagesProcessed++;
        console.log(`Navigated to pagination page ${i + 2}`);
        await page.waitForTimeout(1000);
      } catch (navError) {
        console.log('Pagination navigation failed:', navError.message);
      }
    }
  } catch (paginationError) {
    // No pagination found
  }

  return pagesProcessed;
}

async function parseTeamPage(html, baseUrl) {
  // Import cheerio dynamically for serverless compatibility
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  const members = [];

  // Enhanced selectors for team member extraction
  const selectors = [
    // Sequoia-specific
    '.team-members__grid .grid__instance',
    '.grid__instance',
    'a.ink',
    '.ink',
    // A16Z patterns  
    '.person-card',
    '.team-card',
    // General patterns
    '.team-member',
    '.person',
    '.profile',
    '.bio-card',
    '.member-card',
    '.staff-member',
    '[class*="team"]',
    '[class*="person"]',
    '[class*="member"]',
    '[class*="profile"]',
    // Fallback patterns
    '.card:has(img)',
    'article:has(img)',
    'div:has(img):has(h1,h2,h3,h4)',
  ];

  let orderIndex = 0;
  
  for (const selector of selectors) {
    const elements = $(selector);
    if (elements.length === 0) continue;
    
    console.log(`Processing ${elements.length} elements for selector: ${selector}`);
    
    elements.each((_, element) => {
      const member = extractMemberInfo($, $(element), baseUrl, orderIndex++);
      if (member && member.name && !isDuplicate(members, member.name)) {
        members.push(member);
      }
    });
    
    // If we found good results with this selector, we're done
    if (members.length >= 5) break;
  }

  // Fallback: JSON-LD extraction
  if (members.length < 5) {
    const jsonLdMembers = extractPersonsFromJsonLd($, baseUrl);
    for (const member of jsonLdMembers) {
      if (!isDuplicate(members, member.name)) {
        members.push(member);
      }
    }
  }

  // Final fallback: regex patterns
  if (members.length < 3) {
    const regexMembers = extractMembersByRegex($, baseUrl);
    for (const member of regexMembers) {
      if (!isDuplicate(members, member.name)) {
        members.push(member);
      }
    }
  }

  return members.slice(0, 50); // Limit results
}

function extractMemberInfo($, element, baseUrl, orderIndex) {
  try {
    // Extract name (essential)
    const nameSelectors = [
      'h1', 'h2', 'h3', 'h4', 'h5',
      '.name', '.ink__title', '.person-name', '.member-name',
      '[class*="name"]', 'strong', 'b', '.title'
    ];
    
    let name = '';
    for (const sel of nameSelectors) {
      const nameEl = element.find(sel).first();
      if (nameEl.length) {
        const text = nameEl.text().trim();
        if (text && text.length > 1 && text.length < 60 && /[A-Za-z]/.test(text)) {
          name = text;
          break;
        }
      }
    }

    if (!name) return null;

    // Filter out obvious non-names
    if (name.toLowerCase().includes('team') ||
        name.toLowerCase().includes('our') ||
        name.toLowerCase().includes('member') ||
        name.length < 3) {
      return null;
    }

    // Extract title
    const titleSelectors = [
      '.title', '.position', '.role', '.job-title',
      '[class*="title"]', '[class*="position"]', '[class*="role"]'
    ];
    
    let title = '';
    for (const sel of titleSelectors) {
      const titleEl = element.find(sel).first();
      if (titleEl.length) {
        const text = titleEl.text().trim();
        if (text && text !== name && text.length < 100) {
          title = text;
          break;
        }
      }
    }

    // Extract image URL
    const imgEl = element.find('img').first();
    let imageUrl = '';
    if (imgEl.length) {
      const src = imgEl.attr('src') || imgEl.attr('data-src');
      if (src) {
        try {
          imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        } catch (e) {
          // Invalid URL
        }
      }
    }

    // Extract profile URL
    const linkEl = element.find('a').first();
    let profileUrl = '';
    if (linkEl.length) {
      const href = linkEl.attr('href');
      if (href) {
        try {
          profileUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        } catch (e) {
          // Invalid URL  
        }
      }
    }

    return {
      name: name,
      title: title || undefined,
      imageUrl: imageUrl || undefined,
      profileUrl: profileUrl || undefined,
      orderIndex: orderIndex,
      source: 'enhanced_scraper'
    };
    
  } catch (error) {
    console.warn('Error extracting member info:', error);
    return null;
  }
}

function extractPersonsFromJsonLd($, baseUrl) {
  const results = [];
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text();
      const json = JSON.parse(raw);
      const arr = Array.isArray(json) ? json : [json];
      
      for (const node of arr) {
        const graph = node['@graph'] || [node];
        for (const item of graph) {
          if (item['@type'] === 'Person' || 
              (Array.isArray(item['@type']) && item['@type'].includes('Person'))) {
            
            const name = item.name || '';
            if (!name || name.length < 2) continue;
            
            const profileUrl = item.url ? 
              (item.url.startsWith('http') ? item.url : new URL(item.url, baseUrl).href) : 
              undefined;
            const imageUrl = item.image ? 
              (item.image.startsWith('http') ? item.image : new URL(item.image, baseUrl).href) : 
              undefined;
            const title = item.jobTitle || undefined;

            results.push({
              name,
              title,
              profileUrl,
              imageUrl,
              source: 'json_ld'
            });
          }
        }
      }
    } catch (parseError) {
      // Invalid JSON-LD, skip
    }
  });
  
  return results;
}

function extractMembersByRegex($, baseUrl) {
  const results = [];
  
  // Look for name patterns in headings
  const headings = $('h1, h2, h3, h4, h5, h6').toArray();
  for (const heading of headings) {
    const text = $(heading).text().trim();
    if (text.match(/^[A-Z][a-z]+ [A-Z][a-z]+/) && text.length < 50) {
      results.push({
        name: text,
        source: 'regex_heading'
      });
    }
  }
  
  return results;
}

function isDuplicate(existingMembers, newName) {
  const normalizedNew = newName.toLowerCase().replace(/\s+/g, ' ').trim();
  return existingMembers.some(member => 
    member.name.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedNew
  );
}