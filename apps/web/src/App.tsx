import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Users, Plus, Trash2, CircleDollarSign, ArrowLeftRight, Zap, Search, Filter,
  CalendarDays, Download, Check, X, Pencil, FileText, BarChart3, RefreshCw,
  ArrowRight, Wallet, LayoutDashboard, ReceiptText
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine
} from 'recharts'

type Member = { id: string; name: string }
type Expense = {
  id: string; description: string; category: string; paidById: string;
  paidByName: string; amount: number; date: string; participantIds: string[];
  participants: string[]
}
type Transfer = { from: string; to: string; fromId: string; toId: string; amount: number }
type Tab = 'overview' | 'expenses' | 'settlements' | 'insights'

const STORAGE_KEY = 'smart-splitwise-v2'
const CATEGORIES = ['Food', 'Travel', 'Stay', 'Adventure', 'Shopping', 'Other']
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const money = (n: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number.isFinite(n) ? n : 0)
const formatDate = (iso: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}-${m}-${y}` : iso
}
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const safeLoad = (): { members: Member[]; expenses: Expense[] } => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { members: [], expenses: [] }
    const data = JSON.parse(raw)
    return {
      members: Array.isArray(data.members) ? data.members : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : []
    }
  } catch { return { members: [], expenses: [] } }
}
function buildTransfers(members: Member[], expenses: Expense[]): Transfer[] {
  const net = new Map<string, number>(members.map(m => [m.id, 0]))
  for (const e of expenses) {
    const participants = e.participantIds.filter(id => net.has(id))
    if (!participants.length || !net.has(e.paidById)) continue
    const share = e.amount / participants.length
    net.set(e.paidById, (net.get(e.paidById) || 0) + e.amount)
    participants.forEach(id => net.set(id, (net.get(id) || 0) - share))
  }
  const debtors = [...net.entries()].map(([id, amount]) => ({ id, amount: -amount }))
    .filter(x => x.amount > 0.005).sort((a, b) => b.amount - a.amount)
  const creditors = [...net.entries()].map(([id, amount]) => ({ id, amount }))
    .filter(x => x.amount > 0.005).sort((a, b) => b.amount - a.amount)
  const nameById = new Map(members.map(m => [m.id, m.name]))
  const result: Transfer[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    if (amount > 0.005) result.push({
      fromId: debtors[i].id, toId: creditors[j].id,
      from: nameById.get(debtors[i].id) || 'Unknown',
      to: nameById.get(creditors[j].id) || 'Unknown',
      amount: Math.round(amount * 100) / 100
    })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if (debtors[i].amount < 0.005) i++
    if (creditors[j].amount < 0.005) j++
  }
  return result
}
function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export default function App() {
  const initial = useMemo(safeLoad, [])
  const [members, setMembers] = useState<Member[]>(initial.members)
  const [expenses, setExpenses] = useState<Expense[]>(initial.expenses)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [memberName, setMemberName] = useState('')
  const [showMemberInput, setShowMemberInput] = useState(false)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Food')
  const [customCategory, setCustomCategory] = useState('')
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ members, expenses }))
  }, [members, expenses])

  const totalSpending = expenses.reduce((sum, e) => sum + e.amount, 0)
  const transfers = useMemo(() => buildTransfers(members, expenses), [members, expenses])
  const categories = ['All', ...new Set(expenses.map(e => e.category))]
  const filteredExpenses = expenses.filter(e => {
    const q = searchText.toLowerCase().trim()
    const matchesText = !q || [e.description, e.category, e.paidByName, ...e.participants].some(s => s.toLowerCase().includes(q))
    return matchesText && (filterCategory === 'All' || e.category === filterCategory) &&
      (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo)
  })
  const balances = members.map(m => {
    let balance = 0
    expenses.forEach(e => {
      const ids = e.participantIds.filter(id => members.some(member => member.id === id))
      if (!ids.length) return
      if (e.paidById === m.id) balance += e.amount
      if (ids.includes(m.id)) balance -= e.amount / ids.length
    })
    return { memberId: m.id, name: m.name, balance: Math.abs(balance) < 0.005 ? 0 : balance }
  })
  const categoryData = CATEGORIES.map(c => ({
  name: c, value: expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0)
})).filter(x => x.value > 0)
  const chartData = balances.map(b => ({ name: b.name, balance: b.balance }))

  function addMember(e: FormEvent) {
    e.preventDefault()
    const name = memberName.trim()
    if (!name) return
    if (members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      setNotice('This member already exists.'); return
    }
    const member = { id: makeId(), name }
    setMembers(prev => [...prev, member])
    setMemberName('')
    setShowMemberInput(false)
    setNotice(`${name} added successfully.`)
  }
  function removeMember(id: string) {
    const member = members.find(m => m.id === id)
    if (!member) return
    if (expenses.some(e => e.paidById === id || e.participantIds.includes(id))) {
      setNotice(`Cannot remove ${member.name} because they are used in an expense. Delete or edit those expenses first.`)
      return
    }
    setMembers(prev => prev.filter(m => m.id !== id))
    if (paidById === id) setPaidById('')
    setParticipantIds(prev => prev.filter(x => x !== id))
    setNotice(`${member.name} removed.`)
  }
  function resetExpenseForm() {
    setDescription(''); setCategory('Food'); setCustomCategory('')
    setPaidById(''); setAmount(''); setDate(todayISO()); setParticipantIds([])
    setEditingExpenseId(null)
  }
  function saveExpense(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    const payer = members.find(m => m.id === paidById)
    const selected = participantIds.filter(id => members.some(m => m.id === id))
    if (!members.length) { setNotice('Please add a member before creating an expense.'); return }
    if (!payer) { setNotice('Please select who paid.'); return }
    if (!description.trim()) { setNotice('Please enter an expense description.'); return }
    if (!Number.isFinite(value) || value <= 0) { setNotice('Enter an amount greater than zero.'); return }
    if (!selected.length) { setNotice('Select at least one member to split this expense.'); return }
    if (!date) { setNotice('Please select an expense date.'); return }
    const finalCategory = category === 'Other' && customCategory.trim() ? customCategory.trim() : category
    const item: Expense = {
      id: editingExpenseId || makeId(), description: description.trim(), category: finalCategory,
      paidById, paidByName: payer.name, amount: Math.round(value * 100) / 100,
      date, participantIds: selected, participants: selected.map(id => members.find(m => m.id === id)?.name || '')
    }
    setExpenses(prev => editingExpenseId ? prev.map(x => x.id === editingExpenseId ? item : x) : [item, ...prev])
    resetExpenseForm()
    setNotice(editingExpenseId ? 'Expense updated.' : 'Expense saved successfully.')
  }
  function startEdit(item: Expense) {
    setDescription(item.description)
    setCategory(CATEGORIES.includes(item.category) ? item.category : 'Other')
    setCustomCategory(CATEGORIES.includes(item.category) ? '' : item.category)
    setPaidById(item.paidById); setAmount(String(item.amount)); setDate(item.date)
    setParticipantIds(item.participantIds.filter(id => members.some(m => m.id === id)))
    setEditingExpenseId(item.id); setActiveTab('expenses')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function deleteExpense(id: string) {
    if (!window.confirm('Delete this expense?')) return
    setExpenses(prev => prev.filter(e => e.id !== id))
    if (editingExpenseId === id) resetExpenseForm()
    setNotice('Expense deleted.')
  }
  function exportExpenses(list = filteredExpenses) {
    downloadCsv([
      ['ID', 'Description', 'Category', 'Paid By', 'Amount INR', 'Participants', 'Date'],
      ...list.map(e => [e.id, e.description, e.category, e.paidByName, e.amount, e.participants.join('; '), formatDate(e.date)])
    ], 'smart-splitwise-expenses.csv')
  }
  function clearFilters() {
    setSearchText(''); setFilterCategory('All'); setDateFrom(''); setDateTo('')
  }
  function resetAll() {
    if (!window.confirm('Reset all members and expenses? This cannot be undone.')) return
    setMembers([]); setExpenses([]); resetExpenseForm(); clearFilters()
    setNotice('All app data has been reset.')
  }
  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: ReceiptText },
    { id: 'settlements', label: 'Settlements', icon: ArrowLeftRight },
    { id: 'insights', label: 'Insights', icon: BarChart3 }
  ]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Wallet size={22}/></span><span>Smart <b>Splitwise</b><small>GROUP EXPENSES</small></span></div>
      <button className="add-member-btn" onClick={() => { setShowMemberInput(v => !v); setNotice('') }}><Plus size={17}/> Add Member</button>
      {showMemberInput && <form className="add-member-form" onSubmit={addMember}>
        <input autoFocus value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Member name" maxLength={60} aria-label="Member name"/>
        <button type="submit" aria-label="Save member"><Check size={17}/></button>
      </form>}
      <div className="side-divider"/>
      <div className="member-heading"><span><Users size={18}/> Current Members</span><b className="count">{members.length}</b></div>
      {members.length ? <ul className="member-list">{members.map(m => <li key={m.id}><span className="member-dot"/><span className="member-name">{m.name}</span><button className="member-delete" onClick={() => removeMember(m.id)} title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`}><Trash2 size={14}/></button></li>)}</ul> :
        <div className="member-empty"><Users size={24}/><span>No members yet</span><small>Click “Add Member” to start your group.</small></div>}
      <div className="side-divider"/>
      <button className="reset-btn" onClick={resetAll}><Trash2 size={15}/> Reset All Data</button>
      <div className="sidebar-bottom"><span className="sparkle">✦</span><b>Better planning.</b><span>Happier trips!</span></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">GROUP EXPENSE MANAGER</span><h1>Smart Splitwise</h1><p>Track expenses, split fairly, settle easily.</p></div><div className="topbar-date"><CalendarDays size={16}/><span>{formatDate(todayISO())}</span></div></header>
      <nav className="tabs">{tabs.map(t => { const Icon = t.icon; return <button key={t.id} className={activeTab === t.id ? 'tab active' : 'tab'} onClick={() => setActiveTab(t.id)}><Icon size={17}/>{t.label}</button> })}</nav>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16}/></button></div>}
      <section className="stats-grid">
        <article className="stat-card"><div className="stat-icon green"><CircleDollarSign size={25}/></div><div><p>Total Group Spending</p><strong>{money(totalSpending)}</strong><small>{expenses.length} recorded expenses</small></div></article>
        <article className="stat-card"><div className="stat-icon blue"><ArrowLeftRight size={25}/></div><div><p>Suggested Transfers</p><strong>{transfers.length} Transfers</strong><small>After debt simplification</small></div></article>
        <article className="stat-card"><div className="stat-icon purple"><Zap size={25}/></div><div><p>Settlement Payments</p><strong>{transfers.length} Payments</strong><small>Optimized transfer plan</small></div></article>
      </section>

      {activeTab === 'overview' && <section className="overview-grid">
        <article className="panel"><div className="panel-heading"><span className="heading-icon blue-text"><Users size={19}/></span><h2>Group Members</h2><button className="small-action" onClick={() => setShowMemberInput(true)}><Plus size={14}/> Add</button></div>
          {members.length ? <div className="overview-members">{members.map(m => <div className="overview-member" key={m.id}><span className="avatar">{m.name.slice(0,1).toUpperCase()}</span><span>{m.name}</span><small>{expenses.filter(e => e.paidById === m.id).length} paid expenses</small></div>)}</div> : <div className="empty-state"><Users size={28}/><b>Your group is empty</b><span>Add your first member to start splitting expenses.</span><button className="primary-button" onClick={() => setShowMemberInput(true)}><Plus size={16}/> Add First Member</button></div>}
        </article>
        <article className="panel"><div className="panel-heading"><span className="heading-icon green-text"><ReceiptText size={19}/></span><h2>Recent Expenses</h2><button className="small-action" onClick={() => setActiveTab('expenses')}>View all <ArrowRight size={14}/></button></div>
          {expenses.length ? <div className="recent-list">{expenses.slice(0, 5).map(e => <div className="recent-row" key={e.id}><span className="recent-icon"><ReceiptText size={17}/></span><div className="recent-details"><b>{e.description}</b><small>{e.paidByName} · {formatDate(e.date)}</small></div><strong>{money(e.amount)}</strong></div>)}</div> : <div className="empty-state compact"><ReceiptText size={27}/><b>No expenses yet</b><span>Add members, then record a group expense.</span><button className="secondary-button" onClick={() => setActiveTab('expenses')}>Go to Expenses</button></div>}
        </article>
      </section>}

      {activeTab === 'expenses' && <section className="expense-layout">
        <article className="panel form-panel"><div className="panel-heading"><span className="heading-icon blue-text">{editingExpenseId ? <Pencil size={19}/> : <Plus size={19}/>}</span><h2>{editingExpenseId ? 'Edit Expense' : 'Add New Expense'}</h2></div>
          {!members.length ? <div className="empty-state"><Users size={28}/><b>Add members first</b><span>You need at least one member before you can record an expense.</span><button className="primary-button" onClick={() => setShowMemberInput(true)}><Plus size={16}/> Add Member</button></div> :
          <form className="expense-form" onSubmit={saveExpense}>
            <label className="field"><span>Expense Description</span><input required value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Hotel Booking" maxLength={120}/></label>
            <label className="field"><span>Category</span><select value={category} onChange={e => {setCategory(e.target.value);setCustomCategory('')}}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
            {category === 'Other' && <label className="field"><span>Custom Category</span><input required value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="e.g. Miscellaneous" maxLength={50}/></label>}
            <label className="field"><span>Paid By</span><select required value={paidById} onChange={e => setPaidById(e.target.value)}><option value="">Select Member</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className="field"><span>Amount (₹)</span><input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount"/></label>
            <label className="field"><span>Date <small className="date-hint">DD-MM-YYYY</small></span><input required type="date" value={date} onChange={e => setDate(e.target.value)} lang="en-CA"/></label>
            <label className="field full"><span>Split Equally Among</span><div className="participant-picker">{members.map(m => <button type="button" key={m.id} className={participantIds.includes(m.id) ? 'participant selected' : 'participant'} onClick={() => setParticipantIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])}>{m.name}{participantIds.includes(m.id) ? <Check size={12}/> : <Plus size={12}/>}</button>)}</div><small className="field-help">Choose everyone who should share this expense.</small></label>
            <button className="primary-button full" type="submit"><Check size={16}/>{editingExpenseId ? 'Save Changes' : 'Save Expense'}</button>
            {editingExpenseId && <button className="secondary-button full" type="button" onClick={resetExpenseForm}><X size={16}/> Cancel Editing</button>}
          </form>}
        </article>

        <article className="panel history-panel"><div className="panel-heading"><span className="heading-icon blue-text"><FileText size={19}/></span><h2>Expense History <small>({filteredExpenses.length} of {expenses.length})</small></h2><button className="icon-button" title="Export filtered CSV" onClick={() => exportExpenses()}><Download size={16}/></button></div>
          <div className="expense-filters">
            <label className="search-field"><Search size={16}/><input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search description, member..." aria-label="Search expenses"/></label>
            <label className="filter-field"><Filter size={15}/><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} aria-label="Filter by category">{categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="date-filter"><span>From</span><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="Start date"/></label>
            <label className="date-filter"><span>To</span><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="End date"/></label>
            <button className="secondary-button clear-button" onClick={clearFilters}><X size={14}/> Clear Filters</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>ID</th><th>Description</th><th>Category</th><th>Paid By</th><th>Amount</th><th>Participants</th><th>Date</th><th>Actions</th></tr></thead><tbody>
            {filteredExpenses.map(e => <tr key={e.id}><td className="id-cell">{e.id.slice(-6)}</td><td className="expense-name">{e.description}</td><td><span className={`category-pill ${e.category.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}>{e.category}</span></td><td>{e.paidByName}</td><td className="amount-cell">{money(e.amount)}</td><td>{e.participants.length ? e.participants.join(', ') : '—'}</td><td className="date-cell">{formatDate(e.date)}</td><td><div className="row-actions"><button className="icon-button" title="Edit expense" onClick={() => startEdit(e)}><Pencil size={14}/></button><button className="icon-button danger" title="Delete expense" onClick={() => deleteExpense(e.id)}><Trash2 size={14}/></button></div></td></tr>)}
            {!filteredExpenses.length && <tr><td colSpan={8} className="empty-cell">{expenses.length ? 'No expenses match your search or filters.' : 'No expenses recorded yet.'}</td></tr>}
          </tbody></table></div>
          <p className="history-note">Dates are displayed as DD-MM-YYYY. Your demo data is saved in this browser.</p>
        </article>
      </section>}

      {activeTab === 'settlements' && <section className="two-column">
        <article className="panel"><div className="panel-heading"><span className="heading-icon green-text"><Check size={19}/></span><h2>Who Pays Whom</h2></div>
          {transfers.length ? <div className="transfer-list">{transfers.map((t,i) => <div className="transfer-row" key={`${t.fromId}-${t.toId}-${i}`}><span className="transfer-arrow"><ArrowRight size={16}/></span><b>{t.from}</b><span className="pays">pays</span><strong>{money(t.amount)}</strong><span className="to">to</span><b>{t.to}</b></div>)}</div> : <div className="empty-state"><ArrowLeftRight size={28}/><b>No transfers to show</b><span>Add members and shared expenses to calculate settlements.</span></div>}
        </article>
        <article className="panel"><div className="panel-heading"><span className="heading-icon blue-text"><Wallet size={19}/></span><h2>Net Balance per Person</h2></div>
          {balances.length ? <div className="table-wrap"><table><thead><tr><th>Member</th><th>Net Balance</th><th>Status</th></tr></thead><tbody>{balances.map(b => {const settled = Math.abs(b.balance) < .01, positive = b.balance > 0;return <tr key={b.memberId}><td>{b.name}</td><td className={settled ? 'settled' : positive ? 'positive' : 'negative'}>{positive ? '+' : ''}{money(b.balance)}</td><td><span className={`balance-status ${settled ? 'settled' : positive ? 'gets-back' : 'owes'}`}/>{settled ? 'Settled' : positive ? 'Gets back' : 'Owes'}</td></tr>})}</tbody></table></div> : <div className="empty-state"><Users size={26}/><span>No members added yet.</span></div>}
        </article>
      </section>}

      {activeTab === 'insights' && <section className="two-column">
        <article className="panel"><div className="panel-heading"><span className="heading-icon blue-text"><BarChart3 size={19}/></span><h2>Net Balance Overview</h2></div>
          {chartData.length ? <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={(v: unknown) => money(Number(v ?? 0))}/><ReferenceLine y={0} stroke="#9baac0"/><Bar dataKey="balance" radius={[4,4,0,0]}>{chartData.map((d,i)=><Cell key={i} fill={d.balance >= 0 ? '#37c68b' : '#ff5265'}/>)}</Bar></BarChart></ResponsiveContainer></div> : <div className="empty-state"><BarChart3 size={28}/><span>Add members and expenses to see insights.</span></div>}
        </article>
        <article className="panel"><div className="panel-heading"><span className="heading-icon green-text"><CircleDollarSign size={19}/></span><h2>Group Summary & Report</h2></div>
          <div className="insight-list"><div><span>Total recorded expenses</span><strong>{expenses.length}</strong></div><div><span>Total group spending</span><strong>{money(totalSpending)}</strong></div><div><span>Average expense</span><strong>{money(expenses.length ? totalSpending / expenses.length : 0)}</strong></div><div><span>Highest expense</span><strong>{money(Math.max(0,...expenses.map(e => e.amount)))}</strong></div><div><span>Members in group</span><strong>{members.length}</strong></div><div><span>Suggested transfers</span><strong>{transfers.length}</strong></div><button className="primary-button" onClick={() => exportExpenses(expenses)}><Download size={16}/> Export Expense Report (CSV)</button></div>
        </article>
      </section>}
      <footer className="app-footer"><span>Smart Splitwise · React portfolio project</span><span><span className="footer-dot"/> Local demo mode · Auto-saved</span><button onClick={() => {setMembers(safeLoad().members);setExpenses(safeLoad().expenses);setNotice('Saved browser data reloaded.')}}><RefreshCw size={13}/> Reload Saved Data</button></footer>
    </main>
  </div>
}