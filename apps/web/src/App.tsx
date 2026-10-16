import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users, Plus, Trash2, CircleDollarSign, ArrowLeftRight, Zap, Search, Filter,
  CalendarDays, Download, Check, X, Pencil, FileText, BarChart3, RefreshCw,
  ArrowRight, Wallet, LayoutDashboard, ReceiptText
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'

type Member = {
  id: string
  name: string
}

type Expense = {
  id: string
  description: string
  category: string
  paidById: string
  paidByName: string
  amount: number
  date: string
  participantIds: string[]
  participants: string[]
}

type Transfer = {
  from: string
  to: string
  fromId: string
  toId: string
  amount: number
}

type Tab = 'overview' | 'expenses' | 'settlements' | 'insights'

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  'https://smart-splitwise-2.onrender.com'
).replace(/\/$/, '')

const CATEGORIES = [
  'Food',
  'Travel',
  'Stay',
  'Adventure',
  'Shopping',
  'Other'
]

const todayISO = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(n) ? n : 0)

const formatDate = (iso: string) => {
  if (!iso) return '—'

  const [y, m, d] = iso.slice(0, 10).split('-')

  return y && m && d ? `${d}-${m}-${y}` : iso
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    })
  } catch {
    throw new Error(
      `Backend se connection nahi ho raha. API URL check karein: ${API_BASE}`
    )
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`
    )
  }

  return payload as T
}

function buildTransfers(
  members: Member[],
  expenses: Expense[]
): Transfer[] {
  const net = new Map<string, number>(
    members.map(member => [member.id, 0])
  )

  for (const expense of expenses) {
    const participantIds = [...new Set(expense.participantIds)]
      .filter(id => net.has(id))

    if (!participantIds.length || !net.has(expense.paidById)) {
      continue
    }

    const share = expense.amount / participantIds.length

    net.set(
      expense.paidById,
      (net.get(expense.paidById) || 0) + expense.amount
    )

    participantIds.forEach(id => {
      net.set(id, (net.get(id) || 0) - share)
    })
  }

  const debtors = [...net.entries()]
    .map(([id, amount]) => ({ id, amount: -amount }))
    .filter(item => item.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)

  const creditors = [...net.entries()]
    .map(([id, amount]) => ({ id, amount }))
    .filter(item => item.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)

  const nameById = new Map(
    members.map(member => [member.id, member.name])
  )

  const result: Transfer[] = []

  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(
      debtors[i].amount,
      creditors[j].amount
    )

    if (amount > 0.005) {
      result.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        from: nameById.get(debtors[i].id) || 'Unknown',
        to: nameById.get(creditors[j].id) || 'Unknown',
        amount: Math.round(amount * 100) / 100
      })
    }

    debtors[i].amount -= amount
    creditors[j].amount -= amount

    if (debtors[i].amount < 0.005) i++
    if (creditors[j].amount < 0.005) j++
  }

  return result
}

function downloadCsv(
  rows: (string | number)[][],
  filename: string
) {
  const csv = rows
    .map(row =>
      row
        .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n')

  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  )

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

export default function App() {
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const [memberName, setMemberName] = useState('')
  const [showMemberInput, setShowMemberInput] = useState(false)

  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Food')
  const [paidById, setPaidById] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [participantIds, setParticipantIds] = useState<string[]>([])

  const [searchText, setSearchText] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async (showMessage = false) => {
    setLoading(true)

    try {
      const data = await apiRequest<{
        members: Member[]
        expenses: Expense[]
      }>('/api/dashboard')

      setMembers(Array.isArray(data.members) ? data.members : [])
      setExpenses(Array.isArray(data.expenses) ? data.expenses : [])

      if (showMessage) {
        setNotice('Data backend database se reload ho gaya.')
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Database se data load nahi hua.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const totalSpending = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  )

  const transfers = useMemo(
    () => buildTransfers(members, expenses),
    [members, expenses]
  )

  const categories = [
    'All',
    ...new Set(expenses.map(expense => expense.category))
  ]

  const filteredExpenses = expenses.filter(expense => {
    const q = searchText.toLowerCase().trim()

    const matchesText =
      !q ||
      [
        expense.description,
        expense.category,
        expense.paidByName,
        ...expense.participants
      ].some(value => value.toLowerCase().includes(q))

    return (
      matchesText &&
      (filterCategory === 'All' || expense.category === filterCategory) &&
      (!dateFrom || expense.date >= dateFrom) &&
      (!dateTo || expense.date <= dateTo)
    )
  })

  const balances = members.map(member => {
    let balance = 0

    expenses.forEach(expense => {
      const ids = [...new Set(expense.participantIds)].filter(
        id => members.some(m => m.id === id)
      )

      if (!ids.length) return

      if (expense.paidById === member.id) {
        balance += expense.amount
      }

      if (ids.includes(member.id)) {
        balance -= expense.amount / ids.length
      }
    })

    return {
      memberId: member.id,
      name: member.name,
      balance: Math.abs(balance) < 0.005 ? 0 : balance
    }
  })

  // Insights chart: total spending for each category.
  const categoryData = CATEGORIES.map(name => ({
    name,
    value: expenses
      .filter(expense => expense.category === name)
      .reduce((sum, expense) => sum + expense.amount, 0)
  })).filter(item => item.value > 0)

  const chartData = balances.map(balance => ({
    name: balance.name,
    balance: balance.balance
  }))

  async function addMember(e: FormEvent) {
    e.preventDefault()

    const name = memberName.trim()

    if (!name) return

    if (
      members.some(
        member => member.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setNotice('This member already exists.')
      return
    }

    setSaving(true)

    try {
      const member = await apiRequest<Member>('/api/members', {
        method: 'POST',
        body: JSON.stringify({ name })
      })

      setMembers(prev => [...prev, member])
      setMemberName('')
      setShowMemberInput(false)
      setNotice(`${member.name} database mein save ho gaya.`)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Member add nahi hua.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(id: string) {
    const member = members.find(item => item.id === id)

    if (!member) return

    if (!window.confirm(`${member.name} ko delete karna hai?`)) {
      return
    }

    setSaving(true)

    try {
      await apiRequest(`/api/members/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })

      setMembers(prev => prev.filter(item => item.id !== id))

      if (paidById === id) setPaidById('')

      setParticipantIds(prev => prev.filter(item => item !== id))

      setNotice(`${member.name} delete ho gaya.`)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Member delete nahi hua.'
      )
    } finally {
      setSaving(false)
    }
  }

  function resetExpenseForm() {
    setDescription('')
    setCategory('Food')
    setPaidById('')
    setAmount('')
    setDate(todayISO())
    setParticipantIds([])
    setEditingExpenseId(null)
  }

  async function saveExpense(e: FormEvent) {
    e.preventDefault()

    const value = Number(amount)
    const payer = members.find(member => member.id === paidById)

    const selected = [...new Set(participantIds)].filter(
      id => members.some(member => member.id === id)
    )

    if (!members.length) {
      setNotice('Pehle group mein members add karein.')
      return
    }

    if (!payer) {
      setNotice('Please select who paid.')
      return
    }

    if (!description.trim()) {
      setNotice('Expense description enter karein.')
      return
    }

    if (!Number.isFinite(value) || value <= 0) {
      setNotice('Amount zero se zyada hona chahiye.')
      return
    }

    if (!selected.length) {
      setNotice('Kam se kam ek participant select karein.')
      return
    }

    if (!date) {
      setNotice('Expense date select karein.')
      return
    }

    const payload = {
      description: description.trim(),
      category,
      paidById,
      amount: Math.round(value * 100) / 100,
      date,
      participantIds: selected
    }

    setSaving(true)

    try {
      if (editingExpenseId) {
        await apiRequest<Expense>(
          `/api/expenses/${encodeURIComponent(editingExpenseId)}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload)
          }
        )

        setNotice('Expense database mein update ho gaya.')
      } else {
        await apiRequest<Expense>('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        setNotice('Expense database mein save ho gaya.')
      }

      resetExpenseForm()
      await loadData()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Expense save nahi hua.'
      )
    } finally {
      setSaving(false)
    }
  }

  function startEdit(expense: Expense) {
    setDescription(expense.description)

    setCategory(
      CATEGORIES.includes(expense.category)
        ? expense.category
        : 'Other'
    )

    setPaidById(expense.paidById)
    setAmount(String(expense.amount))
    setDate(expense.date.slice(0, 10))

    setParticipantIds(
      expense.participantIds.filter(
        id => members.some(member => member.id === id)
      )
    )

    setEditingExpenseId(expense.id)
    setActiveTab('expenses')

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteExpense(id: string) {
    if (!window.confirm('Delete this expense?')) return

    setSaving(true)

    try {
      await apiRequest(`/api/expenses/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })

      if (editingExpenseId === id) {
        resetExpenseForm()
      }

      setNotice('Expense database se delete ho gaya.')
      await loadData()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Expense delete nahi hua.'
      )
    } finally {
      setSaving(false)
    }
  }

  function exportExpenses(list = filteredExpenses) {
    downloadCsv(
      [
        [
          'ID',
          'Description',
          'Category',
          'Paid By',
          'Amount INR',
          'Participants',
          'Date'
        ],
        ...list.map(expense => [
          expense.id,
          expense.description,
          expense.category,
          expense.paidByName,
          expense.amount,
          expense.participants.join('; '),
          formatDate(expense.date)
        ])
      ],
      'smart-splitwise-expenses.csv'
    )
  }

  function clearFilters() {
    setSearchText('')
    setFilterCategory('All')
    setDateFrom('')
    setDateTo('')
  }

  async function resetAll() {
    if (
      !window.confirm(
        'WARNING: Database ke saare members aur expenses delete ho jayenge. Continue?'
      )
    ) {
      return
    }

    setSaving(true)

    try {
      await apiRequest('/api/demo/reset', {
        method: 'POST'
      })

      setMembers([])
      setExpenses([])
      resetExpenseForm()
      clearFilters()

      setNotice('Database ka saara data delete ho gaya.')
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Database reset nahi hua.'
      )
    } finally {
      setSaving(false)
    }
  }

  const tabs: {
    id: Tab
    label: string
    icon: typeof LayoutDashboard
  }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: ReceiptText },
    { id: 'settlements', label: 'Settlements', icon: ArrowLeftRight },
    { id: 'insights', label: 'Insights', icon: BarChart3 }
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Wallet size={22} />
          </span>

          <span>
            Smart <b>Splitwise</b>
            <small>GROUP EXPENSES</small>
          </span>
        </div>

        <button
          className="add-member-btn"
          disabled={saving}
          onClick={() => {
            setShowMemberInput(value => !value)
            setNotice('')
          }}
        >
          <Plus size={17} /> Add Member
        </button>

        {showMemberInput && (
          <form className="add-member-form" onSubmit={addMember}>
            <input
              autoFocus
              value={memberName}
              onChange={e => setMemberName(e.target.value)}
              placeholder="Member name"
              maxLength={60}
              aria-label="Member name"
            />

            <button type="submit" disabled={saving} aria-label="Save member">
              <Check size={17} />
            </button>
          </form>
        )}

        <div className="side-divider" />

        <div className="member-heading">
          <span>
            <Users size={18} /> Current Members
          </span>
          <b className="count">{members.length}</b>
        </div>

        {members.length ? (
          <ul className="member-list">
            {members.map(member => (
              <li key={member.id}>
                <span className="member-dot" />
                <span className="member-name">{member.name}</span>

                <button
                  className="member-delete"
                  disabled={saving}
                  onClick={() => void removeMember(member.id)}
                  title={`Remove ${member.name}`}
                  aria-label={`Remove ${member.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="member-empty">
            <Users size={24} />
            <span>No members yet</span>
            <small>Click “Add Member” to start your group.</small>
          </div>
        )}

        <div className="side-divider" />

        <button
          className="reset-btn"
          disabled={saving}
          onClick={() => void resetAll()}
        >
          <Trash2 size={15} /> Reset All Data
        </button>

        <div className="sidebar-bottom">
          <span className="sparkle">✦</span>
          <b>Better planning.</b>
          <span>Happier trips!</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">GROUP EXPENSE MANAGER</span>
            <h1>Smart Splitwise</h1>
            <p>Track expenses, split fairly, settle easily.</p>
          </div>

          <div className="topbar-date">
            <CalendarDays size={16} />
            <span>{formatDate(todayISO())}</span>
          </div>
        </header>

        <nav className="tabs">
          {tabs.map(tab => {
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'tab active' : 'tab'}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={17} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss message"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {loading && (
          <div className="notice" role="status">
            Loading members and expenses from the database…
          </div>
        )}

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-icon green">
              <CircleDollarSign size={25} />
            </div>

            <div>
              <p>Total Group Spending</p>
              <strong>{money(totalSpending)}</strong>
              <small>{expenses.length} recorded expenses</small>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-icon blue">
              <ArrowLeftRight size={25} />
            </div>

            <div>
              <p>Suggested Transfers</p>
              <strong>{transfers.length} Transfers</strong>
              <small>After debt simplification</small>
            </div>
          </article>

          <article className="stat-card">
            <div className="stat-icon purple">
              <Zap size={25} />
            </div>

            <div>
              <p>Settlement Payments</p>
              <strong>{transfers.length} Payments</strong>
              <small>Optimized transfer plan</small>
            </div>
          </article>
        </section>

        {/* OVERVIEW: Only Group Members and Recent Expenses */}
        {activeTab === 'overview' && (
          <section className="overview-grid">
            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon blue-text">
                  <Users size={19} />
                </span>

                <h2>Group Members</h2>

                <button
                  className="small-action"
                  onClick={() => setShowMemberInput(true)}
                >
                  <Plus size={14} /> Add
                </button>
              </div>

              {members.length ? (
                <div className="overview-members">
                  {members.map(member => (
                    <div className="overview-member" key={member.id}>
                      <span className="avatar">
                        {member.name.slice(0, 1).toUpperCase()}
                      </span>

                      <span>{member.name}</span>

                      <small>
                        {
                          expenses.filter(
                            expense => expense.paidById === member.id
                          ).length
                        }{' '}
                        paid expenses
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Users size={28} />
                  <b>Your group is empty</b>
                  <span>Add your first member to start splitting expenses.</span>

                  <button
                    className="primary-button"
                    onClick={() => setShowMemberInput(true)}
                  >
                    <Plus size={16} /> Add First Member
                  </button>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon green-text">
                  <ReceiptText size={19} />
                </span>

                <h2>Recent Expenses</h2>

                <button
                  className="small-action"
                  onClick={() => setActiveTab('expenses')}
                >
                  View all <ArrowRight size={14} />
                </button>
              </div>

              {expenses.length ? (
                <div className="recent-list">
                  {expenses.slice(0, 5).map(expense => (
                    <div className="recent-row" key={expense.id}>
                      <span className="recent-icon">
                        <ReceiptText size={17} />
                      </span>

                      <div className="recent-details">
                        <b>{expense.description}</b>
                        <small>
                          {expense.paidByName} · {formatDate(expense.date)}
                        </small>
                      </div>

                      <strong>{money(expense.amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">
                  <ReceiptText size={27} />
                  <b>No expenses yet</b>
                  <span>Add members, then record a group expense.</span>

                  <button
                    className="secondary-button"
                    onClick={() => setActiveTab('expenses')}
                  >
                    Go to Expenses
                  </button>
                </div>
              )}
            </article>
          </section>
        )}

        {/* EXPENSES: Add Expense and Expense History appear only here */}
        {activeTab === 'expenses' && (
          <section className="expense-layout">
            <article className="panel form-panel">
              <div className="panel-heading">
                <span className="heading-icon blue-text">
                  {editingExpenseId ? (
                    <Pencil size={19} />
                  ) : (
                    <Plus size={19} />
                  )}
                </span>

                <h2>
                  {editingExpenseId ? 'Edit Expense' : 'Add New Expense'}
                </h2>
              </div>

              {!members.length ? (
                <div className="empty-state">
                  <Users size={28} />
                  <b>Add members first</b>
                  <span>
                    You need at least one member before you can record an expense.
                  </span>

                  <button
                    className="primary-button"
                    onClick={() => setShowMemberInput(true)}
                  >
                    <Plus size={16} /> Add Member
                  </button>
                </div>
              ) : (
                <form className="expense-form" onSubmit={saveExpense}>
                  <label className="field">
                    <span>Expense Description</span>
                    <input
                      required
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="e.g. Hotel Booking"
                      maxLength={120}
                    />
                  </label>

                  <label className="field">
                    <span>Category</span>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                    >
                      {CATEGORIES.map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Paid By</span>
                    <select
                      required
                      value={paidById}
                      onChange={e => setPaidById(e.target.value)}
                    >
                      <option value="">Select Member</option>
                      {members.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Amount (₹)</span>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </label>

                  <label className="field">
                    <span>
                      Date <small className="date-hint">DD-MM-YYYY</small>
                    </span>
                    <input
                      required
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </label>

                  <label className="field full">
                    <span>Split Equally Among</span>

                    <div className="participant-picker">
                      {members.map(member => (
                        <button
                          type="button"
                          key={member.id}
                          className={
                            participantIds.includes(member.id)
                              ? 'participant selected'
                              : 'participant'
                          }
                          onClick={() =>
                            setParticipantIds(prev =>
                              prev.includes(member.id)
                                ? prev.filter(id => id !== member.id)
                                : [...prev, member.id]
                            )
                          }
                        >
                          {member.name}

                          {participantIds.includes(member.id) ? (
                            <Check size={12} />
                          ) : (
                            <Plus size={12} />
                          )}
                        </button>
                      ))}
                    </div>

                    <small className="field-help">
                      Choose everyone who should share this expense.
                    </small>
                  </label>

                  <button
                    className="primary-button full"
                    type="submit"
                    disabled={saving}
                  >
                    <Check size={16} />
                    {saving
                      ? 'Saving…'
                      : editingExpenseId
                        ? 'Save Changes'
                        : 'Save Expense'}
                  </button>

                  {editingExpenseId && (
                    <button
                      className="secondary-button full"
                      type="button"
                      onClick={resetExpenseForm}
                    >
                      <X size={16} /> Cancel Editing
                    </button>
                  )}
                </form>
              )}
            </article>

            <article className="panel history-panel">
              <div className="panel-heading">
                <span className="heading-icon blue-text">
                  <FileText size={19} />
                </span>

                <h2>
                  Expense History{' '}
                  <small>
                    ({filteredExpenses.length} of {expenses.length})
                  </small>
                </h2>

                <button
                  className="icon-button"
                  title="Export filtered CSV"
                  onClick={() => exportExpenses()}
                >
                  <Download size={16} />
                </button>
              </div>

              <div className="expense-filters">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Search description, member..."
                    aria-label="Search expenses"
                  />
                </label>

                <label className="filter-field">
                  <Filter size={15} />
                  <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    aria-label="Filter by category"
                  >
                    {categories.map(item => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="date-filter">
                  <span>From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    aria-label="Start date"
                  />
                </label>

                <label className="date-filter">
                  <span>To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    aria-label="End date"
                  />
                </label>

                <button
                  className="secondary-button clear-button"
                  onClick={clearFilters}
                >
                  <X size={14} /> Clear Filters
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Paid By</th>
                      <th>Amount</th>
                      <th>Participants</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredExpenses.map(expense => (
                      <tr key={expense.id}>
                        <td className="id-cell">{expense.id.slice(-6)}</td>

                        <td className="expense-name">
                          {expense.description}
                        </td>

                        <td>
                          <span
                            className={`category-pill ${expense.category
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')}`}
                          >
                            {expense.category}
                          </span>
                        </td>

                        <td>{expense.paidByName}</td>

                        <td className="amount-cell">
                          {money(expense.amount)}
                        </td>

                        <td>
                          {expense.participants.length
                            ? expense.participants.join(', ')
                            : '—'}
                        </td>

                        <td className="date-cell">
                          {formatDate(expense.date)}
                        </td>

                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              title="Edit expense"
                              disabled={saving}
                              onClick={() => startEdit(expense)}
                            >
                              <Pencil size={14} />
                            </button>

                            <button
                              className="icon-button danger"
                              title="Delete expense"
                              disabled={saving}
                              onClick={() => void deleteExpense(expense.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!filteredExpenses.length && (
                      <tr>
                        <td colSpan={8} className="empty-cell">
                          {expenses.length
                            ? 'No expenses match your search or filters.'
                            : 'No expenses recorded yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="history-note">
                Dates are displayed as DD-MM-YYYY. Data is loaded from the backend.
              </p>
            </article>
          </section>
        )}

        {/* SETTLEMENTS */}
        {activeTab === 'settlements' && (
          <section className="two-column">
            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon green-text">
                  <Check size={19} />
                </span>
                <h2>Who Pays Whom</h2>
              </div>

              {transfers.length ? (
                <div className="transfer-list">
                  {transfers.map((transfer, index) => (
                    <div
                      className="transfer-row"
                      key={`${transfer.fromId}-${transfer.toId}-${index}`}
                    >
                      <span className="transfer-arrow">
                        <ArrowRight size={16} />
                      </span>

                      <b>{transfer.from}</b>
                      <span className="pays">pays</span>
                      <strong>{money(transfer.amount)}</strong>
                      <span className="to">to</span>
                      <b>{transfer.to}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <ArrowLeftRight size={28} />
                  <b>No transfers to show</b>
                  <span>
                    Add members and shared expenses to calculate settlements.
                  </span>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon blue-text">
                  <Wallet size={19} />
                </span>
                <h2>Net Balance per Person</h2>
              </div>

              {balances.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Net Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {balances.map(balance => {
                        const settled = Math.abs(balance.balance) < 0.01
                        const positive = balance.balance > 0

                        return (
                          <tr key={balance.memberId}>
                            <td>{balance.name}</td>

                            <td
                              className={
                                settled
                                  ? 'settled'
                                  : positive
                                    ? 'positive'
                                    : 'negative'
                              }
                            >
                              {positive ? '+' : ''}
                              {money(balance.balance)}
                            </td>

                            <td>
                              <span
                                className={`balance-status ${
                                  settled
                                    ? 'settled'
                                    : positive
                                      ? 'gets-back'
                                      : 'owes'
                                }`}
                              />
                              {settled
                                ? 'Settled'
                                : positive
                                  ? 'Gets back'
                                  : 'Owes'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <Users size={26} />
                  <span>No members added yet.</span>
                </div>
              )}
            </article>
          </section>
        )}

        {/* INSIGHTS: All three articles have correctly closed JSX tags */}
        {activeTab === 'insights' && (
          <section className="two-column">
            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon blue-text">
                  <BarChart3 size={19} />
                </span>
                <h2>Net Balance Overview</h2>
              </div>

              {chartData.length ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: unknown) =>
                          money(Number(value ?? 0))
                        }
                      />
                      <ReferenceLine y={0} stroke="#9baac0" />
                      <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                        {chartData.map((item, index) => (
                          <Cell
                            key={index}
                            fill={
                              item.balance >= 0 ? '#37c68b' : '#ff5265'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-state">
                  <BarChart3 size={28} />
                  <span>Add members and expenses to see insights.</span>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon green-text">
                  <CircleDollarSign size={19} />
                </span>
                <h2>Spending by Category</h2>
              </div>

              {categoryData.length ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: unknown) =>
                          money(Number(value ?? 0))
                        }
                      />
                      <Bar
                        dataKey="value"
                        fill="#37c68b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-state">
                  <BarChart3 size={28} />
                  <span>
                    Record expenses to see category-wise spending.
                  </span>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="heading-icon green-text">
                  <CircleDollarSign size={19} />
                </span>
                <h2>Group Summary &amp; Report</h2>
              </div>

              <div className="insight-list">
                <div>
                  <span>Total recorded expenses</span>
                  <strong>{expenses.length}</strong>
                </div>

                <div>
                  <span>Total group spending</span>
                  <strong>{money(totalSpending)}</strong>
                </div>

                <div>
                  <span>Average expense</span>
                  <strong>
                    {money(
                      expenses.length
                        ? totalSpending / expenses.length
                        : 0
                    )}
                  </strong>
                </div>

                <div>
                  <span>Highest expense</span>
                  <strong>
                    {money(
                      Math.max(0, ...expenses.map(item => item.amount))
                    )}
                  </strong>
                </div>

                <div>
                  <span>Members in group</span>
                  <strong>{members.length}</strong>
                </div>

                <div>
                  <span>Suggested transfers</span>
                  <strong>{transfers.length}</strong>
                </div>

                <button
                  className="primary-button"
                  onClick={() => exportExpenses(expenses)}
                >
                  <Download size={16} />
                  Export Expense Report (CSV)
                </button>
              </div>
            </article>
          </section>
        )}

        <footer className="app-footer">
          <span>Smart Splitwise · React portfolio project</span>

          <span>
            <span className="footer-dot" />
            Backend database mode
          </span>

          <button
            disabled={loading || saving}
            onClick={() => void loadData(true)}
          >
            <RefreshCw size={13} />
            Reload From Database
          </button>
        </footer>
      </main>
    </div>
  )
}