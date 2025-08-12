#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { nameScrapeResults, pdfUploads, scrapeHistory, firms } from './shared/schema.ts';

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
async function webScrapingWithStorage() {
  console.log('🌐 Method 1: Web Scraping');
  console.log('-'.repeat(40));
  
  const startTime = Date.now();
  let names = [];
  let error = null;
  
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
    
    names = await page.$$eval('h2.ink__title', els => 
      els.map(el => el.textContent?.trim())
        .filter(name => name && /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(name))
    );
    
    await browser.close();
    names = names.sort();
    
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
  
  return names;
}

// Method 2: Perplexity API with Storage
async function perplexityAPIWithStorage() {
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
    
    return [];
  }
  
  const startTime = Date.now();
  let names = [];
  let error = null;
  
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
          content: `List only the team member names from ${sequoia.teamPageUrl}. Return just names, one per line, no titles or descriptions. Make sure you're accessing from a US browser, and check for scrolling down, multiple pages, multiple team types to click through, etc.`
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
  
  return names;
}

// Method 3: PDF Parsing with Storage
async function pdfParsingWithStorage() {
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
    
    // Extract names with better filtering
    names = lines.filter(line => /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/.test(line));
    
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

// Run comprehensive test with database storage
async function runComprehensiveTestWithStorage() {
  const startTime = Date.now();
  
  console.log('🗄️  Database: Connected to local PostgreSQL');
  console.log('💾 All results will be saved for historical analysis\n');
  
  const [webNames, perplexityNames, pdfNames] = await Promise.all([
    webScrapingWithStorage(),
    perplexityAPIWithStorage(), 
    pdfParsingWithStorage()
  ]);
  
  const results = await analyzeResultsWithHistory(webNames, perplexityNames, pdfNames);
  
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