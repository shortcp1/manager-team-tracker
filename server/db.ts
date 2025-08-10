import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";

// Only configure WebSocket in non-serverless environments
if (typeof window === 'undefined' && !process.env.VERCEL) {
  try {
    const ws = require("ws");
    neonConfig.webSocketConstructor = ws;
  } catch (e) {
    // WebSocket not available in serverless environment
    console.log('WebSocket not available, using HTTP connection');
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });