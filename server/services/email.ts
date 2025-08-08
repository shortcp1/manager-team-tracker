import nodemailer from 'nodemailer';
import { storage } from '../storage';
import { type ChangeHistory } from '@shared/schema';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private async getTransporter() {
    if (!this.transporter) {
      // Use environment variables for email configuration
      const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER,
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
        },
      };

      this.transporter = nodemailer.createTransporter(emailConfig);
    }

    return this.transporter;
  }

  async sendChangeNotification(changes: ChangeHistory[]): Promise<void> {
    try {
      const settings = await storage.getEmailSettings();
      if (!settings || !settings.enabled || !settings.recipients.length) {
        console.log('Email notifications are disabled or no recipients configured');
        return;
      }

      const transporter = await this.getTransporter();
      
      const htmlContent = this.generateChangeNotificationHtml(changes);
      const textContent = this.generateChangeNotificationText(changes);

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@teammonitor.com',
        to: settings.recipients,
        subject: `PE/VC Team Monitor: ${changes.length} team change${changes.length !== 1 ? 's' : ''} detected`,
        html: htmlContent,
        text: textContent,
      };

      await transporter.sendMail(mailOptions);
      
      // Mark changes as email sent
      for (const change of changes) {
        await storage.markEmailSent(change.id);
      }

      console.log(`Change notification email sent to ${settings.recipients.length} recipient(s)`);
    } catch (error) {
      console.error('Error sending email notification:', error);
      throw error;
    }
  }

  private generateChangeNotificationHtml(changes: ChangeHistory[]): string {
    const changesByFirm = this.groupChangesByFirm(changes);
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>PE/VC Team Changes</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #1976D2; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .firm-section { margin-bottom: 30px; border-left: 4px solid #1976D2; padding-left: 15px; }
          .firm-name { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
          .change { margin: 10px 0; padding: 10px; border-radius: 5px; }
          .change.added { background: #e8f5e8; border-left: 3px solid #4CAF50; }
          .change.removed { background: #ffeaea; border-left: 3px solid #f44336; }
          .change.updated { background: #e3f2fd; border-left: 3px solid #2196F3; }
          .member-name { font-weight: bold; }
          .member-title { color: #666; font-style: italic; }
          .timestamp { color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PE/VC Team Monitor</h1>
          <p>Team changes detected</p>
        </div>
        <div class="content">
    `;

    for (const [firmName, firmChanges] of Array.from(changesByFirm)) {
      html += `
        <div class="firm-section">
          <div class="firm-name">${firmName}</div>
      `;

      for (const change of firmChanges) {
        const changeClass = change.changeType;
        const changeIcon = this.getChangeIcon(change.changeType);
        
        html += `
          <div class="change ${changeClass}">
            <span style="margin-right: 8px;">${changeIcon}</span>
            <span class="member-name">${change.memberName}</span>
            ${change.memberTitle ? `<span class="member-title"> - ${change.memberTitle}</span>` : ''}
            <div class="timestamp">${change.detectedAt.toLocaleString()}</div>
          </div>
        `;
      }

      html += `</div>`;
    }

    html += `
        </div>
      </body>
      </html>
    `;

    return html;
  }

  private generateChangeNotificationText(changes: ChangeHistory[]): string {
    const changesByFirm = this.groupChangesByFirm(changes);
    
    let text = `PE/VC Team Monitor - Team Changes Detected\n\n`;

    for (const [firmName, firmChanges] of Array.from(changesByFirm)) {
      text += `${firmName}:\n`;
      text += '='.repeat(firmName.length + 1) + '\n';

      for (const change of firmChanges) {
        const changeType = change.changeType.toUpperCase();
        text += `[${changeType}] ${change.memberName}`;
        if (change.memberTitle) {
          text += ` - ${change.memberTitle}`;
        }
        text += `\n  Detected: ${change.detectedAt.toLocaleString()}\n\n`;
      }
    }

    return text;
  }

  private groupChangesByFirm(changes: ChangeHistory[]): Map<string, ChangeHistory[]> {
    const grouped = new Map<string, ChangeHistory[]>();
    
    // Note: This assumes firm name is available. In a real implementation,
    // you might need to join with the firms table to get the firm name.
    for (const change of changes) {
      const firmName = 'Unknown Firm'; // This should be populated with actual firm name
      if (!grouped.has(firmName)) {
        grouped.set(firmName, []);
      }
      grouped.get(firmName)!.push(change);
    }
    
    return grouped;
  }

  private getChangeIcon(changeType: string): string {
    switch (changeType) {
      case 'added': return '✅';
      case 'removed': return '❌';
      case 'updated': return '📝';
      default: return '•';
    }
  }
}

export const emailService = new EmailService();
