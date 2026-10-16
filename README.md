# Smart Splitwise — Portfolio Project

A professional group-expense manager inspired by the supplied dashboard reference. Built with React + TypeScript, Express + TypeScript, Prisma, and PostgreSQL.

## Features
- Dashboard with group spending, settlement count, balances, and recent expenses
- Add members and expenses
- Equal split across selected participants
- Net balances per person
- Greedy debt simplification (reduces the number of transfers in typical cases)
- REST API with validation
- PostgreSQL schema via Prisma
- Vitest unit tests for the settlement algorithm
- Responsive dashboard layout

> This is a portfolio-ready starter, not a production financial service. Before real-world deployment, add authentication, authorization, rate limiting, audit logging, monitoring, backups, and security review.

## Architecture
- `apps/web`: React + Vite + TypeScript frontend
- `apps/api`: Express + TypeScript REST API
- `apps/api/prisma/schema.prisma`: PostgreSQL data model
- `apps/api/src/services/settlement.ts`: pure settlement algorithm

## Requirements
- Node.js 20+
- npm 10+
- PostgreSQL 15+

## Quick start

### 1. Configure the API
```bash
cd apps/api
cp .env.example .env
# Edit DATABASE_URL in .env to point to your PostgreSQL database
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```
API runs at `http://localhost:4000`.

### 2. Run the frontend (new terminal)
```bash
cd apps/web
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

The Vite development server proxies `/api` requests to the API.

## API endpoints
- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/members`
- `POST /api/members` — `{ "name": "Aarav" }`
- `GET /api/expenses`
- `POST /api/expenses` — `{ "description": "Hotel", "category": "Stay", "paidById": "...", "amount": 5000, "participantIds": ["..."], "date": "2026-10-10" }`
- `POST /api/demo/seed` — create demo data if the database is empty
- `POST /api/demo/reset` — clear demo data

## Engineering notes
- Amounts are stored as integer paise in the database to avoid floating-point money errors.
- API validates expense descriptions, positive amounts, payer, and participants.
- For simplicity, the current API is group-agnostic and does not yet implement authentication or multi-tenant access control. Call this out honestly in interviews and describe the next step as group-scoped authorization.
- Settlement output is a suggested plan; it does not move money or initiate bank payments.

## Resume bullet (edit to reflect what you actually complete)
**Smart Splitwise | React, TypeScript, Node.js, Express, PostgreSQL, Prisma**
- Built a responsive group-expense manager with expense tracking, equal-split calculations, balance summaries, and debt simplification.
- Designed REST APIs and a relational data model; used integer paise for precise currency arithmetic and unit-tested settlement logic.
