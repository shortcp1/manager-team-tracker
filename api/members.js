// Members API endpoint for team members data
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

    // Get all firms and their active members  
    const firmsResult = await pool.query('SELECT * FROM firms ORDER BY name');
    const firms = firmsResult.rows;
    
    const allMembers = [];
    
    for (const firm of firms) {
      const membersResult = await pool.query(
        'SELECT * FROM team_members WHERE firm_id = $1 AND is_active = true ORDER BY name',
        [firm.id]
      );
      
      const membersWithFirm = membersResult.rows.map(member => ({
        ...member,
        firmName: firm.name,
        firmType: firm.type,
      }));
      
      allMembers.push(...membersWithFirm);
    }

    res.status(200).json(allMembers);
    
  } catch (error) {
    console.error('Members API error:', error);
    res.status(500).json({ message: 'Failed to fetch members' });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}