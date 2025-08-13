#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

console.log('🏆 METHODOLOGY COMPARISON DASHBOARD');
console.log('='.repeat(60));

async function runDashboard(firmName = null) {
  try {
    // 1. Overview of all firms
    console.log('\n📊 FIRM OVERVIEW');
    console.log('-'.repeat(60));
    
    const overview = await sql`
      WITH latest_sessions AS (
        SELECT DISTINCT 
          f.id as firm_id,
          f.name as firm_name,
          ss.id as scrape_id,
          ss.started_at,
          ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY ss.started_at DESC) as rn
        FROM firms f
        LEFT JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
        WHERE ss.id IS NOT NULL
      ),
      latest_firm_sessions AS (
        SELECT firm_id, firm_name, scrape_id, started_at
        FROM latest_sessions 
        WHERE rn = 1
      )
      SELECT 
        lfs.firm_name as firm,
        lfs.started_at as latest_scrape,
        COALESCE(web.names_count, 0) as web_names,
        COALESCE(perplexity.names_count, 0) as perplexity_names, 
        COALESCE(pdf.names_count, 0) as pdf_names,
        CASE 
          WHEN web.status = 'success' THEN '✅'
          WHEN web.status = 'error' THEN '❌'
          ELSE '⚪'
        END as web_status,
        CASE 
          WHEN perplexity.status = 'success' THEN '✅'
          WHEN perplexity.status = 'error' THEN '❌' 
          ELSE '⚪'
        END as perplexity_status,
        CASE 
          WHEN pdf.status = 'success' THEN '✅'
          WHEN pdf.status = 'error' THEN '❌'
          ELSE '⚪'
        END as pdf_status
      FROM latest_firm_sessions lfs
      LEFT JOIN (
        SELECT scrape_id, jsonb_array_length(names) as names_count, status
        FROM scrape_results WHERE method = 'web'
      ) web ON lfs.scrape_id = web.scrape_id
      LEFT JOIN (
        SELECT scrape_id, jsonb_array_length(names) as names_count, status  
        FROM scrape_results WHERE method = 'perplexity'
      ) perplexity ON lfs.scrape_id = perplexity.scrape_id
      LEFT JOIN (
        SELECT scrape_id, jsonb_array_length(names) as names_count, status
        FROM scrape_results WHERE method = 'pdf' 
      ) pdf ON lfs.scrape_id = pdf.scrape_id
      ORDER BY lfs.started_at DESC
    `;
    
    console.table(overview.map(row => ({
      Firm: row.firm,
      'Latest Scrape': new Date(row.latest_scrape).toLocaleString(),
      Web: `${row.web_names} ${row.web_status}`,
      Perplexity: `${row.perplexity_names} ${row.perplexity_status}`,
      PDF: `${row.pdf_names} ${row.pdf_status}`
    })));

    // 2. If specific firm requested, show detailed analysis
    if (firmName) {
      console.log(`\n🔍 DETAILED ANALYSIS: ${firmName}`);
      console.log('-'.repeat(60));
      
      // Get method summary
      const methodSummary = await sql`
        WITH firm_latest AS (
          SELECT 
            f.id as firm_id,
            f.name as firm_name,
            ss.id as scrape_id
          FROM firms f
          JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
          WHERE f.name = ${firmName}
          ORDER BY ss.started_at DESC
          LIMIT 1
        )
        SELECT 
          sr.method,
          jsonb_array_length(sr.names) as name_count,
          sr.status
        FROM firm_latest fl
        JOIN scrape_results sr ON fl.scrape_id = sr.scrape_id
        ORDER BY sr.method
      `;
      
      console.log('\n📈 Method Performance:');
      console.table(methodSummary.map(row => ({
        Method: row.method.toUpperCase(),
        'Names Found': row.name_count,
        Status: row.status === 'success' ? '✅ Success' : '❌ Error'
      })));
      
      // Get overlap analysis
      const overlapAnalysis = await sql`
        WITH firm_latest AS (
          SELECT 
            f.id as firm_id,
            f.name as firm_name,
            ss.id as scrape_id
          FROM firms f
          JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
          WHERE f.name = ${firmName}
          ORDER BY ss.started_at DESC
          LIMIT 1
        ),
        comparison_data AS (
          SELECT 
            cr.name,
            CASE WHEN web_names.name IS NOT NULL THEN 1 ELSE 0 END as web,
            CASE WHEN perplexity_names.name IS NOT NULL THEN 1 ELSE 0 END as perplexity,
            CASE WHEN pdf_names.name IS NOT NULL THEN 1 ELSE 0 END as pdf
          FROM canonical_roster cr
          CROSS JOIN firm_latest fl
          LEFT JOIN (
            SELECT DISTINCT jsonb_array_elements_text(names) as name
            FROM scrape_results sr
            JOIN firm_latest fl2 ON sr.scrape_id = fl2.scrape_id
            WHERE sr.method = 'web'
          ) web_names ON LOWER(cr.name) = LOWER(web_names.name)
          LEFT JOIN (
            SELECT DISTINCT jsonb_array_elements_text(names) as name  
            FROM scrape_results sr
            JOIN firm_latest fl2 ON sr.scrape_id = fl2.scrape_id
            WHERE sr.method = 'perplexity'
          ) perplexity_names ON LOWER(cr.name) = LOWER(perplexity_names.name)
          LEFT JOIN (
            SELECT DISTINCT jsonb_array_elements_text(names) as name
            FROM scrape_results sr
            JOIN firm_latest fl2 ON sr.scrape_id = fl2.scrape_id
            WHERE sr.method = 'pdf'
          ) pdf_names ON LOWER(cr.name) = LOWER(pdf_names.name)
          WHERE cr.firm_id = fl.firm_id::uuid::text
        )
        SELECT 
          'Web ∩ Perplexity' as overlap_type,
          COUNT(*) as count
        FROM comparison_data WHERE web = 1 AND perplexity = 1
        UNION ALL
        SELECT 
          'Web ∩ PDF' as overlap_type,
          COUNT(*) as count
        FROM comparison_data WHERE web = 1 AND pdf = 1
        UNION ALL
        SELECT
          'Perplexity ∩ PDF' as overlap_type,
          COUNT(*) as count
        FROM comparison_data WHERE perplexity = 1 AND pdf = 1
        UNION ALL
        SELECT
          'All Three Methods' as overlap_type,
          COUNT(*) as count
        FROM comparison_data WHERE web = 1 AND perplexity = 1 AND pdf = 1
      `;
      
      console.log('\n🤝 Overlap Analysis:');
      console.table(overlapAnalysis.map(row => ({
        'Overlap Type': row.overlap_type,
        'Names Found': row.count
      })));
      
      // Show comparison table (first 20 rows)
      const comparisonTable = await sql`
        WITH firm_latest AS (
          SELECT 
            f.id as firm_id,
            f.name as firm_name,
            ss.id as scrape_id
          FROM firms f
          JOIN scrape_sessions ss ON f.id::uuid = ss.firm_id
          WHERE f.name = ${firmName}
          ORDER BY ss.started_at DESC
          LIMIT 1
        )
        SELECT 
          cr.name,
          cr.team,
          CASE WHEN web_names.name IS NOT NULL THEN 'x' ELSE '' END as web,
          CASE WHEN perplexity_names.name IS NOT NULL THEN 'x' ELSE '' END as perplexity,
          CASE WHEN pdf_names.name IS NOT NULL THEN 'x' ELSE '' END as pdf
        FROM canonical_roster cr
        CROSS JOIN firm_latest fl
        LEFT JOIN (
          SELECT DISTINCT jsonb_array_elements_text(names) as name
          FROM scrape_results sr
          JOIN firm_latest fl2 ON sr.scrape_id = fl2.scrape_id
          WHERE sr.method = 'web'
        ) web_names ON LOWER(cr.name) = LOWER(web_names.name)
        LEFT JOIN (
          SELECT DISTINCT jsonb_array_elements_text(names) as name  
          FROM scrape_results sr
          JOIN firm_latest fl2 ON sr.scrape_id = fl2.scrape_id
          WHERE sr.method = 'perplexity'
        ) perplexity_names ON LOWER(cr.name) = LOWER(perplexity_names.name)
        LEFT JOIN (
          SELECT DISTINCT jsonb_array_elements_text(names) as name
          FROM scrape_results sr
          JOIN firm_latest fl2 ON sr.scrape_id = fl2.scrape_id
          WHERE sr.method = 'pdf'
        ) pdf_names ON LOWER(cr.name) = LOWER(pdf_names.name)
        WHERE cr.firm_id = fl.firm_id::uuid
        ORDER BY cr.pdf_order NULLS LAST, cr.name
        LIMIT 20
      `;
      
      console.log('\n🗒️  Comparison Table (PDF-anchored, first 20 rows):');
      console.table(comparisonTable.map(row => ({
        Name: row.name,
        Team: row.team,
        Web: row.web,
        Perplexity: row.perplexity,
        PDF: row.pdf
      })));
      
      if (comparisonTable.length === 20) {
        console.log('   ... (showing first 20 rows only)');
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
  console.log('\n💡 Usage: npx tsx run-dashboard.js "Firm Name" for detailed analysis');
}

runDashboard(firmName).catch(console.error);