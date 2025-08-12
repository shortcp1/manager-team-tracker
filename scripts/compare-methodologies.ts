import { storage } from '../server/storage';
import { webScraper } from '../server/services/scraper';
import { scrapeWithPerplexity } from '../server/services/perplexity';
import { parsePdfAndStore } from '../server/services/pdfParser';

interface MethodologyComparison {
  firmId: string;
  firmName: string;
  web: MethodResult;
  perplexity: MethodResult;
  pdf: MethodResult;
  analysis: {
    totalUniqueNames: number;
    commonNames: string[];
    webOnly: string[];
    perplexityOnly: string[];
    pdfOnly: string[];
    bestMethod: string;
    confidence: 'high' | 'medium' | 'low';
  };
}

interface MethodResult {
  status: 'success' | 'error' | 'not_run';
  names: string[];
  count: number;
  error?: string;
  duration?: number;
}

class MethodologyComparer {
  
  async compareSingleFirm(firmId: string): Promise<MethodologyComparison> {
    const firm = await storage.getFirm(firmId);
    if (!firm) {
      throw new Error(`Firm not found: ${firmId}`);
    }

    console.log(`\n🔍 Comparing methodologies for: ${firm.name}`);
    console.log(`📍 Team page URL: ${firm.teamPageUrl}`);
    console.log('=' .repeat(60));

    const results: MethodologyComparison = {
      firmId,
      firmName: firm.name,
      web: { status: 'not_run', names: [], count: 0 },
      perplexity: { status: 'not_run', names: [], count: 0 },
      pdf: { status: 'not_run', names: [], count: 0 },
      analysis: {
        totalUniqueNames: 0,
        commonNames: [],
        webOnly: [],
        perplexityOnly: [],
        pdfOnly: [],
        bestMethod: 'web',
        confidence: 'low'
      }
    };

    // Run Web Scraping
    await this.runWebScraping(firm, results);
    
    // Run Perplexity Scraping  
    await this.runPerplexityScraping(firm, results);
    
    // Check for existing PDF results
    await this.checkPdfResults(firm, results);

    // Analyze results
    this.analyzeResults(results);
    
    // Display results
    this.displayResults(results);
    
    return results;
  }

  private async runWebScraping(firm: any, results: MethodologyComparison) {
    console.log('\n🌐 Running Web Scraping...');
    const startTime = Date.now();
    
    try {
      const result = await webScraper.scrapeFirm(firm);
      const duration = Date.now() - startTime;
      
      if (result.error) {
        results.web = {
          status: 'error',
          names: [],
          count: 0,
          error: result.error,
          duration
        };
        console.log(`❌ Web scraping failed: ${result.error}`);
      } else {
        const names = result.members.map(member => member.name);
        results.web = {
          status: 'success',
          names,
          count: names.length,
          duration
        };
        console.log(`✅ Web scraping successful: ${names.length} names found`);
      }
    } catch (error) {
      results.web = {
        status: 'error',
        names: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
      console.log(`❌ Web scraping failed: ${results.web.error}`);
    }
  }

  private async runPerplexityScraping(firm: any, results: MethodologyComparison) {
    console.log('\n🤖 Running Perplexity Scraping...');
    const startTime = Date.now();
    
    try {
      const result = await scrapeWithPerplexity(firm);
      const duration = Date.now() - startTime;
      
      if (result.error) {
        results.perplexity = {
          status: 'error',
          names: [],
          count: 0,
          error: result.error,
          duration
        };
        console.log(`❌ Perplexity scraping failed: ${result.error}`);
      } else {
        results.perplexity = {
          status: 'success',
          names: result.names,
          count: result.names.length,
          duration
        };
        console.log(`✅ Perplexity scraping successful: ${result.names.length} names found`);
      }
    } catch (error) {
      results.perplexity = {
        status: 'error',
        names: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
      console.log(`❌ Perplexity scraping failed: ${results.perplexity.error}`);
    }
  }

  private async checkPdfResults(firm: any, results: MethodologyComparison) {
    console.log('\n📄 Checking for PDF results...');
    
    try {
      // Check for existing PDF results
      const pdfResults = await storage.getNameScrapeResultsByFirm(firm.id);
      const latestPdfResult = pdfResults.find(r => r.method === 'pdf');
      
      if (latestPdfResult) {
        results.pdf = {
          status: latestPdfResult.status as 'success' | 'error',
          names: latestPdfResult.names || [],
          count: latestPdfResult.names?.length || 0,
          error: latestPdfResult.errorMessage || undefined
        };
        console.log(`📋 Found existing PDF results: ${results.pdf.count} names`);
      } else {
        console.log('📋 No PDF results found. Upload a PDF using the API to test this method.');
        results.pdf = { status: 'not_run', names: [], count: 0 };
      }
    } catch (error) {
      results.pdf = {
        status: 'error',
        names: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.log(`❌ Error checking PDF results: ${results.pdf.error}`);
    }
  }

  private analyzeResults(results: MethodologyComparison) {
    const allNames = new Set<string>();
    const nameSets: { [key: string]: Set<string> } = {
      web: new Set(),
      perplexity: new Set(),
      pdf: new Set()
    };

    // Normalize names to lowercase for comparison
    ['web', 'perplexity', 'pdf'].forEach(method => {
      const methodResult = results[method as keyof MethodologyComparison] as MethodResult;
      if (methodResult.status === 'success') {
        methodResult.names.forEach(name => {
          const normalizedName = name.toLowerCase();
          allNames.add(normalizedName);
          nameSets[method].add(normalizedName);
        });
      }
    });

    results.analysis.totalUniqueNames = allNames.size;

    // Find intersections
    const successfulMethods = ['web', 'perplexity', 'pdf'].filter(
      method => (results[method as keyof MethodologyComparison] as MethodResult).status === 'success'
    );

    if (successfulMethods.length > 1) {
      // Find common names across all successful methods
      const intersection = successfulMethods.reduce((acc, method) => {
        return acc.length === 0 ? Array.from(nameSets[method]) : 
               acc.filter(name => nameSets[method].has(name));
      }, [] as string[]);
      
      results.analysis.commonNames = intersection;

      // Find method-specific names
      results.analysis.webOnly = Array.from(nameSets.web).filter(name => 
        !nameSets.perplexity.has(name) && !nameSets.pdf.has(name)
      );
      results.analysis.perplexityOnly = Array.from(nameSets.perplexity).filter(name => 
        !nameSets.web.has(name) && !nameSets.pdf.has(name)
      );
      results.analysis.pdfOnly = Array.from(nameSets.pdf).filter(name => 
        !nameSets.web.has(name) && !nameSets.perplexity.has(name)
      );
    }

    // Determine best method
    const methodScores = {
      web: results.web.status === 'success' ? results.web.count : 0,
      perplexity: results.perplexity.status === 'success' ? results.perplexity.count : 0,
      pdf: results.pdf.status === 'success' ? results.pdf.count : 0
    };

    results.analysis.bestMethod = Object.entries(methodScores)
      .sort(([,a], [,b]) => b - a)[0][0];

    // Determine confidence
    const successCount = successfulMethods.length;
    const agreementRatio = results.analysis.commonNames.length / Math.max(results.analysis.totalUniqueNames, 1);
    
    if (successCount >= 2 && agreementRatio > 0.7) {
      results.analysis.confidence = 'high';
    } else if (successCount >= 2 && agreementRatio > 0.4) {
      results.analysis.confidence = 'medium';
    } else {
      results.analysis.confidence = 'low';
    }
  }

  private displayResults(results: MethodologyComparison) {
    console.log('\n📊 COMPARISON RESULTS');
    console.log('=' .repeat(60));
    
    console.log(`\n📈 Method Performance:`);
    ['web', 'perplexity', 'pdf'].forEach(method => {
      const result = results[method as keyof MethodologyComparison] as MethodResult;
      const icon = result.status === 'success' ? '✅' : result.status === 'error' ? '❌' : '⏭️';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`  ${icon} ${method.toUpperCase()}: ${result.count} names${duration}`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });

    console.log(`\n🎯 Analysis:`);
    console.log(`  • Total unique names: ${results.analysis.totalUniqueNames}`);
    console.log(`  • Common names: ${results.analysis.commonNames.length}`);
    console.log(`  • Best method: ${results.analysis.bestMethod.toUpperCase()}`);
    console.log(`  • Confidence: ${results.analysis.confidence.toUpperCase()}`);

    if (results.analysis.commonNames.length > 0) {
      console.log(`\n🤝 Common Names (${results.analysis.commonNames.length}):`);
      results.analysis.commonNames.forEach(name => console.log(`  • ${name}`));
    }

    if (results.analysis.webOnly.length > 0) {
      console.log(`\n🌐 Web Only (${results.analysis.webOnly.length}):`);
      results.analysis.webOnly.slice(0, 5).forEach(name => console.log(`  • ${name}`));
      if (results.analysis.webOnly.length > 5) {
        console.log(`  ... and ${results.analysis.webOnly.length - 5} more`);
      }
    }

    if (results.analysis.perplexityOnly.length > 0) {
      console.log(`\n🤖 Perplexity Only (${results.analysis.perplexityOnly.length}):`);
      results.analysis.perplexityOnly.slice(0, 5).forEach(name => console.log(`  • ${name}`));
      if (results.analysis.perplexityOnly.length > 5) {
        console.log(`  ... and ${results.analysis.perplexityOnly.length - 5} more`);
      }
    }
  }

  async compareAllFirms(): Promise<MethodologyComparison[]> {
    const firms = await storage.getAllFirms();
    const results: MethodologyComparison[] = [];
    
    console.log(`🚀 Starting comparison of all ${firms.length} firms...`);
    
    for (let i = 0; i < firms.length; i++) {
      const firm = firms[i];
      console.log(`\n[${i + 1}/${firms.length}] Processing: ${firm.name}`);
      
      try {
        const result = await this.compareSingleFirm(firm.id);
        results.push(result);
        
        // Add delay between firms to be respectful
        if (i < firms.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Failed to process ${firm.name}:`, error);
      }
    }
    
    this.displayOverallSummary(results);
    return results;
  }

  private displayOverallSummary(results: MethodologyComparison[]) {
    console.log('\n🎯 OVERALL SUMMARY');
    console.log('=' .repeat(60));
    
    const methodStats = {
      web: { success: 0, total: 0, names: 0 },
      perplexity: { success: 0, total: 0, names: 0 },
      pdf: { success: 0, total: 0, names: 0 }
    };

    results.forEach(result => {
      ['web', 'perplexity', 'pdf'].forEach(method => {
        const methodResult = result[method as keyof MethodologyComparison] as MethodResult;
        if (methodResult.status !== 'not_run') {
          methodStats[method as keyof typeof methodStats].total++;
          if (methodResult.status === 'success') {
            methodStats[method as keyof typeof methodStats].success++;
            methodStats[method as keyof typeof methodStats].names += methodResult.count;
          }
        }
      });
    });

    console.log(`\n📊 Method Success Rates:`);
    Object.entries(methodStats).forEach(([method, stats]) => {
      const rate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(1) : '0.0';
      const avgNames = stats.success > 0 ? (stats.names / stats.success).toFixed(1) : '0.0';
      console.log(`  ${method.toUpperCase()}: ${stats.success}/${stats.total} (${rate}%) - Avg: ${avgNames} names`);
    });

    const highConfidence = results.filter(r => r.analysis.confidence === 'high').length;
    const mediumConfidence = results.filter(r => r.analysis.confidence === 'medium').length;
    const lowConfidence = results.filter(r => r.analysis.confidence === 'low').length;

    console.log(`\n🎯 Confidence Distribution:`);
    console.log(`  High: ${highConfidence} (${(highConfidence/results.length*100).toFixed(1)}%)`);
    console.log(`  Medium: ${mediumConfidence} (${(mediumConfidence/results.length*100).toFixed(1)}%)`);
    console.log(`  Low: ${lowConfidence} (${(lowConfidence/results.length*100).toFixed(1)}%)`);
  }
}

// CLI Usage
async function main() {
  const args = process.argv.slice(2);
  const comparer = new MethodologyComparer();

  try {
    if (args.length === 0) {
      console.log('🔍 Usage:');
      console.log('  npm run compare:methods <firmId>  # Compare single firm');
      console.log('  npm run compare:methods all       # Compare all firms');
      return;
    }

    if (args[0] === 'all') {
      await comparer.compareAllFirms();
    } else {
      await comparer.compareSingleFirm(args[0]);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await webScraper.close();
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { MethodologyComparer, MethodologyComparison, MethodResult };