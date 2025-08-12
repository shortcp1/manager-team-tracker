#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';

dotenv.config();

const sequoia = {
  id: 'e89f47b7-1c40-44ab-a6e8-cb6640c4e1b2',
  name: 'Sequoia Capital',
  teamPageUrl: 'https://www.sequoiacap.com/our-team/'
};

console.log('🏆 COMPREHENSIVE METHODOLOGY COMPARISON');
console.log('=====================================\n');
console.log(`Testing: ${sequoia.name}`);
console.log(`URL: ${sequoia.teamPageUrl}\n`);

// Method 1: Web Scraping
async function webScraping() {
  console.log('🌐 Method 1: Web Scraping');
  console.log('-'.repeat(40));
  
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(sequoia.teamPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Click Load More buttons
    let clickCount = 0;
    const maxClicks = 5;
    
    while (clickCount < maxClicks) {
      try {
        const loadMoreButton = await page.$('.facetwp-load-more:not(.facetwp-hidden)');
        if (loadMoreButton) {
          await loadMoreButton.click();
          await page.waitForTimeout(2000);
          clickCount++;
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }
    
    const names = await page.$$eval('h2.ink__title', els => 
      els.map(el => el.textContent?.trim())
        .filter(name => name && /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(name))
    );
    
    await browser.close();
    
    console.log(`✅ Success: ${names.length} names found`);
    return names.sort();
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return [];
  }
}

// Method 2: Perplexity API
async function perplexityAPI() {
  console.log('\n🤖 Method 2: Perplexity API');
  console.log('-'.repeat(40));
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log('❌ API key not found');
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
          content: `List only the team member names from ${sequoia.teamPageUrl}. Return just names, one per line, no titles or descriptions.`
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

    console.log(`✅ Success: ${names.length} names found`);
    return [...new Set(names)].sort();
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return [];
  }
}

// Method 3: PDF Parsing
async function pdfParsing() {
  console.log('\n📄 Method 3: PDF Parsing');
  console.log('-'.repeat(40));
  
  const pdfPath = '/Users/christianshort/sequoia_team.pdf';
  
  try {
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF file not found');
      return [];
    }
    
    const buffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(buffer);
    const text = data.text || '';
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    
    // Extract names with better filtering
    let names = lines.filter(line => /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(line));
    
    // Remove obvious false positives
    const falsePositives = [
      'Our Team', 'Load More', 'Toggle Categories', 'View Profile', 
      'Get In Touch', 'General Counsel', 'Senior Director', 'VP of Talent',
      'Deputy CCO', 'Principal Designer', 'Seed Early', 'Growth Operator'
    ];
    
    names = names.filter(name => !falsePositives.some(fp => 
      name.toLowerCase().includes(fp.toLowerCase())
    ));
    
    names = [...new Set(names)].sort();
    
    console.log(`✅ Success: ${names.length} names found`);
    return names;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return [];
  }
}

// Comparison Analysis
function analyzeResults(webNames, perplexityNames, pdfNames) {
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
  console.log(`📊 Method Results:`);
  console.log(`  🌐 Web Scraping: ${webNames.length} names`);
  console.log(`  🤖 Perplexity: ${perplexityNames.length} names`);
  console.log(`  📄 PDF Parsing: ${pdfNames.length} names`);
  console.log(`  📈 Total Unique: ${allNames.size} names\n`);
  
  console.log(`🤝 Overlap Analysis:`);
  console.log(`  Web ∩ Perplexity: ${webPerplexity.length} names`);
  console.log(`  Web ∩ PDF: ${webPdf.length} names`);
  console.log(`  Perplexity ∩ PDF: ${perplexityPdf.length} names`);
  console.log(`  All Three: ${allThree.length} names\n`);
  
  if (allThree.length > 0) {
    console.log(`✨ Names found by ALL methods:`);
    allThree.forEach(name => console.log(`    • ${name}`));
    console.log();
  }
  
  if (webPerplexity.length > 0) {
    console.log(`🔗 Web + Perplexity common names:`);
    webPerplexity.slice(0, 10).forEach(name => console.log(`    • ${name}`));
    if (webPerplexity.length > 10) console.log(`    ... and ${webPerplexity.length - 10} more`);
    console.log();
  }
  
  // Accuracy assessment
  const baselineSize = Math.max(webNames.length, perplexityNames.length, pdfNames.length);
  const agreement = (allThree.length / baselineSize) * 100;
  
  console.log(`📈 Quality Assessment:`);
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

// Run comprehensive test
async function runComprehensiveTest() {
  const startTime = Date.now();
  
  const [webNames, perplexityNames, pdfNames] = await Promise.all([
    webScraping(),
    perplexityAPI(),
    pdfParsing()
  ]);
  
  const results = analyzeResults(webNames, perplexityNames, pdfNames);
  
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
}

runComprehensiveTest().catch(console.error);