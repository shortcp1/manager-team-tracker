import { 
  users, firms, teamMembers, changeHistory, scrapeHistory, emailSettings,
  type User, type InsertUser, type Firm, type InsertFirm, type TeamMember, 
  type InsertTeamMember, type ChangeHistory, type InsertChangeHistory,
  type ScrapeHistory, type InsertScrapeHistory, type EmailSettings, type InsertEmailSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, isNull, gte, lte, count } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Firm methods
  getAllFirms(): Promise<Firm[]>;
  getFirm(id: string): Promise<Firm | undefined>;
  createFirm(firm: InsertFirm): Promise<Firm>;
  updateFirm(id: string, updates: Partial<Firm>): Promise<Firm>;
  deleteFirm(id: string): Promise<void>;
  getFirmsByStatus(status: string): Promise<Firm[]>;

  // Team member methods
  getTeamMembersByFirm(firmId: string): Promise<TeamMember[]>;
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;
  getActiveTeamMembersByFirm(firmId: string): Promise<TeamMember[]>;
  deactivateTeamMember(id: string): Promise<void>;

  // Change history methods
  getChangeHistory(limit?: number, offset?: number): Promise<ChangeHistory[]>;
  getChangeHistoryByFirm(firmId: string): Promise<ChangeHistory[]>;
  createChangeHistory(change: InsertChangeHistory): Promise<ChangeHistory>;
  getRecentChanges(days: number): Promise<ChangeHistory[]>;
  markEmailSent(changeId: string): Promise<void>;

  // Scrape history methods
  getScrapeHistory(firmId?: string, limit?: number): Promise<ScrapeHistory[]>;
  createScrapeHistory(scrape: InsertScrapeHistory): Promise<ScrapeHistory>;
  getLastScrapeForFirm(firmId: string): Promise<ScrapeHistory | undefined>;

  // Email settings methods
  getEmailSettings(): Promise<EmailSettings | undefined>;
  updateEmailSettings(settings: InsertEmailSettings): Promise<EmailSettings>;

  // Statistics methods
  getStats(): Promise<{
    totalFirms: number;
    totalMembers: number;
    weeklyChanges: number;
    lastScrape: Date | null;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllFirms(): Promise<Firm[]> {
    return await db.select().from(firms).orderBy(firms.name);
  }

  async getFirm(id: string): Promise<Firm | undefined> {
    const [firm] = await db.select().from(firms).where(eq(firms.id, id));
    return firm || undefined;
  }

  async createFirm(firm: InsertFirm): Promise<Firm> {
    const [newFirm] = await db.insert(firms).values(firm).returning();
    return newFirm;
  }

  async updateFirm(id: string, updates: Partial<Firm>): Promise<Firm> {
    const [updatedFirm] = await db
      .update(firms)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(firms.id, id))
      .returning();
    return updatedFirm;
  }

  async deleteFirm(id: string): Promise<void> {
    await db.delete(firms).where(eq(firms.id, id));
  }

  async getFirmsByStatus(status: string): Promise<Firm[]> {
    return await db.select().from(firms).where(eq(firms.status, status));
  }

  async getTeamMembersByFirm(firmId: string): Promise<TeamMember[]> {
    return await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.firmId, firmId))
      .orderBy(teamMembers.name);
  }

  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member || undefined;
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [newMember] = await db.insert(teamMembers).values(member).returning();
    return newMember;
  }

  async updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember> {
    const [updatedMember] = await db
      .update(teamMembers)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(teamMembers.id, id))
      .returning();
    return updatedMember;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  async getActiveTeamMembersByFirm(firmId: string): Promise<TeamMember[]> {
    return await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.firmId, firmId), eq(teamMembers.isActive, true)))
      .orderBy(teamMembers.name);
  }

  async deactivateTeamMember(id: string): Promise<void> {
    await db
      .update(teamMembers)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(teamMembers.id, id));
  }

  async getChangeHistory(limit = 50, offset = 0): Promise<ChangeHistory[]> {
    return await db
      .select()
      .from(changeHistory)
      .orderBy(desc(changeHistory.detectedAt))
      .limit(limit)
      .offset(offset);
  }

  async getChangeHistoryByFirm(firmId: string): Promise<ChangeHistory[]> {
    return await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.firmId, firmId))
      .orderBy(desc(changeHistory.detectedAt));
  }

  async createChangeHistory(change: InsertChangeHistory): Promise<ChangeHistory> {
    const [newChange] = await db.insert(changeHistory).values(change).returning();
    return newChange;
  }

  async getRecentChanges(days: number): Promise<ChangeHistory[]> {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    return await db
      .select()
      .from(changeHistory)
      .where(gte(changeHistory.detectedAt, daysAgo))
      .orderBy(desc(changeHistory.detectedAt));
  }

  async markEmailSent(changeId: string): Promise<void> {
    await db
      .update(changeHistory)
      .set({ emailSent: true })
      .where(eq(changeHistory.id, changeId));
  }

  async getScrapeHistory(firmId?: string, limit = 50): Promise<ScrapeHistory[]> {
    const query = db.select().from(scrapeHistory);
    
    if (firmId) {
      query.where(eq(scrapeHistory.firmId, firmId));
    }
    
    return await query.orderBy(desc(scrapeHistory.scrapedAt)).limit(limit);
  }

  async createScrapeHistory(scrape: InsertScrapeHistory): Promise<ScrapeHistory> {
    const [newScrape] = await db.insert(scrapeHistory).values(scrape).returning();
    return newScrape;
  }

  async getLastScrapeForFirm(firmId: string): Promise<ScrapeHistory | undefined> {
    const [lastScrape] = await db
      .select()
      .from(scrapeHistory)
      .where(eq(scrapeHistory.firmId, firmId))
      .orderBy(desc(scrapeHistory.scrapedAt))
      .limit(1);
    
    return lastScrape || undefined;
  }

  async getEmailSettings(): Promise<EmailSettings | undefined> {
    const [settings] = await db.select().from(emailSettings).limit(1);
    return settings || undefined;
  }

  async updateEmailSettings(settings: InsertEmailSettings): Promise<EmailSettings> {
    const existing = await this.getEmailSettings();
    
    if (existing) {
      const [updated] = await db
        .update(emailSettings)
        .set({ ...settings, updatedAt: sql`now()` })
        .where(eq(emailSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(emailSettings).values(settings).returning();
      return created;
    }
  }

  async getStats(): Promise<{
    totalFirms: number;
    totalMembers: number;
    weeklyChanges: number;
    lastScrape: Date | null;
  }> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [firmCount] = await db.select({ count: count() }).from(firms);
    const [memberCount] = await db.select({ count: count() }).from(teamMembers).where(eq(teamMembers.isActive, true));
    const [changeCount] = await db.select({ count: count() }).from(changeHistory).where(gte(changeHistory.detectedAt, weekAgo));
    const [lastScrape] = await db.select({ scrapedAt: scrapeHistory.scrapedAt }).from(scrapeHistory).orderBy(desc(scrapeHistory.scrapedAt)).limit(1);

    return {
      totalFirms: firmCount.count,
      totalMembers: memberCount.count,
      weeklyChanges: changeCount.count,
      lastScrape: lastScrape?.scrapedAt || null,
    };
  }
}

export const storage = new DatabaseStorage();
