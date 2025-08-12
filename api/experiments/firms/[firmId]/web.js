// Vercel forwarder for experimental web scraping to DigitalOcean server
export default async function handler(req, res) {
  try {
    const { firmId } = req.query;
    const serverUrl = process.env.DO_SERVER_URL || 'http://138.197.117.133';
    
    if (!firmId) {
      return res.status(400).json({
        error: 'Missing firmId',
        message: 'firmId path parameter is required'
      });
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }
    
    console.log(`Forwarding experimental web scrape request for firm ${firmId} to DO server: ${serverUrl}`);
    
    const response = await fetch(`${serverUrl}/api/experiments/firms/${firmId}/web`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Forwarder/1.0'
      },
      timeout: 120000 // 2 minute timeout for scraping
    });

    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Experimental web scrape forwarder error:', error);
    res.status(500).json({
      error: 'Forwarder failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}