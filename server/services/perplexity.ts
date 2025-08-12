import { storage } from '../storage';
import { type Firm } from '@shared/schema';

export async function scrapeWithPerplexity(firm: Firm): Promise<{ names: string[]; error?: string }> {
  try {
    const prompt = `List only the team member names for ${firm.teamPageUrl}`;
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'pplx-7b-chat',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text);
    }
    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    const names = content.split(/\n|,|;/).map((n: string) => n.trim()).filter((n: string) => n);

    await storage.createNameScrapeResult({
      firmId: firm.id,
      method: 'perplexity',
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
      method: 'perplexity',
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
