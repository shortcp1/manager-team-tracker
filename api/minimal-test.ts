import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Test 1: Basic response
    const basic = {
      message: 'Serverless function works',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV
    };

    // Test 2: Try importing something simple
    let importTest = 'No imports tested';
    try {
      const path = await import('path');
      importTest = 'Path import works';
    } catch (e) {
      importTest = `Path import failed: ${e instanceof Error ? e.message : 'unknown'}`;
    }

    // Test 3: Try importing our schema (shared)
    let schemaTest = 'Schema not tested';
    try {
      const schema = await import('../shared/schema');
      schemaTest = 'Schema import works';
    } catch (e) {
      schemaTest = `Schema import failed: ${e instanceof Error ? e.message : 'unknown'}`;
    }

    res.status(200).json({
      basic,
      importTest,
      schemaTest,
      hasDatabase: !!process.env.DATABASE_URL
    });

  } catch (error) {
    res.status(500).json({
      error: 'Function crashed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}