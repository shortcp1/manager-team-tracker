#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL);

console.log('🏆 SIMPLE METHODOLOGY COMPARISON DASHBOARD');
console.log('='.repeat(60));

async function simpleDashboard(firmName = null) {
  try {
    // 1. Show all firms with their latest scrape results
    console.log('\n📊 FIRM OVERVIEW');
    console.log('-'.repeat(60));
    
    const firmResults = await sql`
      SELECT 
        f.name as firm,
        COUNT(DISTINCT ss.id) as total_scrapes,
        MAX(ss.started_at) as latest_scrape
      FROM firms f
      LEFT JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
      GROUP BY f.name
      ORDER BY latest_scrape DESC NULLS LAST
    `;
    
    console.table(firmResults.map(row => ({
      Firm: row.firm,
      'Total Scrapes': row.total_scrapes,
      'Latest Scrape': row.latest_scrape ? new Date(row.latest_scrape).toLocaleString() : 'Never'
    })));

    // 2. Show method performance for all firms
    console.log('\n📈 LATEST METHOD PERFORMANCE BY FIRM');
    console.log('-'.repeat(60));
    
    const methodPerformance = await sql`
      WITH latest_sessions AS (
        SELECT 
          f.name as firm_name,
          ss.id as scrape_id,
          ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY ss.started_at DESC) as rn
        FROM firms f
        JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
      ),
      latest_firm_sessions AS (
        SELECT firm_name, scrape_id
        FROM latest_sessions 
        WHERE rn = 1
      )
      SELECT 
        lfs.firm_name as firm,
        sr.method,
        jsonb_array_length(sr.names) as name_count,
        sr.status,
        sr.created_at
      FROM latest_firm_sessions lfs
      JOIN scrape_results sr ON lfs.scrape_id = sr.scrape_id
      ORDER BY lfs.firm_name, sr.method
    `;
    
    console.table(methodPerformance.map(row => ({
      Firm: row.firm,
      Method: row.method.toUpperCase(),
      'Names Found': row.name_count,
      Status: row.status === 'success' ? '✅' : '❌',
      'Scraped At': new Date(row.created_at).toLocaleString()
    })));

    // 3. If specific firm requested, show detailed breakdown
    if (firmName) {
      console.log(`\n🔍 DETAILED BREAKDOWN: ${firmName}`);
      console.log('-'.repeat(60));
      
      // Get the latest scrape for this firm
      const firmData = await sql`
        WITH latest_session AS (
          SELECT 
            f.name as firm_name,
            ss.id as scrape_id,
            ss.started_at
          FROM firms f
          JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
          WHERE f.name = ${firmName}
          ORDER BY ss.started_at DESC
          LIMIT 1
        )
        SELECT 
          ls.firm_name,
          ls.scrape_id,
          ls.started_at,
          sr.method,
          sr.names,
          sr.status
        FROM latest_session ls
        JOIN scrape_results sr ON ls.scrape_id = sr.scrape_id
        ORDER BY sr.method
      `;

      if (firmData.length === 0) {
        console.log(`❌ No data found for firm: ${firmName}`);
        console.log('Available firms:');
        const availableFirms = await sql`SELECT name FROM firms ORDER BY name`;
        availableFirms.forEach(f => console.log(`  - ${f.name}`));
        return;
      }

      console.log(`Scrape Session: ${firmData[0].scrape_id}`);
      console.log(`Scraped At: ${new Date(firmData[0].started_at).toLocaleString()}\n`);

      // Show method comparison
      const methods = {};
      firmData.forEach(row => {
        methods[row.method] = {
          names: row.names,
          count: row.names.length,
          status: row.status
        };
      });

      console.log('📊 Method Comparison:');
      Object.entries(methods).forEach(([method, data]) => {
        console.log(`  ${method.toUpperCase()}: ${data.count} names (${data.status})`);
      });

      // Show sample names from each method
      console.log('\n📝 Sample Names (first 10 from each method):');
      Object.entries(methods).forEach(([method, data]) => {
        console.log(`\n${method.toUpperCase()}:`);
        data.names.slice(0, 10).forEach(name => console.log(`  • ${name}`));
        if (data.names.length > 10) {
          console.log(`  ... and ${data.names.length - 10} more`);
        }
      });

      // Simple overlap calculation
      if (methods.web && methods.perplexity && methods.pdf) {
        const webSet = new Set(methods.web.names.map(n => n.toLowerCase()));
        const perplexitySet = new Set(methods.perplexity.names.map(n => n.toLowerCase()));
        const pdfSet = new Set(methods.pdf.names.map(n => n.toLowerCase()));
        
        const allThree = methods.web.names.filter(name => 
          perplexitySet.has(name.toLowerCase()) && pdfSet.has(name.toLowerCase())
        );

        console.log(`\n🤝 Names found by ALL three methods (${allThree.length}):`);
        allThree.forEach(name => console.log(`  • ${name}`));
      }
    }

  } catch (error) {
    console.error('❌ Error running dashboard:', error.message);
  } finally {
    await sql.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const firmName = args[0] || null;

if (firmName) {
  console.log(`\n🎯 Analyzing: ${firmName}`);
} else {
  console.log('\n💡 Usage: npx tsx simple-dashboard.js "Firm Name" for detailed analysis');
}

simpleDashboard(firmName).catch(console.error);