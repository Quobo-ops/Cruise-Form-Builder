# CruiseBook - Dynamic Booking Forms

## Overview
CruiseBook is a full-stack web application for creating and filling dynamic booking forms for cruise line businesses. It features a visual form builder for creating multi-step wizards with branching logic, and shareable links for customers to complete bookings on any device.

## Tech Stack
- **Frontend**: React with TypeScript, TailwindCSS, Shadcn UI components
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with bcrypt password hashing

## User Roles
1. **Admin** (protected routes at /admin/*): Create, edit, and manage booking form templates
2. **Public Users** (via shareable links): Fill out booking forms without login

## Key Features
- Multi-step form wizard builder with directed graph structure
- Two step types: Text input and Multiple choice
- Branching logic based on user selections
- Preview mode for testing forms
- Unique shareable links for each published template
- Mobile-responsive design
- Dark mode support

## Routes
- `/` - Landing page
- `/admin/login` - Admin login (credentials: admin / admin123)
- `/admin/dashboard` - Template management dashboard
- `/admin/builder/:id` - Visual form builder
- `/admin/preview/:id` - Form preview mode
- `/form/:shareId` - Public form page (e.g., /form/caribbean-cruise)

## Data Model
### Templates
- `id`: Primary key
- `name`: Template name
- `graph`: JSON containing form structure (rootStepId, steps map)
- `published`: Boolean indicating if the form is live
- `shareId`: Unique identifier for shareable link

### Steps (within graph JSON)
- `type`: "text" or "choice"
- `question`: The question/header text
- `placeholder`: For text inputs
- `choices`: Array of choice options (for choice type)
- `nextStepId`: ID of next step (for text type or each choice)

### Submissions
- `id`: Primary key
- `templateId`: Reference to template
- `answers`: JSON object mapping step IDs to answers
- `createdAt`: Timestamp

## Development
```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to database
```

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption (required for production)

## Recent Changes
- Initial implementation of CruiseBook MVP
- Implemented password hashing with bcrypt
- Added Zod validation for all API endpoints
- Created sample templates for Caribbean, Mediterranean, and Alaska cruises
