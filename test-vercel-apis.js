#!/usr/bin/env node

/**
 * Test script for Vercel deployment APIs
 * Usage: node test-vercel-apis.js https://your-app.vercel.app
 */

const baseUrl = process.argv[2];

if (!baseUrl) {
  console.log('❌ Please provide your Vercel URL');
  console.log('Usage: node test-vercel-apis.js https://your-app.vercel.app');
  process.exit(1);
}

async function testAPI(endpoint, description) {
  try {
    console.log(`\n🔍 Testing ${description}...`);
    const response = await fetch(`${baseUrl}${endpoint}`);
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`);
    
    if (response.status === 200) {
      const data = await response.text();
      console.log(`   Response: ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`);
      console.log(`   ✅ ${description} working!`);
    } else {
      console.log(`   ⚠️  ${description} returned ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ ${description} failed: ${error.message}`);
  }
}

async function main() {
  console.log(`🚀 Testing APIs for: ${baseUrl}\n`);

  // Test static assets first
  await testAPI('/', 'Frontend (index.html)');
  await testAPI('/assets/index-ZvVPAX7e.js', 'JavaScript bundle');
  await testAPI('/assets/index-BH-DLDz1.css', 'CSS bundle');

  // Test API endpoints
  await testAPI('/api/hello', 'Hello API endpoint');
  await testAPI('/api/stats', 'Stats API endpoint');
  await testAPI('/api/firms', 'Firms API endpoint');

  console.log('\n✅ API testing complete!');
  console.log('\n💡 If frontend loads but is blank, check browser console for errors');
  console.log('💡 If APIs fail, check Vercel function logs in dashboard');
}

main().catch(console.error);