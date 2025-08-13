-- =====================================================
-- METHODOLOGY COMPARISON DASHBOARD
-- =====================================================

-- 1. Get all firms with their latest scrape sessions
WITH latest_sessions AS (
  SELECT DISTINCT 
    f.id as firm_id,
    f.name as firm_name,
    ss.id as scrape_id,
    ss.started_at,
    ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY ss.started_at DESC) as rn
  FROM firms f
  LEFT JOIN scrape_sessions ss ON f.id = ss.firm_id
  WHERE ss.id IS NOT NULL
),
latest_firm_sessions AS (
  SELECT firm_id, firm_name, scrape_id, started_at
  FROM latest_sessions 
  WHERE rn = 1
)

-- 2. Dashboard Overview: All firms with their latest results
SELECT 
  lfs.firm_name as "Firm",
  lfs.started_at as "Latest Scrape",
  COALESCE(web.names_count, 0) as "Web Names",
  COALESCE(perplexity.names_count, 0) as "Perplexity Names", 
  COALESCE(pdf.names_count, 0) as "PDF Names",
  CASE 
    WHEN web.status = 'success' THEN '✅'
    WHEN web.status = 'error' THEN '❌'
    ELSE '⚪'
  END as "Web Status",
  CASE 
    WHEN perplexity.status = 'success' THEN '✅'
    WHEN perplexity.status = 'error' THEN '❌' 
    ELSE '⚪'
  END as "Perplexity Status",
  CASE 
    WHEN pdf.status = 'success' THEN '✅'
    WHEN pdf.status = 'error' THEN '❌'
    ELSE '⚪'
  END as "PDF Status"
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
ORDER BY lfs.started_at DESC;

-- =====================================================
-- 3. DETAILED FIRM ANALYSIS (Replace 'Sequoia Capital' with desired firm)
-- =====================================================

-- Get latest scrape for specific firm
WITH firm_latest AS (
  SELECT 
    f.id as firm_id,
    f.name as firm_name,
    ss.id as scrape_id
  FROM firms f
  JOIN scrape_sessions ss ON f.id = ss.firm_id
  WHERE f.name = 'Sequoia Capital'  -- << CHANGE THIS FIRM NAME
  ORDER BY ss.started_at DESC
  LIMIT 1
),

-- Get all names from latest scrape
method_results AS (
  SELECT 
    fl.firm_name,
    sr.method,
    sr.names,
    sr.status,
    jsonb_array_length(sr.names) as name_count
  FROM firm_latest fl
  JOIN scrape_results sr ON fl.scrape_id = sr.scrape_id
),

-- Create comparison table (PDF-anchored)
comparison_data AS (
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
    FROM method_results WHERE method = 'web'
  ) web_names ON LOWER(cr.name) = LOWER(web_names.name)
  LEFT JOIN (
    SELECT DISTINCT jsonb_array_elements_text(names) as name  
    FROM method_results WHERE method = 'perplexity'
  ) perplexity_names ON LOWER(cr.name) = LOWER(perplexity_names.name)
  LEFT JOIN (
    SELECT DISTINCT jsonb_array_elements_text(names) as name
    FROM method_results WHERE method = 'pdf'
  ) pdf_names ON LOWER(cr.name) = LOWER(pdf_names.name)
  WHERE cr.firm_id = fl.firm_id
  ORDER BY cr.pdf_order NULLS LAST, cr.name
)

-- Display method summary
SELECT 
  '=== METHOD SUMMARY ===' as section,
  method as "Method",
  name_count as "Names Found",
  status as "Status"
FROM method_results
UNION ALL
SELECT 
  '=== OVERLAP ANALYSIS ===' as section,
  'Web ∩ Perplexity' as "Method",
  COUNT(*) as "Names Found",
  'comparison' as "Status"
FROM comparison_data WHERE web = 'x' AND perplexity = 'x'
UNION ALL
SELECT 
  '' as section,
  'Web ∩ PDF' as "Method", 
  COUNT(*) as "Names Found",
  'comparison' as "Status"
FROM comparison_data WHERE web = 'x' AND pdf = 'x'
UNION ALL
SELECT
  '' as section,
  'Perplexity ∩ PDF' as "Method",
  COUNT(*) as "Names Found", 
  'comparison' as "Status"
FROM comparison_data WHERE perplexity = 'x' AND pdf = 'x'
UNION ALL
SELECT
  '' as section,
  'All Three Methods' as "Method",
  COUNT(*) as "Names Found",
  'comparison' as "Status" 
FROM comparison_data WHERE web = 'x' AND perplexity = 'x' AND pdf = 'x';

-- =====================================================
-- 4. DETAILED COMPARISON TABLE (PDF-anchored)
-- =====================================================

SELECT 
  name as "Name",
  team as "Team", 
  web as "Web",
  perplexity as "Perplexity",
  pdf as "PDF"
FROM comparison_data;

-- =====================================================
-- 5. METHOD-ONLY NAMES (not in PDF)
-- =====================================================

-- Web-only names
SELECT 
  '=== WEB-ONLY NAMES ===' as section,
  web_only.name as "Name"
FROM (
  SELECT DISTINCT jsonb_array_elements_text(names) as name
  FROM method_results WHERE method = 'web'
) web_only
LEFT JOIN canonical_roster cr ON LOWER(web_only.name) = LOWER(cr.name)
WHERE cr.name IS NULL
UNION ALL

-- Perplexity-only names  
SELECT
  '=== PERPLEXITY-ONLY NAMES ===' as section,
  perplexity_only.name as "Name"
FROM (
  SELECT DISTINCT jsonb_array_elements_text(names) as name
  FROM method_results WHERE method = 'perplexity'  
) perplexity_only
LEFT JOIN canonical_roster cr ON LOWER(perplexity_only.name) = LOWER(cr.name)
WHERE cr.name IS NULL;

-- =====================================================
-- 6. QUICK FIRM SWITCHER QUERIES
-- =====================================================

-- To analyze different firms, use these queries:

-- List all available firms:
-- SELECT name FROM firms ORDER BY name;

-- Switch to Andreessen Horowitz:
-- Replace 'Sequoia Capital' with 'Andreessen Horowitz' in section 3

-- Get scrape session IDs for manual queries:
-- SELECT f.name, ss.id as scrape_id, ss.started_at 
-- FROM firms f 
-- JOIN scrape_sessions ss ON f.id = ss.firm_id 
-- ORDER BY f.name, ss.started_at DESC;