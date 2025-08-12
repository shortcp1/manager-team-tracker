#!/usr/bin/env node

import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

async function debugSequoiaPage() {
  console.log('🔍 Debugging Sequoia page structure...');
  
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.sequoiacap.com/our-team/', { 
      waitUntil: 'networkidle', 
      timeout: 30000 
    });
    
    // Take a screenshot
    await page.screenshot({ path: 'sequoia-page.png', fullPage: true });
    
    // Check what's actually on the page
    const allText = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, .name, [class*="name"], [class*="person"], [class*="member"]'))
        .slice(0, 20)
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.trim().slice(0, 100)
        }));
    });
    
    console.log('📄 Elements found:');
    allText.forEach(el => {
      console.log(`  ${el.tag}.${el.class}: "${el.text}"`);
    });
    
    // Try to find any clickable elements that might load more content
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="button"], .load-more, [class*="load"]'))
        .slice(0, 10)
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.trim()
        }));
    });
    
    console.log('\n🔘 Buttons found:');
    buttons.forEach(btn => {
      console.log(`  ${btn.tag}.${btn.class}: "${btn.text}"`);
    });
    
    // Wait a bit to see if content loads
    console.log('\n⏳ Waiting for content to load...');
    await page.waitForTimeout(5000);
    
    // Check again after waiting
    const namesAfterWait = await page.evaluate(() => {
      const nameRegex = /^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/;
      return Array.from(document.querySelectorAll('*'))
        .map(el => el.textContent?.trim())
        .filter(text => text && nameRegex.test(text))
        .slice(0, 20);
    });
    
    console.log('\n👥 Names found after waiting:');
    namesAfterWait.forEach(name => console.log(`  • ${name}`));
    
    console.log('\n✅ Debug complete. Check sequoia-page.png for visual reference.');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await browser.close();
  }
}

debugSequoiaPage().catch(console.error);