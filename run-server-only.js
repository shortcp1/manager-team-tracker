#!/usr/bin/env node

// Simple server launcher that bypasses all Vite complexity
import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🚀 Starting server-only mode...');
console.log('📊 Database:', process.env.DATABASE_URL ? '✅ Connected' : '❌ Missing');
console.log('🤖 Perplexity:', process.env.PERPLEXITY_API_KEY ? '✅ Ready' : '❌ Missing');

// Start the server with TypeScript directly (no build needed)
const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: 'inherit'
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.kill('SIGINT');
});