// Self-contained database test
export default async function handler(req, res) {
  try {
    // Import database dependencies directly
    const { Pool } = await import('@neondatabase/serverless');
    
    // Check environment variable
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        error: 'DATABASE_URL not found',
        message: 'Database connection string not configured in Vercel environment variables'
      });
    }

    // Test connection
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const result = await pool.query('SELECT 1 as test');
    await pool.end();
    
    res.status(200).json({
      message: 'Database connection successful!',
      test: result.rows,
      timestamp: new Date().toISOString()
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