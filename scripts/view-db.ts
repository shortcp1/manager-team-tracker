#!/usr/bin/env tsx

/**
 * Database viewer script - run with: npm run db:view
 * Shows all tables and recent data
 */

import { db } from '../server/db';
import { firms, teamMembers, scrapeHistory, changeHistory, notificationSettings } from '../shared/schema';
import { desc, eq } from 'drizzle-orm';

async function viewDatabase() {
  console.log('🗄️  Database Overview\n');

  try {
    // View firms
    const firmsData = await db.select().from(firms).orderBy(desc(firms.createdAt)).limit(10);
    console.log(`📊 Firms (${firmsData.length} recent):`);
    firmsData.forEach(firm => {
      console.log(`  • ${firm.name} (${firm.status}) - ${firm.teamPageUrl}`);
    });
    console.log();

    // View team members
    const membersData = await db.select().from(teamMembers)
      .where(eq(teamMembers.isActive, true))
      .orderBy(desc(teamMembers.createdAt))
      .limit(15);
    console.log(`👥 Active Team Members (${membersData.length} recent):`);
    membersData.forEach(member => {
      console.log(`  • ${member.name} - ${member.title || 'No title'} (Firm ID: ${member.firmId})`);
    });
    console.log();

    // View recent scrapes
    const scrapesData = await db.select().from(scrapeHistory)
      .orderBy(desc(scrapeHistory.scrapedAt))
      .limit(10);
    console.log(`🕷️  Recent Scrapes (${scrapesData.length}):`);
    scrapesData.forEach(scrape => {
      console.log(`  • Firm ${scrape.firmId}: ${scrape.status} - ${scrape.membersFound} members (${scrape.duration}ms)`);
    });
    console.log();

    // View recent changes
    const changesData = await db.select().from(changeHistory)
      .orderBy(desc(changeHistory.detectedAt))
      .limit(10);
    console.log(`📈 Recent Changes (${changesData.length}):`);
    changesData.forEach(change => {
      console.log(`  • ${change.changeType}: ${change.memberName} - ${change.memberTitle || 'No title'}`);
    });
    console.log();

    // View notification settings
    const settingsData = await db.select().from(notificationSettings).limit(5);
    console.log(`🔔 Notification Settings (${settingsData.length}):`);
    settingsData.forEach(setting => {
      console.log(`  • ${setting.recipients.join(', ')} - ${setting.isEnabled ? 'Enabled' : 'Disabled'}`);
    });

  } catch (error) {
    console.error('❌ Database connection error:', error);
    console.log('\n💡 Make sure DATABASE_URL is set in your environment');
  }

  process.exit(0);
}

viewDatabase();