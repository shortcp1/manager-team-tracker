// Test simplified scraping functionality
export default async function handler(req, res) {
  try {
    const testUrl = req.query.url || 'https://www.sequoiacap.com/our-team/';
    
    console.log(`Testing scraper with URL: ${testUrl}`);
    
    // First try HTTP scraping (fast)
    const response = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Simple parsing - look for name patterns
    const members = [];
    const nameMatches = html.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi) || [];
    
    for (const match of nameMatches.slice(0, 10)) { // Limit to 10 for testing
      const nameText = match.replace(/<[^>]*>/g, '').trim();
      if (nameText && nameText.length > 2 && nameText.length < 50) {
        // Basic filtering - likely person names
        if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(nameText)) {
          members.push({
            name: nameText,
            source: 'http_scrape'
          });
        }
      }
    }
    
    res.status(200).json({
      message: 'Scraper test successful',
      url: testUrl,
      htmlSize: html.length,
      membersFound: members.length,
      members: members,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Scraper test failed:', error);
    res.status(500).json({
      error: 'Scraper test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}