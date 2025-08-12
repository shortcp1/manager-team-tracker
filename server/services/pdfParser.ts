import fs from 'fs';
import pdfParse from 'pdf-parse';
import { storage } from '../storage';
import { type Firm } from '@shared/schema';

export async function parsePdfAndStore(firm: Firm, filePath: string): Promise<{ names: string[]; error?: string }> {
  try {
    const buffer = await fs.promises.readFile(filePath);
    const data = await pdfParse(buffer);
    const text = data.text || '';
    const lines = text.split(/\n/).map((l: string) => l.trim()).filter(Boolean);
    // Naive heuristic: lines with at least two words starting with capitals
    const nameRegex = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/;
    const names = lines.filter((l: string) => nameRegex.test(l));

    await storage.createPdfUpload({ firmId: firm.id, filePath });
    await storage.createNameScrapeResult({
      firmId: firm.id,
      method: 'pdf',
      names,
      status: 'success',
    });
    await storage.updateFirm(firm.id, {
      lastScraped: new Date(),
      lastScrapeStatus: 'success',
      lastScrapeError: null,
    });
    return { names };
  } catch (err: any) {
    const message = err?.message || 'Unknown error';
    await storage.createNameScrapeResult({
      firmId: firm.id,
      method: 'pdf',
      names: [],
      status: 'error',
      errorMessage: message,
    });
    await storage.updateFirm(firm.id, {
      lastScraped: new Date(),
      lastScrapeStatus: 'error',
      lastScrapeError: message,
    });
    return { names: [], error: message };
  }
}
