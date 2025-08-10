import express from 'express';
import { db } from '../db';
import { firms, teamMembers, scrapeHistory, changeHistory } from '../../shared/schema';
import { desc, eq, count } from 'drizzle-orm';

const router = express.Router();

// Database overview endpoint
router.get('/db-overview', async (req, res) => {
  try {
    const [
      firmsCount,
      activeMembersCount,
      totalScrapesCount,
      recentChangesCount,
    ] = await Promise.all([
      db.select({ count: count() }).from(firms),
      db.select({ count: count() }).from(teamMembers).where(eq(teamMembers.isActive, true)),
      db.select({ count: count() }).from(scrapeHistory),
      db.select({ count: count() }).from(changeHistory),
    ]);

    const [
      recentFirms,
      recentMembers,
      recentScrapes,
      recentChanges,
    ] = await Promise.all([
      db.select().from(firms).orderBy(desc(firms.createdAt)).limit(10),
      db.select().from(teamMembers)
        .where(eq(teamMembers.isActive, true))
        .orderBy(desc(teamMembers.createdAt))
        .limit(20),
      db.select().from(scrapeHistory).orderBy(desc(scrapeHistory.scrapedAt)).limit(20),
      db.select().from(changeHistory).orderBy(desc(changeHistory.detectedAt)).limit(20),
    ]);

    res.json({
      summary: {
        firms: firmsCount[0].count,
        activeMembers: activeMembersCount[0].count,
        totalScrapes: totalScrapesCount[0].count,
        recentChanges: recentChangesCount[0].count,
      },
      recent: {
        firms: recentFirms,
        members: recentMembers,
        scrapes: recentScrapes,
        changes: recentChanges,
      },
    });
  } catch (error) {
    console.error('Database overview error:', error);
    res.status(500).json({ error: 'Failed to fetch database overview' });
  }
});

// Get all firms with member counts
router.get('/firms', async (req, res) => {
  try {
    const firmsWithCounts = await db
      .select({
        firm: firms,
        memberCount: count(teamMembers.id),
      })
      .from(firms)
      .leftJoin(teamMembers, eq(firms.id, teamMembers.firmId))
      .groupBy(firms.id)
      .orderBy(desc(firms.createdAt));

    res.json(firmsWithCounts);
  } catch (error) {
    console.error('Get firms error:', error);
    res.status(500).json({ error: 'Failed to fetch firms' });
  }
});

// Get team members for a specific firm
router.get('/firms/:firmId/members', async (req, res) => {
  try {
    const { firmId } = req.params;
    const members = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.firmId, firmId))
      .orderBy(desc(teamMembers.createdAt));

    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Get scrape history for a specific firm
router.get('/firms/:firmId/scrapes', async (req, res) => {
  try {
    const { firmId } = req.params;
    const scrapes = await db
      .select()
      .from(scrapeHistory)
      .where(eq(scrapeHistory.firmId, firmId))
      .orderBy(desc(scrapeHistory.scrapedAt))
      .limit(50);

    res.json(scrapes);
  } catch (error) {
    console.error('Get scrapes error:', error);
    res.status(500).json({ error: 'Failed to fetch scrapes' });
  }
});

export default router;