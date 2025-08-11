// Firms API endpoint 
import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
  let pool = null;
  
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    if (req.method === 'GET') {
      // Get all firms with team member counts
      const firmsResult = await pool.query('SELECT * FROM firms ORDER BY name');
      const firms = firmsResult.rows;
      
      // Add team member counts
      const firmsWithCounts = await Promise.all(
        firms.map(async (firm) => {
          const membersResult = await pool.query(
            'SELECT COUNT(*) as count FROM team_members WHERE firm_id = $1 AND is_active = true',
            [firm.id]
          );
          return {
            ...firm,
            teamSize: parseInt(membersResult.rows[0].count)
          };
        })
      );
      
      res.status(200).json(firmsWithCounts);
      
    } else if (req.method === 'POST') {
      // Create new firm
      const { name, type, teamPageUrl, description } = req.body;
      
      const result = await pool.query(
        'INSERT INTO firms (name, type, team_page_url, description, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
        [name, type, teamPageUrl, description || null, 'active']
      );
      
      res.status(201).json(result.rows[0]);
      
    } else {
      res.status(405).json({ message: 'Method not allowed' });
    }
    
  } catch (error) {
    console.error('Firms API error:', error);
    res.status(500).json({ message: 'Failed to fetch firms' });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}