#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { firms } from './shared/schema.js';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql);

async function setupInitialData() {
  console.log('🌱 Setting up initial data...');
  
  try {
    // Insert Sequoia Capital
    const [sequoia] = await db.insert(firms).values({
      id: 'e89f47b7-1c40-44ab-a6e8-cb6640c4e1b2',
      name: 'Sequoia Capital',
      url: 'https://www.sequoiacap.com/',
      teamPageUrl: 'https://www.sequoiacap.com/our-team/',
      type: 'Venture Capital',
      status: 'active',
    }).returning();
    
    console.log('✅ Added Sequoia Capital');
    
    // Insert A16z as backup
    const [a16z] = await db.insert(firms).values({
      id: '66b90848-de68-444e-92b0-f0ac3320fea4', 
      name: 'Andreessen Horowitz',
      url: 'https://a16z.com/',
      teamPageUrl: 'https://a16z.com/team/',
      type: 'Venture Capital',
      status: 'active',
    }).returning();
    
    console.log('✅ Added Andreessen Horowitz');
    
    await sql.end();
    console.log('🎉 Database setup complete!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    await sql.end();
    process.exit(1);
  }
}

setupInitialData();