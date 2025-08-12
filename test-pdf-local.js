#!/usr/bin/env node

import fs from 'fs';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';

dotenv.config();

async function testPdfParsing() {
  console.log('📄 Testing PDF Parsing for Sequoia...');
  
  const pdfPath = '/Users/christianshort/sequoia_team.pdf';
  
  try {
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      console.log('❌ PDF file not found at:', pdfPath);
      return [];
    }
    
    console.log('📁 Reading PDF file...');
    const buffer = fs.readFileSync(pdfPath);
    
    console.log('🔍 Parsing PDF content...');
    const data = await pdfParse(buffer);
    
    console.log(`📝 Extracted ${data.text.length} characters from PDF`);
    console.log('📄 First 500 characters:');
    console.log(data.text.substring(0, 500));
    console.log('...\n');
    
    // Extract names using the same logic as the server
    const text = data.text || '';
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    
    // Multiple strategies for name extraction
    const strategies = [
      // Strategy 1: Lines that look like names (2+ words, proper case)
      {
        name: 'Proper Case Names',
        regex: /^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+$/,
        filter: line => /^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+$/.test(line)
      },
      // Strategy 2: More flexible name matching
      {
        name: 'Flexible Names',
        regex: /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'.-]+)+$/,
        filter: line => /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'.-]+)+$/.test(line)
      },
      // Strategy 3: Names with titles (e.g., "John Smith, Partner")
      {
        name: 'Names with Titles',
        regex: /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'.-]+)+)(?:,|\s+\w)/,
        filter: line => {
          const match = line.match(/^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'.-]+)+)(?:,|\s+(?:Partner|Principal|Associate|Analyst|Director|VP|President|CEO|CTO|CFO))/i);
          return match ? match[1] : null;
        }
      }
    ];
    
    console.log('🔍 Testing different name extraction strategies:\n');
    
    const allNames = new Set();
    
    strategies.forEach((strategy, index) => {
      console.log(`Strategy ${index + 1}: ${strategy.name}`);
      
      let names;
      if (typeof strategy.filter === 'function' && strategy.name === 'Names with Titles') {
        names = lines.map(strategy.filter).filter(Boolean);
      } else {
        names = lines.filter(strategy.filter);
      }
      
      // Remove duplicates and sort
      names = [...new Set(names)].sort();
      
      console.log(`  Found ${names.length} names:`);
      names.slice(0, 10).forEach(name => console.log(`    • ${name}`));
      if (names.length > 10) {
        console.log(`    ... and ${names.length - 10} more`);
      }
      console.log();
      
      // Add to combined results
      names.forEach(name => allNames.add(name));
    });
    
    const finalNames = [...allNames].sort();
    
    console.log('📊 FINAL RESULTS:');
    console.log(`✅ Total unique names extracted: ${finalNames.length}`);
    
    if (finalNames.length > 0) {
      console.log('\n👥 All extracted names:');
      finalNames.forEach(name => console.log(`  • ${name}`));
    }
    
    return finalNames;
    
  } catch (error) {
    console.error('❌ PDF parsing failed:', error.message);
    return [];
  }
}

testPdfParsing().catch(console.error);