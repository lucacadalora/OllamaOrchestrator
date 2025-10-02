# DGON Console

## Overview

DGON Console is a web-based dashboard for managing a decentralized GPU operator network. The platform enables node operators to register their compute resources (running Ollama, vLLM, TensorRT-LLM, or TGI), monitor network health in real-time, track request receipts, and manage earnings. The system uses HMAC-based authentication to verify node heartbeats and receipt submissions, ensuring only authorized nodes can participate in the network.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React 18 with TypeScript, Vite as the build tool, and Wouter for client-side routing.

**UI Framework**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling. The design system uses CSS variables for theming with support for light/dark modes.

**State Management**: TanStack Query (React Query) for server state management with automatic refetching every 5 seconds for real-time data updates. No global client state management library is used - component state and URL parameters handle local state.

**Data Fetching Pattern**: All API calls use a centralized `apiRequest` utility that handles authentication via cookies and provides consistent error handling. Query invalidation is automatic through React Query's built-in mechanisms.

**Routing Structure**: 
- `/` - Network overview dashboard with KPIs and metrics
- `/nodes` - Node management and monitoring
- `/receipts` - Request receipt explorer
- `/earnings` - Earnings and payout tracking
- `/setup` - Node registration and onboarding

**Real-time Updates**: Custom `useRealtime` hook provides a 5-second polling mechanism with visual refresh indicators, allowing the dashboard to show near-live network status without WebSocket complexity.

### Backend Architecture

**Runtime**: Node.js with Express framework, written in TypeScript and compiled with esbuild for production.

**API Design**: RESTful API following the `/api/v1/*` convention. Key endpoints include:
- `POST /api/v1/nodes/register` - Node registration (returns node token)
- `POST /api/v1/nodes/heartbeat` - Node health check (HMAC authenticated)
- `POST /api/v1/receipts` - Request receipt submission (HMAC authenticated)
- `GET /api/v1/nodes` - List nodes with optional filters
- `GET /api/v1/summary` - Network summary statistics

**Authentication Strategy**: Two-tier system:
1. HMAC-SHA256 signature verification for node-to-server communication using shared secrets stored per node
2. Session-based authentication for dashboard users (prepared but not fully implemented)

The HMAC implementation uses timing-safe comparison to prevent timing attacks and validates timestamp freshness (2-minute window) to prevent replay attacks.

**Request Verification**: All authenticated node requests include:
- `X-Node-ID` header: Node identifier
- `X-Node-TS` header: Unix timestamp
- `X-Node-Auth` header: HMAC signature of (request body + timestamp)

The signature is calculated as: `HMAC-SHA256(secret, body + timestamp)`. The server verifies the signature matches and the timestamp is within acceptable bounds before processing.

### Data Storage

**Database**: PostgreSQL accessed through Neon's serverless driver for connection pooling and edge compatibility.

**ORM**: Drizzle ORM with type-safe query builder and automatic schema inference. Migration files are generated in the `./migrations` directory.

**Schema Design**:

1. **nodes** table: Core node registry
   - `id` (text, PK): Unique node identifier
   - `region`, `runtime`, `status`: Node metadata
   - `reputation` (numeric): Node reliability score (default 60.0)
   - `greenEnergy` (boolean): Sustainability flag
   - `lastHeartbeat` (timestamp): Health check tracking

2. **nodeSecrets** table: Authentication credentials
   - `nodeId` (text, PK, FK): References nodes.id
   - `secret` (text): HMAC shared secret
   - One-to-one relationship with nodes

3. **receipts** table: Request execution records
   - `id` (text, PK): Unique receipt identifier
   - `nodeId` (text, FK): Executing node
   - `modelId` (text): AI model used
   - `payload` (jsonb): Execution metadata (tokens, latency, cache hits, signatures)
   - Foreign key constraint to nodes table

4. **earnings** table: Payout tracking (prepared for future billing)
   - `nodeId` (text, FK): Node earning rewards
   - `periodStart/periodEnd` (timestamp): Earning period
   - `feesUsd`, `jtvoEst` (numeric): Payment amounts
   - `payoutReady` (boolean): Payment status flag

**Storage Layer Pattern**: Database operations are abstracted through a storage interface (`IStorage`) with a concrete `DatabaseStorage` implementation. This allows for easy testing and potential future storage backend changes.

### External Dependencies

**Database Service**: 
- Neon PostgreSQL serverless database (required)
- Environment variable: `DATABASE_URL`
- WebSocket support for serverless environments via `ws` package

**Node Agent Integration**:
- Python-based agent (`agent.py`) runs on operator machines (cross-platform: macOS, Linux, Windows)
- Communicates with Ollama API at `http://127.0.0.1:11434/api/tags`
- Posts heartbeats and receipts to the DGON Console API
- Environment variables: `DGON_API`, `NODE_ID`, `REGION`, `NODE_TOKEN`

**UI Component Libraries**:
- Radix UI primitives for accessible components
- Tailwind CSS for styling
- Lucide React for icons
- React Hook Form with Zod for form validation
- date-fns for date formatting

**Build & Development Tools**:
- Vite for frontend development and building
- esbuild for backend bundling
- tsx for TypeScript execution in development
- Drizzle Kit for database migrations
- Replit-specific plugins for development experience

**Security Dependencies**:
- Node.js `crypto` module for HMAC generation
- Timing-safe equality comparison to prevent timing attacks
- No external authentication libraries (custom implementation)