// Vercel forwarder for experimental PDF parsing to DigitalOcean server
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
    
    console.log(`Forwarding experimental PDF parsing request for firm ${firmId} to DO server: ${serverUrl}`);
    
    // Forward the entire request including multipart form data for file upload
    const formData = new FormData();
    
    // Handle file upload forwarding
    if (req.body && req.files) {
      for (const [key, value] of Object.entries(req.files)) {
        formData.append(key, value);
      }
    }
    
    const response = await fetch(`${serverUrl}/api/experiments/firms/${firmId}/pdf`, {
      method: 'POST',
      body: formData,
      headers: {
        'User-Agent': 'Vercel-Forwarder/1.0',
        // Don't set Content-Type, let FormData set it with boundary
      },
      timeout: 120000 // 2 minute timeout for PDF processing
    });

    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Experimental PDF parsing forwarder error:', error);
    res.status(500).json({
      error: 'Forwarder failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}