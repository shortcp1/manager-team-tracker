import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { webScraper } from "./services/scraper";
import { schedulerService } from "./services/scheduler";
import { insertFirmSchema, insertEmailSettingsSchema, type Firm } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Dashboard stats
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Firms endpoints
  app.get("/api/firms", async (req, res) => {
    try {
      const firms = await storage.getAllFirms();
      
      // Add team member counts
      const firmsWithCounts = await Promise.all(
        firms.map(async (firm) => {
          const members = await storage.getActiveTeamMembersByFirm(firm.id);
          return {
            ...firm,
            teamSize: members.length,
          };
        })
      );
      
      res.json(firmsWithCounts);
    } catch (error) {
      console.error("Error fetching firms:", error);
      res.status(500).json({ message: "Failed to fetch firms" });
    }
  });

  app.get("/api/firms/:id", async (req, res) => {
    try {
      const firm = await storage.getFirm(req.params.id);
      if (!firm) {
        return res.status(404).json({ message: "Firm not found" });
      }
      res.json(firm);
    } catch (error) {
      console.error("Error fetching firm:", error);
      res.status(500).json({ message: "Failed to fetch firm" });
    }
  });

  app.post("/api/firms", async (req, res) => {
    try {
      const firmData = insertFirmSchema.parse(req.body);
      const firm = await storage.createFirm(firmData);
      res.status(201).json(firm);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating firm:", error);
      res.status(500).json({ message: "Failed to create firm" });
    }
  });

  app.put("/api/firms/:id", async (req, res) => {
    try {
      const firmData = insertFirmSchema.partial().parse(req.body);
      const firm = await storage.updateFirm(req.params.id, firmData);
      res.json(firm);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating firm:", error);
      res.status(500).json({ message: "Failed to update firm" });
    }
  });

  app.delete("/api/firms/:id", async (req, res) => {
    try {
      await storage.deleteFirm(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting firm:", error);
      res.status(500).json({ message: "Failed to delete firm" });
    }
  });

  // Team members endpoints
  app.get("/api/firms/:firmId/members", async (req, res) => {
    try {
      const members = await storage.getActiveTeamMembersByFirm(req.params.firmId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/members", async (req, res) => {
    try {
      // Get all firms and their active members
      const firms = await storage.getAllFirms();
      const allMembers = [];
      
      for (const firm of firms) {
        const members = await storage.getActiveTeamMembersByFirm(firm.id);
        const membersWithFirm = members.map(member => ({
          ...member,
          firmName: firm.name,
          firmType: firm.type,
        }));
        allMembers.push(...membersWithFirm);
      }
      
      res.json(allMembers);
    } catch (error) {
      console.error("Error fetching all members:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  // Change history endpoints
  app.get("/api/changes", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const changes = await storage.getChangeHistory(limit, offset);
      
      // Add firm information to changes
      const changesWithFirms = await Promise.all(
        changes.map(async (change) => {
          const firm = await storage.getFirm(change.firmId);
          return {
            ...change,
            firmName: firm?.name || 'Unknown',
            firmType: firm?.type || 'Unknown',
          };
        })
      );
      
      res.json(changesWithFirms);
    } catch (error) {
      console.error("Error fetching change history:", error);
      res.status(500).json({ message: "Failed to fetch change history" });
    }
  });

  app.get("/api/changes/recent", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const changes = await storage.getRecentChanges(days);
      
      // Add firm information
      const changesWithFirms = await Promise.all(
        changes.map(async (change) => {
          const firm = await storage.getFirm(change.firmId);
          return {
            ...change,
            firmName: firm?.name || 'Unknown',
            firmType: firm?.type || 'Unknown',
          };
        })
      );
      
      res.json(changesWithFirms);
    } catch (error) {
      console.error("Error fetching recent changes:", error);
      res.status(500).json({ message: "Failed to fetch recent changes" });
    }
  });

  // Scraping endpoints
  app.post("/api/scrape/run", async (req, res) => {
    try {
      // Run scraping job manually
      schedulerService.runScrapingJob();
      res.json({ message: "Scraping job started" });
    } catch (error) {
      console.error("Error starting scrape job:", error);
      res.status(500).json({ message: "Failed to start scraping job" });
    }
  });

  app.post("/api/scrape/firm/:id", async (req, res) => {
    try {
      const firm = await storage.getFirm(req.params.id);
      if (!firm) {
        return res.status(404).json({ message: "Firm not found" });
      }

      const result = await webScraper.scrapeFirm(firm);
      
      if (result.error) {
        return res.status(500).json({ message: result.error });
      }

      const changesDetected = await webScraper.detectChanges(firm.id, result.members);
      
      res.json({
        membersFound: result.members.length,
        changesDetected,
        message: `Successfully scraped ${firm.name}`,
      });
    } catch (error) {
      console.error("Error scraping firm:", error);
      res.status(500).json({ message: "Failed to scrape firm" });
    }
  });

  app.post("/api/scrape/all", async (req, res) => {
    try {
      const firms = await storage.getAllFirms();
      const activeFirms = firms.filter((firm: Firm) => firm.status === 'active');
      
      if (activeFirms.length === 0) {
        return res.json({
          firmsProcessed: 0,
          totalMembersFound: 0,
          totalChangesDetected: 0,
          message: "No active firms to scrape",
        });
      }

      let totalMembersFound = 0;
      let totalChangesDetected = 0;
      let firmsProcessed = 0;

      for (const firm of activeFirms) {
        try {
          const result = await webScraper.scrapeFirm(firm);
          
          if (!result.error) {
            const changesDetected = await webScraper.detectChanges(firm.id, result.members);
            totalMembersFound += result.members.length;
            totalChangesDetected += changesDetected;
            firmsProcessed++;
          }
        } catch (error) {
          console.error(`Error scraping firm ${firm.name}:`, error);
          // Continue with other firms even if one fails
        }
      }
      
      res.json({
        firmsProcessed,
        totalMembersFound,
        totalChangesDetected,
        message: `Successfully scraped ${firmsProcessed} of ${activeFirms.length} active firms`,
      });
    } catch (error) {
      console.error("Error scraping all firms:", error);
      res.status(500).json({ message: "Failed to scrape firms" });
    }
  });

  // Scrape history endpoints
  app.get("/api/scrapes", async (req, res) => {
    try {
      const firmId = req.query.firmId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const scrapes = await storage.getScrapeHistory(firmId, limit);
      
      // Add firm information
      const scrapesWithFirms = await Promise.all(
        scrapes.map(async (scrape) => {
          const firm = await storage.getFirm(scrape.firmId);
          return {
            ...scrape,
            firmName: firm?.name || 'Unknown',
          };
        })
      );
      
      res.json(scrapesWithFirms);
    } catch (error) {
      console.error("Error fetching scrape history:", error);
      res.status(500).json({ message: "Failed to fetch scrape history" });
    }
  });

  // Admin/Database endpoints
  app.get("/api/admin/db-overview", async (req, res) => {
    try {
      const stats = await storage.getStats();
      const recentChanges = await storage.getRecentChanges(7);
      const recentScrapes = await storage.getScrapeHistory('', 10);
      
      res.json({
        summary: stats,
        recent: {
          changes: recentChanges,
          scrapes: recentScrapes,
        },
      });
    } catch (error) {
      console.error('Database overview error:', error);
      res.status(500).json({ error: 'Failed to fetch database overview' });
    }
  });

  // Email settings endpoints
  app.get("/api/settings/email", async (req, res) => {
    try {
      const settings = await storage.getEmailSettings();
      res.json(settings || { recipients: [], enabled: true });
    } catch (error) {
      console.error("Error fetching email settings:", error);
      res.status(500).json({ message: "Failed to fetch email settings" });
    }
  });

  app.put("/api/settings/email", async (req, res) => {
    try {
      const settingsData = insertEmailSettingsSchema.parse(req.body);
      const settings = await storage.updateEmailSettings(settingsData);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating email settings:", error);
      res.status(500).json({ message: "Failed to update email settings" });
    }
  });

  // Start the scheduler
  schedulerService.start();

  const httpServer = createServer(app);
  return httpServer;
}
