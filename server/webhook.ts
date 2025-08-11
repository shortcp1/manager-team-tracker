import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function handleDeployWebhook(req: Request, res: Response) {
  try {
    console.log('🚀 Deployment webhook triggered from GitHub');
    
    // Security: Optionally verify GitHub webhook signature here
    // const signature = req.headers['x-hub-signature-256'];
    
    const commands = [
      'cd /home/mtuser/manager-team-tracker',
      'git fetch origin main',
      'git reset --hard origin/main',
      'npm ci',
      'npx vite build && npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist',
      'pm2 restart mt-server --update-env'
    ];
    
    console.log('Running deployment commands...');
    const { stdout, stderr } = await execAsync(commands.join(' && '), {
      timeout: 300000 // 5 minute timeout
    });
    
    console.log('✅ Deployment completed successfully');
    console.log('Stdout:', stdout);
    if (stderr && !stderr.includes('warning')) {
      console.log('Stderr:', stderr);
    }
    
    res.json({ 
      success: true, 
      message: 'Deployment completed successfully',
      timestamp: new Date().toISOString(),
      commands: commands.length
    });
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}