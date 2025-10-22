# Fiber Optic Cable Splicing Management Application

## Overview

This application is a **Progressive Web App (PWA)** for professional fiber optic cable splicing management. It runs completely offline with all data stored locally in the browser using IndexedDB, allowing users to install the app from their browser and use it without any internet connection. The app features a checkbox-based system for marking circuits as spliced, automatic fiber position calculation, splice connection management, and complete data persistence across sessions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:** React 18 with TypeScript, Vite for fast development.
**State Management:** TanStack Query for server state, React Hook Form with Zod for form validation.
**UI Component System:** Shadcn UI (New York style) based on Radix UI, Tailwind CSS with a custom HSL-based color system, Material Design principles adapted for industrial use.
**Design System Highlights:** Dark mode primary interface (deep navy-charcoal), professional blue primary color, exact HSL color specifications for fiber optic standard colors (12 colors: blue, orange, green, brown, slate, white, red, black, yellow, violet, pink, aqua), Inter and JetBrains Mono typography, responsive spacing.

### Application Architecture

**Frontend-Only PWA:** No backend server required - all logic runs in the browser.
**Query Client:** Custom IndexedDB-based query client intercepts all "API" calls and routes them to local storage operations.
**Circuit Auto-Calculation:** Position, fiberStart, and fiberEnd calculated automatically in the query client during circuit creation.
**Data Flow:** All CRUD operations go through storage layer abstraction, making the app completely offline-capable.
**Development Server:** Minimal Vite dev server only serves static files, no backend logic.

### Data Storage Solutions

**Storage Implementation:** IndexedDB (browser database) using Dexie library for offline-first PWA architecture.
**Database:** `FiberSpliceDB` version 2, stored in browser's IndexedDB, persists indefinitely.
**IndexedDB Schema:**
- **Cables Store:** `id` (primary key), `name`, `fiberCount`, `ribbonSize` (12), `type` ("Feed" or "Distribution"). Indexed: id, name, type.
- **Circuits Store:** `id`, `cableId`, `circuitId`, `position`, `fiberStart`, `fiberEnd`, `isSpliced` (0/1), `feedCableId`, `feedFiberStart`, `feedFiberEnd`. Indexed: id, cableId, position, isSpliced.
- All data persists across browser sessions and page reloads.
**Storage Abstraction:** Storage layer provides clean API for CRUD operations, called directly by query client (no HTTP involved).

### System Design Choices & Features

**PWA Capabilities:** 
- Installable from browser via manifest.json
- Service worker with offline caching for complete offline functionality
- All app assets cached for instant offline loading
- No server required after initial load
**Browser-Based Persistence:** IndexedDB stores all data locally, persists indefinitely unless user clears browser data.
**Error Handling & Recovery:** Graceful 404 error handling for stale data, automatic cache invalidation.
**Checkbox-Based Splicing with Automatic Range-Based Circuit Matching:**
- Simple checkbox to mark Distribution circuits as spliced, automatically searching all Feed cables for a matching circuit using range-based matching.
- **Range-Based Matching Logic:** Distribution circuit matches a Feed circuit if (1) both have the same prefix (part before comma), and (2) the Distribution circuit's numeric range from the circuit ID is within the Feed circuit's numeric range from the circuit ID.
- **Important:** Matching uses the numeric range from the circuit ID itself (e.g., "test,3-4" extracts 3-4), NOT the physical fiber positions in the cable.
- **Example:** Distribution circuit "test,3-4" matches Feed circuit "test,1-12" because prefix "test" matches and range 3-4 is within 1-12.
- **Example:** Distribution circuit "exact,15-20" matches Feed circuit "exact,15-20" (exact match where 15-20 equals 15-20).
- Automatically extracts Feed cable ID and fiber positions for one-click splicing.
- Stores `feedCableId`, `feedFiberStart`, `feedFiberEnd` in the circuits table (Distribution circuit's actual fiber range, not Feed range).
- **Feed Fiber Conflict Prevention:** System prevents two distribution circuits from splicing to the same feed cable with overlapping fiber positions. For example, if d2's "pon,1-8" is spliced to f1's fibers 1-8, d3's "pon,8-12" cannot splice to f1 because fiber 8 would be used by both.
- Error handling with toast messages if no matching Feed circuit is found or if feed fibers are already in use.
- Splice tab displays fiber mappings with color-coded, industry-standard fiber optic colors (12 colors).
- **Adaptive Splice Display:** Automatically switches between two display modes:
  - **Full Ribbon View:** When all circuits use complete ribbons (fiber counts are multiples of 12), displays one row per ribbon with color-coded ribbon numbers and circuit ranges (e.g., "pon,49-60"). Strand columns are hidden for cleaner visualization.
  - **Fiber View:** When any circuit uses partial ribbons, displays individual fiber mappings (one row per fiber) with color-coded strand numbers.
**Pass/Fail Status Badges:** Cables and circuits display green "Pass" badges when total assigned fibers are within cable capacity, or red "Fail" badges when exceeded.
**Delete Cable:** Immediate deletion without confirmation dialog.
**File-Based Save/Load System:** 
- "Save" button opens dialog for naming project, then downloads as JSON file to user's chosen location
- "Load" button opens file picker to restore project from JSON file (clears existing data first)
- User controls file names and storage location (no automatic saves)
- JSON format contains all cables and circuits with exact state preservation
- Simple file management through operating system
- Portable backups that can be shared across computers
**OCR (Optical Character Recognition):**
- Browser-based OCR using Tesseract.js (works completely offline)
- **Two locations:** "Scan Image" button in Add Cable dialog's Circuit IDs field, and Scan icon next to Circuit ID input in Circuit Management
- **Two capture methods:**
  1. **Paste** - Paste screenshot from clipboard (Win+Shift+S / Cmd+Shift+4) - **RECOMMENDED for snipping part of screen**
  2. **Upload** - Choose image file from computer
- **Snip Part of Screen Workflow (Recommended):** Use OS snipping tool (Win+Shift+S or Cmd+Shift+4) to select screen region, then click Paste button in OCR dialog
- Automatically extracts text from images for Circuit ID entry
- Progress indicator shows OCR processing status (0-100%)
- Edit extracted text before using
- Best results with clear, printed text (works with English)
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

## External Dependencies

**IndexedDB Library:** Dexie (wrapper for browser IndexedDB API).
**OCR Library:** Tesseract.js (browser-based OCR, works offline).
**PWA:** Service worker for offline caching, manifest.json for installation.
**Core Libraries:**
- React ecosystem: `react`, `react-dom`, `wouter`.
- State management: `@tanstack/react-query`, `react-hook-form`.
- Validation: `zod`, `@hookform/resolvers`.
- UI components: Radix UI (`@radix-ui/react-*`).
- Styling: `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- Date handling: `date-fns`.
- Utilities: `nanoid`, `cmdk`.
**Development Tools:** TypeScript, ESBuild, Replit-specific Vite plugins (`vite-plugin-runtime-error-modal`, `vite-plugin-cartographer`, `vite-plugin-dev-banner`), PostCSS.