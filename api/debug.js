// Debug API endpoint for troubleshooting
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      vercel: !!process.env.VERCEL,
      databaseConfigured: !!process.env.DATABASE_URL,
      serverUrl: process.env.DO_SERVER_URL || 'not set',
      functionCount: 'approximately 10-11 serverless functions',
      status: 'API endpoints operational',
      availableEndpoints: [
        '/api/ping',
        '/api/stats', 
        '/api/firms',
        '/api/members',
        '/api/changes',
        '/api/changes/recent',
        '/api/scrape-names',
        '/api/scrape-firm-enhanced',
        '/api/debug',
        '/api/basic',
        '/api/enrich-data'
      ]
    };

    res.status(200).json(debugInfo);
    
  } catch (error) {
    console.error('Debug API error:', error);
    res.status(500).json({ 
      message: 'Debug endpoint failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}