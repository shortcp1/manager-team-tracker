// Vercel forwarder for enhanced firm scraping to DigitalOcean server  
export default async function handler(req, res) {
  try {
    const { firmId } = req.query;
    const serverUrl = process.env.DO_SERVER_URL || 'http://138.197.117.133';
    
    if (!firmId) {
      return res.status(400).json({
        error: 'Missing firmId',
        message: 'firmId query parameter is required'
      });
    }
    
    console.log(`Forwarding scrape-firm request for firm ${firmId} to DO server: ${serverUrl}`);
    
    const response = await fetch(`${serverUrl}/api/scrape-firm-enhanced?firmId=${firmId}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Forwarder/1.0'
      },
      timeout: 300000 // 5 minute timeout for full workflow
    });

    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Forwarder error:', error);
    res.status(500).json({
      error: 'Forwarder failed', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}