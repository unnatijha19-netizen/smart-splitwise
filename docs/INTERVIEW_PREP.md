# Interview Prep: Smart Splitwise

## 60-second project explanation
"Smart Splitwise is a group expense management web application built with React and TypeScript on the frontend, an Express REST API, Prisma, and PostgreSQL. Users can manage group members, record expenses, select participants for an equal split, review each person's net balance, and get a simplified settlement suggestion. I separated settlement calculation into a pure function so it can be unit-tested independently. Amounts are persisted as integer paise to avoid floating-point precision issues. The next step is adding authenticated group-scoped access and end-to-end testing."

## Questions to prepare
1. **How is a member's balance calculated?** Add amounts they paid, then subtract their allocated share of every expense.
2. **Why integer paise?** Floating-point values can represent decimal currency values imprecisely. Integer minor units provide predictable arithmetic.
3. **What does debt simplification do?** It pairs members with negative net balances (debtors) with members with positive net balances (creditors), transferring the minimum of the two remaining amounts until balances are settled.
4. **Does greedy simplification always find the global minimum number of transfers?** No. It produces a valid simplified plan, but the globally minimum number of transfers is not guaranteed for all cases.
5. **Why store ExpenseShare separately?** It models each participant's allocated share and makes custom splits and auditability easier to add.
6. **What would you improve for production?** Authentication, authorization, group tenancy, transaction-safe writes, API integration/E2E tests, logging, rate limiting, deployment automation, and observability.
7. **How do you test settlement logic?** Unit tests cover a debtor-creditor transfer, an already settled group, and splitting one debt across creditors. Add property-based tests for balance conservation and random groups.
8. **What happens if a user submits an invalid expense?** The API validates the payload, rejects invalid values with a 400 response, verifies payer/participant IDs, then writes the expense and shares.
