# Deployment Test

This file is used to test the GitHub webhook auto-deployment functionality.

## Test Log
- Initial webhook setup: 2025-08-11
- Enhanced scraper working: ✅ (53 members from Sequoia vs 19 previously)
- Auto-deployment webhook: Ready for testing
- Experimental endpoints deployment test: 2025-08-12

## How it works
1. Push changes to GitHub main branch
2. GitHub webhook triggers
3. DigitalOcean server pulls latest code
4. Server rebuilds and restarts automatically

Last updated: 2025-08-12