// Vercel forwarder for name scraping to DigitalOcean server
export default async function handler(req, res) {
  try {
    const { url, selector } = req.query;
    const serverUrl = process.env.DO_SERVER_URL || 'http://138.197.117.133';
    
    console.log(`Forwarding scrape-names request to DO server: ${serverUrl}`);
    
    // Build query parameters
    const params = new URLSearchParams();
    if (url) params.append('url', url);
    if (selector) params.append('selector', selector);
    
    const response = await fetch(`${serverUrl}/api/scrape-names?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Vercel-Forwarder/1.0'
      },
      timeout: 120000 // 2 minute timeout for scraping
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