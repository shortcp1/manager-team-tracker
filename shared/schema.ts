import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const firms = pgTable("firms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  teamPageUrl: text("team_page_url").notNull(),
  type: text("type").notNull(), // "Venture Capital" or "Private Equity"
  status: text("status").notNull().default("active"), // "active", "paused", "error"
  lastScraped: timestamp("last_scraped"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmId: varchar("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"),
  bio: text("bio"),
  focusAreas: text("focus_areas").array(),
  imageUrl: text("image_url"),
  profileUrl: text("profile_url"),
  isActive: boolean("is_active").notNull().default(true),
  firstSeen: timestamp("first_seen").notNull().default(sql`now()`),
  lastSeen: timestamp("last_seen").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Enrichment fields
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  officeCountry: text("office_country"),
  department: text("department"),
  seniorityLevel: text("seniority_level"),
  normalizedTitle: text("normalized_title"),
  normalizedName: text("normalized_name"),
  entityKey: text("entity_key"),
  twitterUrl: text("twitter_url"),
  githubUrl: text("github_url"),
  personalWebsite: text("personal_website"),
  orderIndex: integer("order_index"),
  category: text("category"),
  profilePhotoHash: text("profile_photo_hash"),
});

export const changeHistory = pgTable("change_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmId: varchar("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
  memberId: varchar("member_id").references(() => teamMembers.id, { onDelete: "cascade" }),
  changeType: text("change_type").notNull(), // "added", "removed", "updated"
  memberName: text("member_name").notNull(),
  memberTitle: text("member_title"),
  previousData: jsonb("previous_data"),
  newData: jsonb("new_data"),
  detectedAt: timestamp("detected_at").notNull().default(sql`now()`),
  emailSent: boolean("email_sent").notNull().default(false),
});

export const scrapeHistory = pgTable("scrape_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmId: varchar("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // "success", "error", "partial"
  membersFound: integer("members_found").default(0),
  changesDetected: integer("changes_detected").default(0),
  errorMessage: text("error_message"),
  scrapedAt: timestamp("scraped_at").notNull().default(sql`now()`),
  duration: integer("duration"), // milliseconds
  // Artifact fields for auditability
  screenshotPath: text("screenshot_path"),
  htmlPath: text("html_path"),
});

export const emailSettings = pgTable("email_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipients: text("recipients").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Relations
export const firmsRelations = relations(firms, ({ many }) => ({
  teamMembers: many(teamMembers),
  changeHistory: many(changeHistory),
  scrapeHistory: many(scrapeHistory),
}));

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  firm: one(firms, {
    fields: [teamMembers.firmId],
    references: [firms.id],
  }),
  changeHistory: many(changeHistory),
}));

export const changeHistoryRelations = relations(changeHistory, ({ one }) => ({
  firm: one(firms, {
    fields: [changeHistory.firmId],
    references: [firms.id],
  }),
  member: one(teamMembers, {
    fields: [changeHistory.memberId],
    references: [teamMembers.id],
  }),
}));

export const scrapeHistoryRelations = relations(scrapeHistory, ({ one }) => ({
  firm: one(firms, {
    fields: [scrapeHistory.firmId],
    references: [firms.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertFirmSchema = createInsertSchema(firms).omit({
  id: true,
  lastScraped: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  firstSeen: true,
  lastSeen: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChangeHistorySchema = createInsertSchema(changeHistory).omit({
  id: true,
  detectedAt: true,
});

export const insertScrapeHistorySchema = createInsertSchema(scrapeHistory).omit({
  id: true,
  scrapedAt: true,
});

export const insertEmailSettingsSchema = createInsertSchema(emailSettings).omit({
  id: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Firm = typeof firms.$inferSelect;
export type InsertFirm = z.infer<typeof insertFirmSchema>;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

export type ChangeHistory = typeof changeHistory.$inferSelect;
export type InsertChangeHistory = z.infer<typeof insertChangeHistorySchema>;

export type ScrapeHistory = typeof scrapeHistory.$inferSelect;
export type InsertScrapeHistory = z.infer<typeof insertScrapeHistorySchema>;

export type EmailSettings = typeof emailSettings.$inferSelect;
export type InsertEmailSettings = z.infer<typeof insertEmailSettingsSchema>;
