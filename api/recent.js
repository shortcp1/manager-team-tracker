// Recent changes API endpoint - handles /api/changes/recent route
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

    const days = parseInt(req.query.days) || 7;
    const limit = parseInt(req.query.limit) || 50;

    const query = `
      SELECT ch.*, f.name as firm_name, f.type as firm_type 
      FROM change_history ch 
      LEFT JOIN firms f ON ch.firm_id = f.id 
      WHERE ch.created_at > NOW() - INTERVAL '${days} days'
      ORDER BY ch.created_at DESC 
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    
    // Format the response to match expected structure
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
    console.error('Recent changes API error:', error);
    res.status(500).json({ message: 'Failed to fetch recent changes' });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}