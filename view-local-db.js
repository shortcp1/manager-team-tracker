#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { firms, nameScrapeResults, scrapeHistory, pdfUploads } from './shared/schema.ts';
import { desc } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function viewLocalDatabase() {
  console.log('🗄️  Local Database Overview\n');
  
  const sql = postgres(process.env.DATABASE_URL);
  const db = drizzle(sql);

  try {
    // View firms
    const firmsData = await db.select().from(firms).orderBy(desc(firms.createdAt));
    console.log(`📊 Firms (${firmsData.length}):`);
    firmsData.forEach(firm => {
      console.log(`  • ${firm.name} (${firm.status}) - ${firm.teamPageUrl}`);
    });
    console.log();

    // View name scrape results
    const nameResults = await db.select().from(nameScrapeResults)
      .orderBy(desc(nameScrapeResults.createdAt))
      .limit(15);
    console.log(`📝 Recent Name Scrape Results (${nameResults.length}):`);
    nameResults.forEach(result => {
      const nameCount = Array.isArray(result.names) ? result.names.length : 0;
      const timeAgo = new Date() - new Date(result.createdAt);
      const minutesAgo = Math.floor(timeAgo / 60000);
      console.log(`  • ${result.method.toUpperCase()}: ${nameCount} names (${result.status}) - ${minutesAgo}m ago`);
    });
    console.log();

    // View recent scrapes from scrapeHistory
    const scrapesData = await db.select().from(scrapeHistory)
      .orderBy(desc(scrapeHistory.scrapedAt))
      .limit(10);
    console.log(`🕷️  Recent Scrapes (${scrapesData.length}):`);
    scrapesData.forEach(scrape => {
      const timeAgo = new Date() - new Date(scrape.scrapedAt);
      const minutesAgo = Math.floor(timeAgo / 60000);
      console.log(`  • Firm ${scrape.firmId}: ${scrape.status} - ${scrape.membersFound} members (${scrape.duration}ms) - ${minutesAgo}m ago`);
    });
    console.log();

    // View PDF uploads
    const pdfData = await db.select().from(pdfUploads)
      .orderBy(desc(pdfUploads.uploadedAt))
      .limit(5);
    console.log(`📄 PDF Uploads (${pdfData.length}):`);
    pdfData.forEach(upload => {
      const timeAgo = new Date() - new Date(upload.uploadedAt);
      const minutesAgo = Math.floor(timeAgo / 60000);
      console.log(`  • ${upload.filePath} - ${minutesAgo}m ago`);
    });

    // Summary statistics
    console.log('\n📈 Database Statistics:');
    const totalNameResults = await db.select().from(nameScrapeResults);
    const totalScrapes = await db.select().from(scrapeHistory);
    const totalPdfs = await db.select().from(pdfUploads);
    
    console.log(`  • Total firms: ${firmsData.length}`);
    console.log(`  • Total scrape results: ${totalNameResults.length}`);
    console.log(`  • Total scrape history: ${totalScrapes.length}`);
    console.log(`  • Total PDF uploads: ${totalPdfs.length}`);
    
    // Method breakdown
    const methodBreakdown = totalNameResults.reduce((acc, result) => {
      acc[result.method] = (acc[result.method] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\n🔧 Method Usage:');
    Object.entries(methodBreakdown).forEach(([method, count]) => {
      console.log(`  • ${method.toUpperCase()}: ${count} runs`);
    });
    
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
  } finally {
    await sql.end();
  }

  process.exit(0);
}

viewLocalDatabase();