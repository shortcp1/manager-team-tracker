import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Test basic database connection without complex imports
    const { db } = await import('../server/db');
    
    // Try a simple query
    const result = await db.execute('SELECT 1 as test');
    
    res.status(200).json({
      message: 'Database connection successful!',
      test: result,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown'
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({
      error: 'Database connection failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      timestamp: new Date().toISOString()
    });
  }
}