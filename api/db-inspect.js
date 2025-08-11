// Database inspection API to see what tables and columns exist
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

    // List all tables
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = {};
    
    // For each table, get its columns
    for (const table of tablesResult.rows) {
      const tableName = table.tablename;
      
      const columnsResult = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      
      tables[tableName] = {
        columns: columnsResult.rows,
        rowCount: parseInt(countResult.rows[0].count)
      };
    }

    res.status(200).json({
      database: 'neondb',
      tables: tables,
      totalTables: tablesResult.rows.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database inspection error:', error);
    res.status(500).json({ 
      message: 'Failed to inspect database',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}