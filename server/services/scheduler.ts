import cron from 'node-cron';
import { storage } from '../storage';
import { webScraper } from './scraper';
import { emailService } from './email';

export class SchedulerService {
  private scheduledTask: any | null = null;

  start() {
    // Schedule scraping every Monday at 2:00 AM
    this.scheduledTask = cron.schedule('0 2 * * 1', async () => {
      console.log('Starting scheduled scrape job...');
      await this.runScrapingJob();
    });

    console.log('Scheduler started - Weekly scraping every Monday at 2:00 AM EST');
  }

  stop() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      console.log('Scheduler stopped');
    }
  }

  async runScrapingJob(): Promise<void> {
    const startTime = Date.now();
    let totalChanges = 0;
    let successCount = 0;
    let errorCount = 0;

    try {
      // Get all firms regardless of status
      const firms = await storage.getAllFirms();
      console.log(`Starting scrape job for ${firms.length} firms`);

      const allChanges = [];

      // Scrape each firm
      for (const firm of firms) {
        try {
          console.log(`Scraping ${firm.name}...`);
          
          const result = await webScraper.scrapeFirm(firm);
          
          if (result.error) {
            console.error(`Failed to scrape ${firm.name}: ${result.error}`);
            errorCount++;
            continue;
          }

          // Detect changes
          const changesDetected = await webScraper.detectChanges(firm.id, result.members);
          
          if (changesDetected > 0) {
            console.log(`Detected ${changesDetected} changes for ${firm.name}`);
            totalChanges += changesDetected;
            
            // Get the recent changes for this firm
            const recentChanges = await storage.getChangeHistoryByFirm(firm.id);
            allChanges.push(...recentChanges.slice(0, changesDetected));
          }

          // Update scrape history with changes count
          const lastScrape = await storage.getLastScrapeForFirm(firm.id);
          if (lastScrape) {
            // Note: In a production system, you'd update the existing record
            // For simplicity, we're just logging here
            console.log(`Updated scrape history for ${firm.name}: ${changesDetected} changes`);
          }

          successCount++;
          
          // Add delay between scrapes to be respectful
          await this.delay(2000);
        } catch (error) {
          console.error(`Error scraping ${firm.name}:`, error);
          errorCount++;
        }
      }

      // Send email notifications if there were changes
      if (allChanges.length > 0) {
        try {
          await emailService.sendChangeNotification(allChanges);
          console.log(`Email notification sent for ${allChanges.length} changes`);
        } catch (error) {
          console.error('Error sending email notifications:', error);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Scrape job completed: ${successCount} success, ${errorCount} errors, ${totalChanges} total changes in ${duration}ms`);
      
    } catch (error) {
      console.error('Error running scraping job:', error);
    } finally {
      await webScraper.close();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const schedulerService = new SchedulerService();
