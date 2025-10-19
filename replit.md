# Fiber Optic Cable Splicing Management Application

## Overview

This application is a professional fiber optic cable splicing management tool for tracking circuits within fiber cables. It features a checkbox-based system for marking circuits as spliced, allowing users to create cables with specific fiber counts, define circuit IDs with auto-calculated fiber positions, and manage splice connections. The system aims to simplify the process of fiber optic cable management with a focus on automatic matching and industry-standard visualizations.

**Progressive Web App (PWA):** The application is fully offline-capable with service worker caching, allowing installation on desktop and mobile devices and continued operation without internet connectivity.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:** React 18 with TypeScript, Vite for fast development.
**State Management:** TanStack Query for server state, React Hook Form with Zod for form validation.
**UI Component System:** Shadcn UI (New York style) based on Radix UI, Tailwind CSS with a custom HSL-based color system, Material Design principles adapted for industrial use.
**Design System Highlights:** Dark mode primary interface (deep navy-charcoal), professional blue primary color, exact HSL color specifications for fiber optic standard colors (12 colors: blue, orange, green, brown, slate, white, red, black, yellow, violet, pink, aqua), Inter and JetBrains Mono typography, responsive spacing.

### Backend Architecture

**Server Framework:** Express.js with TypeScript for RESTful API endpoints.
**API Design:** RESTful endpoints for CRUD operations on cables and circuits (`/api/cables`, `/api/circuits`).
**Circuit Operations:** Includes `PATCH /api/circuits/:id/toggle-spliced` to update splice status and map feed cable information.
**Validation:** Zod schemas derived from Drizzle ORM.
**Development & Production Modes:** Vite middleware for development, static file serving for production.

### Data Storage Solutions

**ORM & Schema Management:** Drizzle ORM for type-safe PostgreSQL operations, schema-first approach with Drizzle-Zod integration.
**Database Schema:**
- **Cables Table:** `id` (UUID), `name`, `fiberCount`, `ribbonSize` (12), `type` ("Feed" or "Distribution").
- **Circuits Table:** `cableId`, `circuitId`, `position`, `fiberStart`, `fiberEnd`, `isSpliced` (0/1), `feedCableId` (UUID, nullable), `feedFiberStart` (nullable), `feedFiberEnd` (nullable).
- **Saves Table:** `id` (UUID), `name` (date/time stamp), `createdAt` (timestamp), `data` (JSON string containing cables and circuits).
- UUID primary keys, cascade deletion for cables and associated circuits.
**Storage Abstraction:** `IStorage` interface with `DatabaseStorage` implementation using Drizzle ORM.

### System Design Choices & Features

**Database Persistence:** Full PostgreSQL integration, all data persists, automatic schema migrations with Drizzle Kit.
**Checkbox-Based Splicing with Automatic Range-Based Circuit Matching:**
- Simple checkbox to mark Distribution circuits as spliced, automatically searching all Feed cables for a matching circuit using range-based matching.
- **Range-Based Matching Logic:** Distribution circuit matches a Feed circuit if (1) both have the same prefix (part before comma), and (2) the Distribution circuit's numeric range from the circuit ID is within the Feed circuit's numeric range from the circuit ID.
- **Important:** Matching uses the numeric range from the circuit ID itself (e.g., "test,3-4" extracts 3-4), NOT the physical fiber positions in the cable.
- **Example:** Distribution circuit "test,3-4" matches Feed circuit "test,1-12" because prefix "test" matches and range 3-4 is within 1-12.
- **Example:** Distribution circuit "exact,15-20" matches Feed circuit "exact,15-20" (exact match where 15-20 equals 15-20).
- Automatically extracts Feed cable ID and fiber positions for one-click splicing.
- Stores `feedCableId`, `feedFiberStart`, `feedFiberEnd` in the circuits table (Distribution circuit's actual fiber range, not Feed range).
- Error handling with toast messages if no matching Feed circuit is found.
- Splice tab displays fiber mappings with color-coded, industry-standard fiber optic colors (12 colors).
- **Adaptive Splice Display:** Automatically switches between two display modes:
  - **Full Ribbon View:** When all circuits use complete ribbons (fiber counts are multiples of 12), displays one row per ribbon with color-coded ribbon numbers and circuit ranges (e.g., "pon,49-60"). Strand columns are hidden for cleaner visualization.
  - **Fiber View:** When any circuit uses partial ribbons, displays individual fiber mappings (one row per fiber) with color-coded strand numbers.
**Pass/Fail Status Badges:** Cables and circuits display green "Pass" badges when total assigned fibers are within cable capacity, or red "Fail" badges when exceeded.
**Delete Cable:** Immediate deletion without confirmation dialog.
**Save/Load System with Auto-Save:** 
- "Start New" button in header replaces "Reset" button - auto-saves current project with date/time stamp before clearing all data
- "History" button opens dialog showing all saved projects (max 50 saves)
- Date/time stamped saves automatically generated (format: MM/DD/YYYY HH:MM:SS)
- Oldest saves automatically deleted when 50-save limit is reached
- One-click load from History dialog restores complete project state (cables and circuits)
- Saves stored in PostgreSQL database (`saves` table with id, name, createdAt, data fields)
**Circuit ID Management (Auto-Calculated Fiber Positions with Edit and Reorder):**
- Simplified input: `circuitId` is the only required input.
- Inline editing of circuit IDs with automatic recalculation of fiber positions.
- Circuit reordering with arrow buttons, triggering automatic recalculation of fiber positions.
- Auto-calculation of fiber positions based on circuit order.
- Real-time validation for fiber count matching cable capacity.
- Visual feedback on assigned/total fiber count.
**User Interface:**
- Dynamic tab system: **InputData** tab (cable and circuit management) with Cable icon, and separate **Splice** tabs for each Distribution cable with Workflow icon.
- InputData tab features cable list, cable details, circuit management, and splice checkboxes.
- Each Distribution cable gets its own Splice tab (e.g., "Splice dist1", "Splice dist2") showing only that cable's splice mappings.
- Splice tabs feature a two-row header with "Feed" and "Distribution" sections, cable names showing "Name - FiberCount" format, and detailed color-coded fiber/ribbon mapping.
- Alternating row colors (white/gray-200) by circuit ID for visual grouping.
- **Label Usage:** Cable details section shows "Cable Size: X", Circuit management header shows "Fiber Count: X/Y" (X assigned out of Y total).
- **Pass/Fail Status:** Both cable cards and circuit details use consistent logic (Pass only when ALL fibers are assigned: assigned fibers === cable capacity).
- Responsive design with a professional technical interface.

## PWA Features

**Offline Functionality:** Service worker caches all app assets for offline access. Data cached locally enables full app functionality without internet connection.
**App Installation:** Users can install the app on desktop/mobile devices via browser's "Install App" option.
**Update Notifications:** Visual notifications appear when new app versions are available, with one-click update functionality.
**Manifest Configuration:** Web app manifest (`/manifest.json`) with app metadata, theme colors, and icon configurations.

## External Dependencies

**Database:** PostgreSQL (via Neon serverless driver @neondatabase/serverless).
**PWA:** Custom service worker implementation (`/sw.js`) with manual registration for offline support.
**Core Libraries:**
- React ecosystem: `react`, `react-dom`, `wouter`.
- State management: `@tanstack/react-query`, `react-hook-form`.
- Validation: `zod`, `@hookform/resolvers`.
- UI components: Radix UI (`@radix-ui/react-*`).
- Styling: `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- Date handling: `date-fns`.
- Utilities: `nanoid`, `cmdk`.
**Development Tools:** TypeScript, ESBuild, Replit-specific Vite plugins (`vite-plugin-runtime-error-modal`, `vite-plugin-cartographer`, `vite-plugin-dev-banner`), PostCSS.