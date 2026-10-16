
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { simplifyDebts } from './services/settlement.js';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const categories = [
  'Food',
  'Travel',
  'Stay',
  'Adventure',
  'Shopping',
  'Other',
] as const;

const expenseSchema = z.object({
  description: z.string().trim().min(1).max(120),
  category: z.enum(categories),
  paidById: z.string().min(1),
  amount: z.number().finite().positive().max(100000000),
  participantIds: z.array(z.string().min(1)).min(1).max(100),
  date: z.string().date(),
});

function formatExpense(e: any) {
  return {
    id: e.id,
    description: e.description,
    category: e.category,
    amount: e.amountPaise / 100,
    paidById: e.paidById,
    paidByName: e.paidBy.name,
    participantIds: e.shares.map((s: any) => s.memberId),
    participants: e.shares.map((s: any) => s.member.name),
    date: e.date.toISOString().slice(0, 10),
  };
}

function makeShares(participantIds: string[], amountPaise: number) {
  const baseShare = Math.floor(amountPaise / participantIds.length);
  let remainder = amountPaise - baseShare * participantIds.length;

  return participantIds.map((memberId) => ({
    memberId,
    sharePaise: baseShare + (remainder-- > 0 ? 1 : 0),
  }));
}

async function validateMembers(paidById: string, participantIds: string[]) {
  const ids = [...new Set([...participantIds, paidById])];

  const existing = await prisma.member.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });

  return existing.length === ids.length;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'smart-splitwise-api' });
});

// GET MEMBERS
app.get('/api/members', async (_req, res, next) => {
  try {
    const members = await prisma.member.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json(members);
  } catch (e) {
    next(e);
  }
});

// ADD MEMBER
app.post('/api/members', async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(60),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Name must contain 1–60 characters.',
    });
  }

  try {
    const duplicate = await prisma.member.findFirst({
      where: {
        name: {
          equals: parsed.data.name,
          mode: 'insensitive',
        },
      },
    });

    if (duplicate) {
      return res.status(409).json({
        error: 'A member with that name already exists.',
      });
    }

    const member = await prisma.member.create({
      data: { name: parsed.data.name },
    });

    res.status(201).json(member);
  } catch (e) {
    next(e);
  }
});

// DELETE MEMBER
// Linked expenses hone par member ko delete nahi karenge.
app.delete('/api/members/:id', async (req, res, next) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const [paidExpenses, shares] = await Promise.all([
      prisma.expense.count({
        where: { paidById: member.id },
      }),
      prisma.expenseShare.count({
        where: { memberId: member.id },
      }),
    ]);

    if (paidExpenses > 0 || shares > 0) {
      return res.status(409).json({
        error: 'This member is linked to expenses. Delete or reassign those expenses first.',
      });
    }

    await prisma.member.delete({
      where: { id: member.id },
    });

    res.json({ message: 'Member deleted successfully.' });
  } catch (e) {
    next(e);
  }
});

// GET EXPENSES
app.get('/api/expenses', async (_req, res, next) => {
  try {
    const expenses = await prisma.expense.findMany({
      include: {
        paidBy: true,
        shares: { include: { member: true } },
      },
      orderBy: { date: 'desc' },
    });

    res.json(expenses.map(formatExpense));
  } catch (e) {
    next(e);
  }
});

// ADD EXPENSE
app.post('/api/expenses', async (req, res, next) => {
  const parsed = expenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid expense payload.',
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const participantIds = [...new Set(input.participantIds)];
  const amountPaise = Math.round(input.amount * 100);

  try {
    const valid = await validateMembers(
      input.paidById,
      participantIds,
    );

    if (!valid) {
      return res.status(400).json({
        error: 'Payer or participant does not exist.',
      });
    }

    const expense = await prisma.expense.create({
      data: {
        description: input.description,
        category: input.category,
        amountPaise,
        date: new Date(`${input.date}T12:00:00.000Z`),
        paidById: input.paidById,
        shares: {
          create: makeShares(participantIds, amountPaise),
        },
      },
      include: {
        paidBy: true,
        shares: { include: { member: true } },
      },
    });

    res.status(201).json(formatExpense(expense));
  } catch (e) {
    next(e);
  }
});

// EDIT / UPDATE EXPENSE
app.put('/api/expenses/:id', async (req, res, next) => {
  const parsed = expenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid expense payload.',
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const participantIds = [...new Set(input.participantIds)];
  const amountPaise = Math.round(input.amount * 100);

  try {
    const current = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });

    if (!current) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    const valid = await validateMembers(
      input.paidById,
      participantIds,
    );

    if (!valid) {
      return res.status(400).json({
        error: 'Payer or participant does not exist.',
      });
    }

    const updated = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        description: input.description,
        category: input.category,
        amountPaise,
        date: new Date(`${input.date}T12:00:00.000Z`),
        paidById: input.paidById,
        shares: {
          deleteMany: {},
          create: makeShares(participantIds, amountPaise),
        },
      },
      include: {
        paidBy: true,
        shares: { include: { member: true } },
      },
    });

    res.json(formatExpense(updated));
  } catch (e) {
    next(e);
  }
});

// DELETE EXPENSE
app.delete('/api/expenses/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    // Pehle related shares, phir expense delete hoga.
    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({
        where: { expenseId: expense.id },
      });

      await tx.expense.delete({
        where: { id: expense.id },
      });
    });

    res.json({ message: 'Expense deleted successfully.' });
  } catch (e) {
    next(e);
  }
});

// DASHBOARD, BALANCES AND DEBT SIMPLIFICATION
app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const members = await prisma.member.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const expenses = await prisma.expense.findMany({
      include: {
        paidBy: true,
        shares: { include: { member: true } },
      },
      orderBy: { date: 'desc' },
    });

    const net = new Map<string, number>(
      members.map((m) => [m.id, 0]),
    );

    for (const expense of expenses) {
      net.set(
        expense.paidById,
        (net.get(expense.paidById) ?? 0) + expense.amountPaise,
      );

      for (const share of expense.shares) {
        net.set(
          share.memberId,
          (net.get(share.memberId) ?? 0) - share.sharePaise,
        );
      }
    }

    const balances = members.map((member) => ({
      memberId: member.id,
      name: member.name,
      balancePaise: net.get(member.id) ?? 0,
    }));

    const transfers = simplifyDebts(balances);

    res.json({
      members,
      balances: balances.map((b) => ({
        ...b,
        balance: b.balancePaise / 100,
      })),
      transfers: transfers.map((t) => ({
        ...t,
        amount: t.amountPaise / 100,
      })),
      totalSpending:
        expenses.reduce((sum, e) => sum + e.amountPaise, 0) / 100,
      expenses: expenses.map(formatExpense),
    });
  } catch (e) {
    next(e);
  }
});

// LOAD DEMO DATA
app.post('/api/demo/seed', async (_req, res, next) => {
  try {
    if (await prisma.member.count()) {
      return res.status(409).json({
        error: 'Database already contains members; seed skipped.',
      });
    }

    const names = ['Unnati', 'Riya', 'Aarav', 'Kabir', 'Neha'];

    const created = await Promise.all(
      names.map((name) => prisma.member.create({ data: { name } })),
    );

    const byName = new Map(created.map((m) => [m.name, m.id]));

    const rows = [
      ['Hotel Booking', 'Stay', 500000, 'Unnati', ['Unnati', 'Riya', 'Aarav', 'Kabir', 'Neha'], '2026-10-10'],
      ['Flight Tickets', 'Travel', 450000, 'Aarav', ['Unnati', 'Riya', 'Aarav'], '2026-10-11'],
      ['Pizza & Cafe Dinner', 'Food', 200000, 'Riya', ['Unnati', 'Riya', 'Kabir'], '2026-10-12'],
      ['Cab Rental', 'Travel', 160000, 'Kabir', ['Aarav', 'Kabir', 'Neha', 'Unnati'], '2026-10-13'],
      ['Scuba Activities', 'Adventure', 300000, 'Neha', ['Riya', 'Kabir', 'Neha'], '2026-10-14'],
    ] as const;

    for (const [description, category, amountPaise, payer, participants, date] of rows) {
      const paidById = byName.get(payer);

      if (!paidById) {
        throw new Error(`Demo payer not found: ${payer}`);
      }

      const participantIds = participants.map((name) => {
        const id = byName.get(name);
        if (!id) throw new Error(`Demo participant not found: ${name}`);
        return id;
      });

      await prisma.expense.create({
        data: {
          description,
          category,
          amountPaise,
          date: new Date(`${date}T12:00:00.000Z`),
          paidById,
          shares: {
            create: makeShares(participantIds, amountPaise),
          },
        },
      });
    }

    res.status(201).json({
      message: 'Demo trip seeded.',
      members: created.length,
      expenses: rows.length,
    });
  } catch (e) {
    next(e);
  }
});

// RESET DEMO DATA
app.post('/api/demo/reset', async (_req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany();
      await tx.expense.deleteMany();
      await tx.member.deleteMany();
    });

    res.json({ message: 'Demo data cleared.' });
  } catch (e) {
    next(e);
  }
});

// ERROR HANDLER
app.use((
  err: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`Smart Splitwise API listening on http://localhost:${port}`);
});
