// Data enrichment API - populates additional member fields
export default async function handler(req, res) {
  try {
    const { members } = req.body;
    
    if (!members || !Array.isArray(members)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Request body must contain a "members" array',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Enriching data for ${members.length} members`);

    const enrichedMembers = await Promise.all(
      members.map(async (member, index) => {
        try {
          return await enrichMemberData(member, index);
        } catch (error) {
          console.warn(`Failed to enrich member ${member.name}:`, error.message);
          return { ...member, enrichmentError: error.message };
        }
      })
    );

    const successfullyEnriched = enrichedMembers.filter(m => !m.enrichmentError).length;
    
    res.status(200).json({
      message: 'Data enrichment completed',
      membersProcessed: members.length,
      successfullyEnriched: successfullyEnriched,
      enrichedMembers: enrichedMembers,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Data enrichment failed:', error);
    res.status(500).json({
      error: 'Data enrichment failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

async function enrichMemberData(member, index) {
  const enriched = { ...member };
  
  // Normalize name and title
  enriched.normalizedName = normalizeName(member.name);
  enriched.normalizedTitle = member.title ? normalizeTitle(member.title) : undefined;
  
  // Generate entity key for deduplication
  enriched.entityKey = computeEntityKey({
    name: member.name,
    linkedinUrl: member.linkedinUrl,
    email: member.email
  });

  // Determine seniority level from title
  enriched.seniorityLevel = determineSeniorityLevel(member.title);
  
  // Categorize department from title
  enriched.department = determineDepartment(member.title);

  // Try to extract LinkedIn URL if we have a profile URL
  if (member.profileUrl) {
    enriched.linkedinUrl = await extractLinkedInUrl(member.profileUrl);
  }

  // Try to infer email patterns
  enriched.email = inferEmail(member.name, member.profileUrl);

  // Try to extract social media profiles
  if (member.profileUrl) {
    const socialProfiles = await extractSocialProfiles(member.profileUrl);
    enriched.twitterUrl = socialProfiles.twitterUrl;
    enriched.githubUrl = socialProfiles.githubUrl;
    enriched.personalWebsite = socialProfiles.personalWebsite;
  }

  // Extract location/country information
  enriched.location = await extractLocation(member.title, member.profileUrl);
  enriched.officeCountry = inferCountryFromProfile(member.profileUrl);

  // Generate profile photo hash for change detection
  if (member.imageUrl) {
    enriched.profilePhotoHash = generateSimpleHash(member.imageUrl);
  }

  // Set category based on title/role analysis
  enriched.category = categorizeRole(member.title);

  return enriched;
}

function normalizeName(name) {
  if (!name) return '';
  
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-'\.]/g, '')
    .toLowerCase();
}

function normalizeTitle(title) {
  if (!title) return '';
  
  return title
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[^\w\s\-&]/g, '');
}

function computeEntityKey({ name, linkedinUrl, email }) {
  const normalizedName = normalizeName(name);
  
  if (linkedinUrl) {
    const linkedinId = linkedinUrl.match(/\/in\/([^\/]+)/)?.[1];
    if (linkedinId) return `linkedin:${linkedinId}`;
  }
  
  if (email) {
    return `email:${email.toLowerCase()}`;
  }
  
  // Fallback to normalized name
  return `name:${normalizedName.replace(/\s/g, '_')}`;
}

function determineSeniorityLevel(title) {
  if (!title) return 'unknown';
  
  const titleLower = title.toLowerCase();
  
  if (/\b(ceo|cto|cfo|coo|chief|founder|co-founder|president|vp|vice president|director|head of|lead|senior|sr|principal|staff)\b/.test(titleLower)) {
    return 'senior';
  }
  
  if (/\b(manager|associate|analyst|coordinator|specialist)\b/.test(titleLower)) {
    return 'mid';
  }
  
  if (/\b(intern|junior|jr|trainee|entry)\b/.test(titleLower)) {
    return 'junior';
  }
  
  return 'unknown';
}

function determineDepartment(title) {
  if (!title) return 'unknown';
  
  const titleLower = title.toLowerCase();
  
  if (/\b(partner|managing|general partner|venture|investment|portfolio)\b/.test(titleLower)) {
    return 'investment';
  }
  
  if (/\b(operations|ops|operating|platform)\b/.test(titleLower)) {
    return 'operations';
  }
  
  if (/\b(marketing|brand|communications|pr|public relations)\b/.test(titleLower)) {
    return 'marketing';
  }
  
  if (/\b(finance|financial|accounting|controller)\b/.test(titleLower)) {
    return 'finance';
  }
  
  if (/\b(legal|counsel|attorney|compliance)\b/.test(titleLower)) {
    return 'legal';
  }
  
  if (/\b(hr|human resources|people|talent|recruiting)\b/.test(titleLower)) {
    return 'people';
  }
  
  if (/\b(tech|technology|engineering|developer|data|analyst)\b/.test(titleLower)) {
    return 'technology';
  }
  
  return 'other';
}

async function extractLinkedInUrl(profileUrl) {
  if (!profileUrl) return undefined;
  
  try {
    // Try to fetch the profile page and look for LinkedIn links
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000
    });
    
    if (!response.ok) return undefined;
    
    const html = await response.text();
    const linkedinMatch = html.match(/https:\/\/(www\.)?linkedin\.com\/in\/[^"'\s<>]+/i);
    
    return linkedinMatch ? linkedinMatch[0] : undefined;
    
  } catch (error) {
    console.log(`Failed to extract LinkedIn for ${profileUrl}:`, error.message);
    return undefined;
  }
}

function inferEmail(name, profileUrl) {
  if (!name) return undefined;
  
  // Try to extract domain from profile URL
  let domain = '';
  if (profileUrl) {
    try {
      const url = new URL(profileUrl);
      domain = url.hostname.replace(/^www\./, '');
    } catch (e) {
      // Invalid URL
    }
  }
  
  if (!domain) return undefined;
  
  // Generate common email patterns
  const firstName = name.split(' ')[0]?.toLowerCase();
  const lastName = name.split(' ').slice(1).join(' ')?.toLowerCase().replace(/\s/g, '');
  
  if (!firstName || !lastName) return undefined;
  
  // Return most likely pattern - first.last@domain
  return `${firstName}.${lastName}@${domain}`;
}

async function extractSocialProfiles(profileUrl) {
  const result = {
    twitterUrl: undefined,
    githubUrl: undefined,
    personalWebsite: undefined
  };
  
  if (!profileUrl) return result;
  
  try {
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000
    });
    
    if (!response.ok) return result;
    
    const html = await response.text();
    
    // Extract Twitter URL
    const twitterMatch = html.match(/https:\/\/(www\.)?(twitter\.com|x\.com)\/[^"'\s<>]+/i);
    if (twitterMatch) {
      result.twitterUrl = twitterMatch[0];
    }
    
    // Extract GitHub URL  
    const githubMatch = html.match(/https:\/\/(www\.)?github\.com\/[^"'\s<>]+/i);
    if (githubMatch) {
      result.githubUrl = githubMatch[0];
    }
    
    // Look for personal website links (non-social, non-work)
    const websiteMatches = html.match(/https?:\/\/[^"'\s<>]+\.(com|net|org|io|me|dev)[^"'\s<>]*/gi) || [];
    for (const url of websiteMatches) {
      if (!url.includes('linkedin.com') && 
          !url.includes('twitter.com') &&
          !url.includes('x.com') &&
          !url.includes('github.com') &&
          !url.includes('facebook.com') &&
          !profileUrl.includes(new URL(url).hostname)) {
        result.personalWebsite = url;
        break; // Take first match
      }
    }
    
  } catch (error) {
    console.log(`Failed to extract social profiles for ${profileUrl}:`, error.message);
  }
  
  return result;
}

async function extractLocation(title, profileUrl) {
  // Simple location extraction from title
  if (title) {
    const locations = [
      'San Francisco', 'SF', 'NYC', 'New York', 'Boston', 'Austin', 
      'Seattle', 'Los Angeles', 'LA', 'Chicago', 'London', 'Singapore',
      'Hong Kong', 'Beijing', 'Shanghai', 'Tokyo', 'Sydney', 'Toronto',
      'Berlin', 'Paris', 'Amsterdam', 'Tel Aviv', 'Bangalore', 'Mumbai'
    ];
    
    for (const location of locations) {
      if (title.toLowerCase().includes(location.toLowerCase())) {
        return location;
      }
    }
  }
  
  return undefined;
}

function inferCountryFromProfile(profileUrl) {
  if (!profileUrl) return undefined;
  
  try {
    const url = new URL(profileUrl);
    const hostname = url.hostname.toLowerCase();
    
    // Country code patterns in domains
    if (hostname.endsWith('.uk') || hostname.includes('london')) return 'UK';
    if (hostname.endsWith('.sg') || hostname.includes('singapore')) return 'Singapore';
    if (hostname.endsWith('.hk') || hostname.includes('hongkong')) return 'Hong Kong';
    if (hostname.endsWith('.jp') || hostname.includes('tokyo')) return 'Japan';
    if (hostname.endsWith('.au') || hostname.includes('australia')) return 'Australia';
    if (hostname.endsWith('.ca') || hostname.includes('canada')) return 'Canada';
    if (hostname.endsWith('.de') || hostname.includes('germany')) return 'Germany';
    if (hostname.endsWith('.fr') || hostname.includes('france')) return 'France';
    if (hostname.endsWith('.in') || hostname.includes('india')) return 'India';
    if (hostname.endsWith('.cn') || hostname.includes('china')) return 'China';
    
    // Default to US for most .com domains
    return 'US';
    
  } catch (e) {
    return 'US'; // Default
  }
}

function generateSimpleHash(text) {
  if (!text) return '';
  
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

function categorizeRole(title) {
  if (!title) return 'other';
  
  const titleLower = title.toLowerCase();
  
  if (/\b(partner|managing|general partner)\b/.test(titleLower)) {
    return 'partner';
  }
  
  if (/\b(principal|director|vice president|vp)\b/.test(titleLower)) {
    return 'senior_professional';
  }
  
  if (/\b(associate|analyst|manager)\b/.test(titleLower)) {
    return 'professional';
  }
  
  if (/\b(operating|operations|platform|advisor|venture partner)\b/.test(titleLower)) {
    return 'operating_professional';
  }
  
  if (/\b(founder|entrepreneur|ceo|executive)\b/.test(titleLower)) {
    return 'executive';
  }
  
  return 'other';
}