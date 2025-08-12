# Local Methodology Comparison System

## 🚀 Overview

This branch represents a major architectural shift from cloud-based to local development for testing and comparing different team member scraping methodologies. All processing, data storage, and analysis now happens locally to eliminate cloud complexity and costs during experimentation.

## 📋 What Changed

### Architecture Changes
- **Database**: Neon (cloud) → PostgreSQL (local via Homebrew)
- **Processing**: DigitalOcean server → Local Mac development
- **Frontend**: Removed Vite complexity, server-only mode
- **Deployment**: No cloud deployment needed

### New Features Added
- **Three Methodology Comparison System**:
  1. Web Scraping (Playwright with dynamic content handling)
  2. Perplexity API (AI-powered extraction)
  3. PDF Parsing (Document analysis)
- **Comprehensive Analysis Tools**
- **Local Database Setup Scripts**
- **Standalone Testing Framework**

### Files Created
```
compare-all-methods.js          # Main comparison script
test-scraping-local.js         # Individual method testing
test-pdf-local.js             # PDF-only testing
debug-sequoia-page.js         # Web scraping debugging
setup-local-data.js           # Database initialization
run-server-only.js            # Server launcher (bypasses Vite)
LOCAL_METHODOLOGY_COMPARISON.md # This documentation
test/data/05-versions-space.pdf # pdf-parse dependency fix
```

### Files Modified
```
.env                          # Changed DATABASE_URL to local
package.json                  # Added postgres dependency, new scripts
scripts/compare-methodologies.ts # Fixed ES module compatibility
server/services/perplexity.ts   # Updated model name to 'sonar'
```

## 🛠 Local Setup Instructions

### Prerequisites
```bash
# Install PostgreSQL 15 via Homebrew
brew install postgresql@15

# Add to PATH (add to ~/.zshrc for permanent)
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
```

### Database Setup
```bash
# Start PostgreSQL service
brew services start postgresql@15

# Create database
createdb manager_team_tracker

# Push schema to local database
npm run db:push

# Initialize with test data (Sequoia + A16z)
npx tsx setup-local-data.js
```

### Environment Configuration
The `.env` file has been updated for local development:
```bash
# Local database (was: Neon cloud URL)
DATABASE_URL=postgresql://localhost:5432/manager_team_tracker

# API keys remain the same
PERPLEXITY_API_KEY=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
# ... other settings
```

### Dependencies
```bash
# Install new dependencies
npm install postgres  # For local database scripts

# Install existing dependencies  
npm install
```

## 🚀 How to Run

### Option 1: Comprehensive Comparison (Recommended)
```bash
# Tests all three methodologies and provides detailed analysis
node compare-all-methods.js
```
**Output**: Detailed comparison with overlap analysis, confidence scores, and recommendations.

### Option 2: Individual Method Testing
```bash
# Test all methods individually
node test-scraping-local.js

# Test only PDF parsing (requires PDF file)
node test-pdf-local.js
```

### Option 3: Server Mode (if needed)
```bash
# Start local server without Vite complexity
npm run server-only

# Or use the original dev command
npx tsx --env-file=.env server/index.ts
```

### Option 4: Database Scripts
```bash
# View database contents
npm run db:view

# Run original methodology comparison (requires server)
npm run compare:methods e89f47b7-1c40-44ab-a6e8-cb6640c4e1b2
```

## 📊 Testing Results (Sequoia Capital)

| Method | Names Found | Quality | Notes |
|--------|-------------|---------|-------|
| Web Scraping | 19 names | ✅ High | Most reliable, handles dynamic content |
| Perplexity API | 19 names | ⚠️ Different | Finds different people (advisors, emeritus?) |
| PDF Parsing | 63 names | ⚠️ Noisy | Comprehensive but includes false positives |

**Key Insight**: Zero three-way overlap suggests each method captures different aspects of the team structure.

## 🔧 Troubleshooting

### pdf-parse Dependency Issue
If you see `ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'`:
```bash
mkdir -p test/data
echo "dummy" > test/data/05-versions-space.pdf
```

### Database Connection Issues
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Restart if needed
brew services restart postgresql@15

# Test connection
psql -d manager_team_tracker -c "SELECT version();"
```

### Perplexity API Issues
- Model name changed to `'sonar'` (was `'pplx-7b-chat'`)
- Check API key is set in `.env`
- Test with: `curl -H "Authorization: Bearer $PERPLEXITY_API_KEY" https://api.perplexity.ai/models`

## 🔄 How to Revert to Remote/Cloud Architecture

### Step 1: Restore Original .env
```bash
# Revert to Neon database
DATABASE_URL=postgresql://neondb_owner:npg_HAlM1QeUz3gi@ep-delicate-field-af0likqm.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require
PGDATABASE=neondb
PGHOST=ep-delicate-field-af0likqm.c-2.us-west-2.aws.neon.tech
PGPORT=5432
PGUSER=neondb_owner
PGPASSWORD=npg_HAlM1QeUz3gi
```

### Step 2: Restore Cloud Deployment
```bash
# Switch back to main branch
git checkout main

# The DigitalOcean server should still be running with:
# - Auto-deployment webhook
# - PM2 process management
# - Nginx reverse proxy

# Vercel frontend should still be active at:
# https://managerteamtrackerv2.vercel.app
```

### Step 3: Clean Up Local Resources (Optional)
```bash
# Stop local PostgreSQL
brew services stop postgresql@15

# Remove local database (optional)
dropdb manager_team_tracker

# Remove local test files
rm compare-all-methods.js test-scraping-local.js debug-sequoia-page.js
rm -rf test/
```

## 🎯 Key Learnings & Insights

### Technical Insights
1. **Web Scraping**: Most reliable for structured team pages
2. **AI-Powered (Perplexity)**: Great for discovery, finds different team members
3. **PDF Parsing**: Comprehensive but requires filtering
4. **Local Development**: Much faster iteration, no deployment delays

### Methodology Insights  
1. **Different methods find different people** - this is valuable, not a bug
2. **No single method is complete** - combination approach is optimal
3. **Web scraping baseline + AI supplementation** appears to be the best strategy
4. **PDF as backup/verification** when available

### Architecture Insights
1. **Local-first development** eliminated cloud complexity 
2. **Database on local machine** enables rapid experimentation
3. **Removing frontend** during experimentation speeds development
4. **Standalone scripts** easier for methodology testing than full web app

## 🔮 Future Enhancements

### Immediate Next Steps
1. **Expand to other VC firms** (test methodology generalization)
2. **Improve PDF filtering** (better false positive removal)
3. **Add confidence scoring** (per-name confidence levels)
4. **Batch processing** (multiple firms at once)

### Advanced Features
1. **Machine Learning** name extraction and validation
2. **LinkedIn API integration** for verification
3. **Real-time monitoring** of team changes
4. **Export formats** (CSV, JSON, database dumps)

### Production Considerations
1. **Hybrid architecture**: Local development + Cloud production
2. **Rate limiting** for API calls
3. **Caching layer** for repeated scraping
4. **Error recovery** and retry logic

## 📚 Dependencies & Requirements

### System Requirements
- macOS (tested on Apple Silicon)
- Node.js 20.9.0+
- PostgreSQL 15+
- Homebrew (for PostgreSQL installation)

### Node.js Dependencies
```json
{
  "new": [
    "postgres@^3.4.7"
  ],
  "existing": [
    "playwright@^1.54.2",
    "pdf-parse@^1.1.1", 
    "dotenv@^17.2.1",
    "drizzle-orm@^0.39.1"
  ]
}
```

### API Keys Required
- `PERPLEXITY_API_KEY`: For AI-powered team member discovery

## 🤝 Contributing

This branch represents a complete methodology comparison system. When merging back to main:

1. **Consider impact on production** (DigitalOcean server, Vercel frontend)
2. **Test cloud database compatibility** (Neon vs local PostgreSQL)
3. **Verify Vercel function limits** (if adding new endpoints)
4. **Update deployment scripts** (if keeping new methodologies)

---

**Created**: August 12, 2025  
**Branch**: `feature/local-methodology-comparison`  
**Status**: ✅ Complete and functional  
**Next**: Ready for production integration or further experimentation