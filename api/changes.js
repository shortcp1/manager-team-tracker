// Changes API endpoint for recent changes
import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let pool = null;
  
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Check if this is the recent changes endpoint
    const isRecent = req.url?.includes('/recent');
    const days = parseInt(req.query.days) || 7;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let query, params;
    
    if (isRecent) {
      // Recent changes within specified days
      query = `
        SELECT ch.*, f.name as firm_name, f.type as firm_type 
        FROM change_history ch 
        LEFT JOIN firms f ON ch.firm_id = f.id 
        WHERE ch.created_at > NOW() - INTERVAL '${days} days'
        ORDER BY ch.created_at DESC 
        LIMIT $1
      `;
      params = [limit];
    } else {
      // All changes with pagination
      query = `
        SELECT ch.*, f.name as firm_name, f.type as firm_type 
        FROM change_history ch 
        LEFT JOIN firms f ON ch.firm_id = f.id 
        ORDER BY ch.created_at DESC 
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const result = await pool.query(query, params);
    
    // Format the response
    const changes = result.rows.map(row => ({
      id: row.id,
      firmId: row.firm_id,
      firmName: row.firm_name || 'Unknown',
      firmType: row.firm_type || 'Unknown',
      changeType: row.change_type,
      memberName: row.member_name,
      details: row.details,
      createdAt: row.created_at,
      timestamp: row.created_at
    }));

    res.status(200).json(changes);
    
  } catch (error) {
    console.error('Changes API error:', error);
    res.status(500).json({ message: 'Failed to fetch recent changes' });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}