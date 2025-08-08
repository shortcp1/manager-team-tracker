# PE/VC Team Monitor

## Overview

This is a full-stack web application that monitors team changes at private equity and venture capital firms. The system automatically scrapes firm websites to detect when team members are added, removed, or updated, and sends email notifications when changes are detected. It features a modern React frontend with a dashboard for viewing firms, team members, change history, and notifications, plus an Express.js backend with automated web scraping and email capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React SPA** with TypeScript using Vite as the build tool
- **Component Library**: Radix UI primitives with shadcn/ui components for consistent design
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack React Query for server state and caching
- **Routing**: Wouter for client-side navigation
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Express.js** server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **File Structure**: Shared schema definitions between client and server
- **API Design**: RESTful endpoints for firms, team members, changes, and settings
- **Error Handling**: Centralized error middleware with proper HTTP status codes

### Database Schema
- **firms**: Stores VC/PE firm information with URLs and scraping status
- **team_members**: Individual team member data with change tracking
- **change_history**: Audit log of all detected changes with email tracking
- **scrape_history**: Logs of scraping operations and their results
- **email_settings**: Configuration for notification preferences
- **users**: Basic user authentication (future feature)

### Web Scraping System
- **Puppeteer**: Headless Chrome automation for JavaScript-heavy sites
- **Cheerio**: HTML parsing for static content extraction
- **Scheduled Jobs**: Cron-based weekly scraping (Mondays at 2 AM EST)
- **Change Detection**: Compares current scrape results with previous data
- **Error Handling**: Robust error tracking and recovery mechanisms

### Email Notification System
- **Nodemailer**: SMTP email delivery with HTML and text formats
- **Template System**: Structured email formatting for change notifications
- **Configuration**: Environment-based SMTP settings with recipient management
- **Tracking**: Email delivery status tracking in change history

## External Dependencies

### Database
- **Neon PostgreSQL**: Serverless PostgreSQL database using `@neondatabase/serverless`
- **Connection**: Pool-based connections with WebSocket support for serverless environments

### UI Components
- **Radix UI**: Accessible component primitives for dialogs, forms, navigation
- **Lucide React**: Icon library for consistent iconography
- **Class Variance Authority**: Type-safe component variant management

### Web Scraping
- **Puppeteer**: Browser automation for dynamic content scraping
- **Cheerio**: Server-side HTML parsing and manipulation

### Email Services
- **Nodemailer**: Email delivery with SMTP transport
- **SMTP Configuration**: Supports Gmail, custom SMTP servers via environment variables

### Development Tools
- **Vite**: Frontend build tool with HMR and TypeScript support
- **Replit Integration**: Development environment plugins and error overlays
- **ESBuild**: Backend bundling for production builds

### Validation & Type Safety
- **Zod**: Runtime type validation with Drizzle integration
- **TypeScript**: Full-stack type safety with path mapping
- **Drizzle Zod**: Automatic schema validation from database models