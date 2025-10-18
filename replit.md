# Fiber Optic Cable Splicing Management Application

## Overview

This application is a professional fiber optic cable splicing management tool for tracking circuits within fiber cables. It features a checkbox-based system for marking circuits as spliced, allowing users to create cables with specific fiber counts, define circuit IDs with auto-calculated fiber positions, and manage splice connections. The system aims to simplify the process of fiber optic cable management with a focus on automatic matching and industry-standard visualizations.

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
- UUID primary keys, cascade deletion for cables and associated circuits.
**Storage Abstraction:** `IStorage` interface with `DatabaseStorage` implementation using Drizzle ORM.

### System Design Choices & Features

**Database Persistence:** Full PostgreSQL integration, all data persists, automatic schema migrations with Drizzle Kit.
**Checkbox-Based Splicing with Automatic Circuit Matching:**
- Simple checkbox to mark Distribution circuits as spliced, automatically searching all Feed cables for a matching `circuitId`.
- Automatically extracts Feed cable ID and fiber positions for one-click splicing.
- Stores `feedCableId`, `feedFiberStart`, `feedFiberEnd` in the circuits table.
- Error handling with toast messages if no matching Feed circuit is found.
- Splice tab displays individual fiber mappings (one row per fiber) with color-coded, industry-standard fiber optic colors (12 colors).
**Cable Search:** Real-time search by cable name or type.
**Circuit ID Management (Auto-Calculated Fiber Positions with Edit and Reorder):**
- Simplified input: `circuitId` is the only required input.
- Inline editing of circuit IDs with automatic recalculation of fiber positions.
- Circuit reordering with arrow buttons, triggering automatic recalculation of fiber positions.
- Auto-calculation of fiber positions based on circuit order.
- Real-time validation for fiber count matching cable capacity.
- Visual feedback on assigned/total fiber count.
**User Interface:**
- Two main tabs: **InputData** (cable and circuit management) and **Splice** (splice mappings).
- InputData tab features cable list, cable details, circuit management, and splice checkboxes.
- Splice tab features a three-row header with "Feed" and "Distribution" sections and detailed, color-coded individual fiber mapping.
- Responsive design with a professional technical interface.

## External Dependencies

**Database:** PostgreSQL (via Neon serverless driver @neondatabase/serverless).
**Core Libraries:**
- React ecosystem: `react`, `react-dom`, `wouter`.
- State management: `@tanstack/react-query`, `react-hook-form`.
- Validation: `zod`, `@hookform/resolvers`.
- UI components: Radix UI (`@radix-ui/react-*`).
- Styling: `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- Date handling: `date-fns`.
- Utilities: `nanoid`, `cmdk`.
**Development Tools:** TypeScript, ESBuild, Replit-specific Vite plugins (`vite-plugin-runtime-error-modal`, `vite-plugin-cartographer`, `vite-plugin-dev-banner`), PostCSS.