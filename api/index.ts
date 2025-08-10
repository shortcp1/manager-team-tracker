import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from "express";
import { registerRoutes } from "../server/routes";

// Create Express app for serverless
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize routes
let routesInitialized = false;
async function initializeRoutes() {
  if (!routesInitialized) {
    await registerRoutes(app);
    routesInitialized = true;
  }
  return app;
}

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expressApp = await initializeRoutes();
    
    // Convert Vercel request to Express-compatible request
    const expressReq = req as any;
    const expressRes = res as any;
    
    // Handle the request with Express
    expressApp(expressReq, expressRes);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}