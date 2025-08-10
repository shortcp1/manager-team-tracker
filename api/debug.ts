import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Check environment variables
    const envVars = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV,
      hasDatabase: !!process.env.DATABASE_URL ? 'Yes' : 'No',
    };

    // Try to import db module
    let dbConnectionTest = 'Unknown';
    try {
      const { db } = await import('../server/db');
      dbConnectionTest = 'DB module imported successfully';
      
      // Try a simple query
      try {
        await db.execute('SELECT 1');
        dbConnectionTest = 'Database connection working!';
      } catch (queryError) {
        dbConnectionTest = `Database query failed: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`;
      }
    } catch (importError) {
      dbConnectionTest = `DB import failed: ${importError instanceof Error ? importError.message : 'Unknown error'}`;
    }

    res.status(200).json({
      message: 'Debug info',
      environment: envVars,
      database: dbConnectionTest,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Debug endpoint failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}