// Stats API endpoint for dashboard
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

    // Get basic stats
    const firmsResult = await pool.query('SELECT COUNT(*) as count FROM firms WHERE status = $1', ['active']);
    const membersResult = await pool.query('SELECT COUNT(*) as count FROM team_members WHERE is_active = true');
    
    // Get recent activity
    const recentChangesResult = await pool.query(
      'SELECT COUNT(*) as count FROM change_history WHERE detected_at > NOW() - INTERVAL \'7 days\''
    );
    
    const stats = {
      totalFirms: parseInt(firmsResult.rows[0].count),
      totalMembers: parseInt(membersResult.rows[0].count),
      recentChanges: parseInt(recentChangesResult.rows[0].count),
      lastUpdated: new Date().toISOString()
    };

    res.status(200).json(stats);
    
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}