#!/usr/bin/env node

import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

// Test data for Sequoia
const sequoia = {
  id: 'e89f47b7-1c40-44ab-a6e8-cb6640c4e1b2',
  name: 'Sequoia Capital',
  teamPageUrl: 'https://www.sequoiacap.com/our-team/'
};

console.log('🧪 Testing Scraping Methodologies Locally');
console.log('==========================================\n');

// Method 1: Web Scraping with Playwright
async function testWebScraping() {
  console.log('🌐 Testing Web Scraping...');
  
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(sequoia.teamPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Click "Load More" button repeatedly to get all team members
    let clickCount = 0;
    const maxClicks = 5;
    
    while (clickCount < maxClicks) {
      try {
        const loadMoreButton = await page.$('.facetwp-load-more:not(.facetwp-hidden)');
        if (loadMoreButton) {
          await loadMoreButton.click();
          await page.waitForTimeout(2000); // Wait for content to load
          clickCount++;
          console.log(`  📎 Clicked "Load More" ${clickCount} times`);
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }
    
    // Extract names using the correct selector from debugging
    const names = await page.$$eval('h2.ink__title', els => 
      els.map(el => el.textContent?.trim())
        .filter(name => name && /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(name))
    );
    
    await browser.close();
    
    console.log(`✅ Web Scraping: Found ${names.length} names`);
    console.log('Names:', names.slice(0, 10).join(', ') + (names.length > 10 ? '...' : ''));
    return names;
    
  } catch (error) {
    console.log(`❌ Web Scraping failed: ${error.message}`);
    return [];
  }
}

// Method 2: Perplexity API
async function testPerplexity() {
  console.log('\n🤖 Testing Perplexity API...');
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log('❌ Perplexity API key not found');
    return [];
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
          content: `List only the team member names from ${sequoia.teamPageUrl}. Return just names, one per line.`
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const names = content.split(/\n|,|;/).map(n => n.trim()).filter(n => 
      n && /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(n)
    );

    console.log(`✅ Perplexity: Found ${names.length} names`);
    console.log('Names:', names.slice(0, 10).join(', ') + (names.length > 10 ? '...' : ''));
    return names;
    
  } catch (error) {
    console.log(`❌ Perplexity failed: ${error.message}`);
    return [];
  }
}

// Method 3: PDF Analysis (placeholder - you'll upload a PDF)
function testPDF() {
  console.log('\n📄 PDF Method: Ready for upload');
  console.log('   Use: curl -X POST -F "file=@sequoia.pdf" http://localhost:3001/api/experiments/firms/e89f47b7-1c40-44ab-a6e8-cb6640c4e1b2/pdf');
  return [];
}

// Compare methods
function compareResults(webNames, perplexityNames, pdfNames = []) {
  console.log('\n📊 COMPARISON RESULTS');
  console.log('====================');
  
  const allNames = new Set([...webNames, ...perplexityNames, ...pdfNames]);
  const webSet = new Set(webNames.map(n => n.toLowerCase()));
  const perplexitySet = new Set(perplexityNames.map(n => n.toLowerCase()));
  const pdfSet = new Set(pdfNames.map(n => n.toLowerCase()));
  
  const common = [...allNames].filter(name => {
    const lower = name.toLowerCase();
    return webSet.has(lower) && perplexitySet.has(lower);
  });
  
  console.log(`📈 Total unique names: ${allNames.size}`);
  console.log(`🤝 Common between Web & Perplexity: ${common.length}`);
  console.log(`🌐 Web only: ${webNames.length}`);
  console.log(`🤖 Perplexity only: ${perplexityNames.length}`);
  
  if (common.length > 0) {
    console.log('\nCommon names:', common.slice(0, 5).join(', '));
  }
}

// Run all tests
async function runTests() {
  console.log(`Testing with: ${sequoia.name}`);
  console.log(`URL: ${sequoia.teamPageUrl}\n`);
  
  const webNames = await testWebScraping();
  const perplexityNames = await testPerplexity();
  const pdfNames = testPDF();
  
  compareResults(webNames, perplexityNames, pdfNames);
  
  console.log('\n✅ Testing complete! Next steps:');
  console.log('1. Upload a Sequoia PDF to test the third method');
  console.log('2. Compare results and iterate on the best approach');
}

runTests().catch(console.error);