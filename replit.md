# CruiseBook - Dynamic Booking Forms

## Overview
CruiseBook is a full-stack web application for creating and filling dynamic booking forms for cruise line businesses. It features a visual form builder for creating multi-step wizards with branching logic, cruise management with inventory tracking, and shareable links for customers to complete bookings on any device.

## Tech Stack
- **Frontend**: React with TypeScript, TailwindCSS, Shadcn UI components
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with bcrypt password hashing

## User Roles
1. **Admin** (protected routes at /admin/*): Create, edit, and manage booking form templates and cruises
2. **Public Users** (via shareable links): Fill out booking forms without login

## Key Features
- Multi-step form wizard builder with directed graph structure
- Three step types: Text input, Multiple choice, and Multi-choice with Quantity
- Branching logic based on user selections
- **Cruise Management**: Create cruises linked to form templates with unique shareable links
- **Inventory Tracking**: Track quantities and stock limits for items with quantity selection
- **Customer Management**: View submitted clients with their full form answers
- Phone number required for all submissions
- Preview mode for testing forms
- Unique shareable links for each cruise
- Mobile-responsive design
- Dark mode support

## Routes
- `/` - Landing page
- `/admin/login` - Admin login (credentials: admin / admin123)
- `/admin/dashboard` - Main dashboard (defaults to Cruises tab)
- `/admin/cruises` - Cruise management
- `/admin/cruises/:id` - Cruise detail view with inventory and submissions
- `/admin/templates` - Form template management
- `/admin/builder/:id` - Visual form builder
- `/admin/preview/:id` - Form preview mode
- `/form/:shareId` - Public form page (works for both cruises and legacy templates)

## Data Model

### Templates
- `id`: Primary key (UUID)
- `name`: Template name
- `graph`: JSON containing form structure (rootStepId, steps map)
- `published`: Boolean indicating if the form is live
- `shareId`: Unique identifier for shareable link

### Steps (within graph JSON)
- `type`: "text", "choice", or "quantity"
- `question`: The question/header text
- `placeholder`: For text inputs
- `choices`: Array of choice options (for choice type)
- `quantityChoices`: Array of items with price/limit (for quantity type)
- `nextStepId`: ID of next step

### Quantity Choices (for quantity step type)
- `id`: Choice ID
- `label`: Item label (e.g., "Small Shirt")
- `price`: Price per unit
- `limit`: Optional stock limit
- `isNoThanks`: Boolean for skip options

### Cruises
- `id`: Primary key (UUID)
- `name`: Cruise name
- `description`: Optional description
- `startDate`, `endDate`: Optional dates
- `templateId`: Reference to form template
- `shareId`: Unique shareable link identifier
- `isActive`: Boolean for accepting new signups

### Cruise Inventory
- `cruiseId`: Reference to cruise
- `stepId`, `choiceId`: Reference to specific quantity choice
- `choiceLabel`: Item label
- `price`: Price per unit
- `totalOrdered`: Aggregate quantity ordered
- `stockLimit`: Optional limit (null = unlimited)

### Submissions
- `id`: Primary key (UUID)
- `templateId`: Reference to template
- `cruiseId`: Optional reference to cruise
- `answers`: JSON object mapping step IDs to answers (strings or quantity arrays)
- `customerName`: Customer name
- `customerPhone`: Required phone number
- `isViewed`: Boolean for new submission tracking
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
- Added Cruise entity with CRUD operations and unique shareable links
- Added new "quantity" step type for multi-choice with quantity and price
- Implemented inventory tracking for quantity items with stock limits
- Updated Admin Dashboard with tabbed navigation (Cruises / Form Templates)
- Created Cruise detail page with inventory management and submission list
- Updated Public Form to support cruise-based forms with quantity selection
- Made phone number required for all submissions
- Added sold-out detection and remaining stock display
