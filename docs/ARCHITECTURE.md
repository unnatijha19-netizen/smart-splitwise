# Architecture

```text
Browser (React + TypeScript + Vite)
       | same-origin /api requests in development
       v
Express REST API (TypeScript + Zod validation)
       |
       v
Prisma ORM
       |
       v
PostgreSQL
```

## Main entities
- `Member`: a person participating in a group trip
- `Expense`: expense description, category, payer, date, total amount in paise
- `ExpenseShare`: the participant's share of an expense, stored in paise

## Important decisions
1. **Money is integer paise in the database.** Avoids binary floating-point errors for stored money.
2. **Expense shares are explicit rows.** This supports unequal splits later without changing the core relationship model.
3. **Settlement logic is a pure function.** Easy to test without a database or HTTP server.
4. **Validation at the API boundary.** Zod rejects malformed payloads before database writes.
5. **Frontend fallback.** The UI can be explored in local demo mode, while API mode persists changes in PostgreSQL.

## Current limitations to discuss honestly
- Authentication and authorization are not implemented yet.
- Data is currently modeled as one shared demo trip; it is not multi-tenant.
- The greedy debt-simplification algorithm reduces transfers but does not guarantee the mathematically smallest possible number for every input.
- Settlements are suggestions only; no real payment is initiated.

## Next steps for a production version
- Add `User`, `Group`, and `GroupMember` models.
- Add authentication (for example, secure session cookies with an established identity provider).
- Scope every read/write query to a group the authenticated user belongs to.
- Add database migrations in CI, structured logging, rate limits, audit events, backups, and monitoring.
- Add integration tests for API routes and end-to-end tests for critical flows.
