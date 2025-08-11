// Combined workflow API - Full enhanced scraping process
import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const { firmId } = req.query;
  
  if (!firmId) {
    return res.status(400).json({
      error: 'Missing firmId',
      message: 'firmId query parameter is required',
      timestamp: new Date().toISOString()
    });
  }

  let pool = null;
  
  try {
    console.log(`Starting enhanced scraping workflow for firm ${firmId}`);
    
    // Initialize database connection
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Step 1: Get firm details from database
    const firmQuery = await pool.query('SELECT * FROM firms WHERE id = $1', [firmId]);
    
    if (firmQuery.rows.length === 0) {
      return res.status(404).json({
        error: 'Firm not found',
        message: `Firm with ID ${firmId} does not exist`,
        timestamp: new Date().toISOString()
      });
    }

    const firm = firmQuery.rows[0];
    console.log(`Processing firm: ${firm.name} - ${firm.team_page_url}`);

    const startTime = Date.now();

    // Step 2: Scrape names using enhanced scraper
    console.log('Step 1: Scraping names...');
    const nameScrapingResult = await scrapeNames(firm.team_page_url);
    
    if (!nameScrapingResult.success) {
      throw new Error(`Name scraping failed: ${nameScrapingResult.error}`);
    }

    const basicMembers = nameScrapingResult.members;
    console.log(`Name scraping completed: found ${basicMembers.length} members`);

    // Step 3: Enrich member data
    console.log('Step 2: Enriching member data...');
    const enrichmentResult = await enrichMemberData(basicMembers);
    
    if (!enrichmentResult.success) {
      console.warn(`Data enrichment partially failed: ${enrichmentResult.error}`);
    }

    const enrichedMembers = enrichmentResult.members;
    console.log(`Data enrichment completed: ${enrichmentResult.successfullyEnriched}/${basicMembers.length} members enriched`);

    // Step 4: Save to database with change detection
    console.log('Step 3: Saving to database...');
    const saveResult = await saveEnhancedMembers(pool, firmId, enrichedMembers);
    
    // Step 5: Record scrape history
    await recordScrapeHistory(pool, firmId, {
      status: 'success',
      membersFound: enrichedMembers.length,
      changesDetected: saveResult.changesDetected,
      duration: Date.now() - startTime,
      nameScrapingMethod: nameScrapingResult.method,
      enrichmentSuccess: enrichmentResult.successfullyEnriched
    });

    // Step 6: Update firm's last scraped timestamp
    await pool.query(
      'UPDATE firms SET last_scraped = NOW(), status = $1 WHERE id = $2',
      ['active', firmId]
    );

    res.status(200).json({
      message: 'Enhanced scraping workflow completed successfully',
      firm: {
        id: firm.id,
        name: firm.name,
        teamPageUrl: firm.team_page_url
      },
      results: {
        totalMembers: enrichedMembers.length,
        newMembers: saveResult.newMembers,
        updatedMembers: saveResult.updatedMembers,
        changesDetected: saveResult.changesDetected,
        nameScrapingMethod: nameScrapingResult.method,
        enrichmentSuccess: enrichmentResult.successfullyEnriched,
        duration: Date.now() - startTime
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Enhanced scraping workflow failed:', error);
    
    // Record failed scrape if we have database access
    if (pool && firmId) {
      try {
        await recordScrapeHistory(pool, firmId, {
          status: 'error',
          membersFound: 0,
          changesDetected: 0,
          duration: Date.now() - (Date.now() - 30000), // Estimate
          errorMessage: error.message
        });
        
        await pool.query(
          'UPDATE firms SET status = $1 WHERE id = $2',
          ['error', firmId]
        );
      } catch (dbError) {
        console.error('Failed to record error in database:', dbError);
      }
    }

    res.status(500).json({
      error: 'Enhanced scraping workflow failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      firmId: firmId,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

async function scrapeNames(teamPageUrl) {
  try {
    // Use internal HTTP call to our server's scraper route
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    const response = await fetch(`${serverUrl}/api/scrape-names?url=${encodeURIComponent(teamPageUrl)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Internal-Enhanced-Scraper/1.0'
      },
      timeout: 120000 // 2 minute timeout
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        members: data.names || data.members || [],
        method: 'playwright-server',
        metadata: {
          stagesActivated: data.stagesActivated || 0,
          pagesProcessed: data.pagesProcessed || 0
        }
      };
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return {
        success: false,
        error: errorData.error || 'Server scraping failed',
        members: []
      };
    }

  } catch (error) {
    console.error('Server scraping error:', error);
    return {
      success: false,
      error: error.message,
      members: []
    };
  }
}

async function enrichMemberData(members) {
  try {
    // Import the enrichment API dynamically
    const enrichmentModule = await import('./enrich-data.js');
    const enrichmentHandler = enrichmentModule.default;

    // Create mock request/response objects
    const mockReq = {
      body: { members }
    };

    let result = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          result = { statusCode: code, data };
          return mockRes;
        }
      })
    };

    // Call the enrichment API
    await enrichmentHandler(mockReq, mockRes);

    if (result.statusCode === 200) {
      return {
        success: true,
        members: result.data.enrichedMembers,
        successfullyEnriched: result.data.successfullyEnriched
      };
    } else {
      return {
        success: false,
        error: result.data.message || 'Data enrichment failed',
        members: members, // Return original members if enrichment fails
        successfullyEnriched: 0
      };
    }

  } catch (error) {
    console.error('Data enrichment error:', error);
    return {
      success: false,
      error: error.message,
      members: members, // Return original members if enrichment fails
      successfullyEnriched: 0
    };
  }
}

async function saveEnhancedMembers(pool, firmId, enrichedMembers) {
  let newMembers = 0;
  let updatedMembers = 0;
  let changesDetected = 0;

  try {
    // Get existing team members for comparison
    const existingQuery = await pool.query(
      'SELECT * FROM team_members WHERE firm_id = $1 AND is_active = true',
      [firmId]
    );
    
    const existingMembers = existingQuery.rows;
    const existingByName = new Map();
    
    existingMembers.forEach(member => {
      const normalizedName = member.name.toLowerCase().replace(/\s+/g, ' ').trim();
      existingByName.set(normalizedName, member);
    });

    // Process each enriched member
    for (const member of enrichedMembers) {
      const normalizedName = member.name.toLowerCase().replace(/\s+/g, ' ').trim();
      const existingMember = existingByName.get(normalizedName);

      if (existingMember) {
        // Update existing member
        const updates = [];
        const values = [];
        let paramCount = 1;

        // Check for changes and build update query
        const fieldsToCheck = [
          'title', 'imageUrl', 'profileUrl', 'linkedinUrl', 'email', 'phone',
          'location', 'officeCountry', 'department', 'seniorityLevel',
          'normalizedTitle', 'twitterUrl', 'githubUrl', 'personalWebsite',
          'category', 'profilePhotoHash'
        ];

        for (const field of fieldsToCheck) {
          const dbField = camelToSnake(field);
          const newValue = member[field];
          const oldValue = existingMember[dbField];
          
          if (newValue !== undefined && newValue !== oldValue) {
            updates.push(`${dbField} = $${paramCount++}`);
            values.push(newValue);
            changesDetected++;
          }
        }

        if (updates.length > 0) {
          updates.push(`last_seen = NOW()`);
          updates.push(`updated_at = NOW()`);
          values.push(existingMember.id);

          const updateQuery = `
            UPDATE team_members 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
          `;

          await pool.query(updateQuery, values);
          updatedMembers++;
          console.log(`Updated member: ${member.name} (${updates.length - 2} changes)`);
        } else {
          // Just update last_seen
          await pool.query(
            'UPDATE team_members SET last_seen = NOW() WHERE id = $1',
            [existingMember.id]
          );
        }

        // Remove from existing members map (for deactivation later)
        existingByName.delete(normalizedName);

      } else {
        // Insert new member
        const insertQuery = `
          INSERT INTO team_members (
            firm_id, name, title, image_url, profile_url, linkedin_url, email, phone,
            location, office_country, department, seniority_level, normalized_name,
            normalized_title, entity_key, twitter_url, github_url, personal_website,
            order_index, category, profile_photo_hash, is_active
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, true
          )
        `;

        await pool.query(insertQuery, [
          firmId,
          member.name,
          member.title,
          member.imageUrl,
          member.profileUrl,
          member.linkedinUrl,
          member.email,
          member.phone,
          member.location,
          member.officeCountry,
          member.department,
          member.seniorityLevel,
          member.normalizedName,
          member.normalizedTitle,
          member.entityKey,
          member.twitterUrl,
          member.githubUrl,
          member.personalWebsite,
          member.orderIndex,
          member.category,
          member.profilePhotoHash
        ]);

        newMembers++;
        changesDetected++;
        console.log(`Added new member: ${member.name}`);
      }
    }

    // Deactivate members who are no longer found
    for (const [name, member] of existingByName) {
      await pool.query(
        'UPDATE team_members SET is_active = false, updated_at = NOW() WHERE id = $1',
        [member.id]
      );
      changesDetected++;
      console.log(`Deactivated member: ${member.name}`);
    }

    return {
      newMembers,
      updatedMembers,
      changesDetected
    };

  } catch (error) {
    console.error('Error saving enhanced members:', error);
    throw error;
  }
}

async function recordScrapeHistory(pool, firmId, data) {
  try {
    await pool.query(`
      INSERT INTO scrape_history (
        firm_id, status, members_found, changes_detected, duration, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      firmId,
      data.status,
      data.membersFound,
      data.changesDetected,
      data.duration,
      data.errorMessage || null
    ]);
  } catch (error) {
    console.error('Failed to record scrape history:', error);
  }
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}