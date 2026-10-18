import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Package, RefreshCcw, Save, Search, ShieldCheck, Users, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../services/api'
import {
  adminApproveStorageExpansion,
  adminConfirmStoragePayment,
  adminListStorageExpansionRequests,
  adminListStoragePlans,
  adminListStorageUsers,
  adminQuoteStorageExpansion,
  adminRejectStorageExpansion,
  adminSetStorageUserQuota,
  adminUpdateStoragePlan,
  type StorageAdminUserItem,
  type StorageExpansionPlanItem,
  type StorageExpansionRequestItem,
} from '../services/billing'

const MIB = 1024 ** 2

type Tab = 'orders' | 'plans' | 'users'

function formatStorage(bytes: number) {
  const gib = bytes / (1024 ** 3)
  return gib >= 1 ? `${gib.toFixed(gib >= 10 ? 0 : 1)} GB` : `${(bytes / MIB).toFixed(0)} MB`
}

function formatMoney(cents: number | null | undefined, currency: string) {
  if (cents == null) return '未报价'
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export function AdminStoragePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('orders')
  const [items, setItems] = useState<StorageExpansionRequestItem[]>([])
  const [plans, setPlans] = useState<StorageExpansionPlanItem[]>([])
  const [users, setUsers] = useState<StorageAdminUserItem[]>([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [quotes, setQuotes] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [planDrafts, setPlanDrafts] = useState<Record<string, { name: string; quotaMb: string; priceYuan: string; description: string; active: boolean }>>({})
  const [userSearch, setUserSearch] = useState('')
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({})
  const [quotaReasons, setQuotaReasons] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    try {
      const [ordersResponse, plansResponse, usersResponse] = await Promise.all([
        adminListStorageExpansionRequests(),
        adminListStoragePlans(),
        adminListStorageUsers(userSearch),
      ])
      setItems(ordersResponse.data)
      setPlans(plansResponse.data)
      setUsers(usersResponse.data)
      setPlanDrafts(Object.fromEntries(plansResponse.data.map((plan) => [plan.id, {
        name: plan.name,
        quotaMb: String(plan.quota_mb),
        priceYuan: String(plan.price_cents / 100),
        description: plan.description || '',
        active: plan.is_active,
      }])))
      setError('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '读取空间管理数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const visible = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'active') return items.filter((item) => item.status === 'pending' || item.status === 'quoted')
    return items.filter((item) => item.status === filter)
  }, [items, filter])

  const act = async (id: string, action: () => Promise<unknown>, message?: string) => {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      await action()
      if (message) setNotice(message)
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '操作失败，请稍后重试')
    } finally {
      setBusyId('')
    }
  }

  const quote = (item: StorageExpansionRequestItem) => {
    const raw = quotes[item.id] ?? (item.quoted_price_cents != null ? String(item.quoted_price_cents / 100) : '')
    const yuan = Number(raw)
    if (!Number.isFinite(yuan) || yuan < 0) {
      setError('请输入正确的报价金额')
      return
    }
    void act(item.id, () => adminQuoteStorageExpansion(item.id, Math.round(yuan * 100), 'CNY', notes[item.id]), '报价已保存')
  }

  const savePlan = (plan: StorageExpansionPlanItem) => {
    const draft = planDrafts[plan.id]
    if (!draft) return
    const quotaMb = Number(draft.quotaMb)
    const priceYuan = Number(draft.priceYuan)
    if (!Number.isFinite(quotaMb) || quotaMb <= 20 || !Number.isFinite(priceYuan) || priceYuan < 0) {
      setError('套餐容量或价格不正确')
      return
    }
    void act(plan.id, () => adminUpdateStoragePlan(plan.id, {
      name: draft.name.trim(),
      quota_mb: Math.round(quotaMb),
      price_cents: Math.round(priceYuan * 100),
      currency: 'CNY',
      description: draft.description.trim() || null,
      is_active: draft.active,
    }), '套餐配置已保存')
  }

  const updateQuota = (user: StorageAdminUserItem) => {
    const quotaMb = Number(quotaDrafts[user.id] ?? Math.round(user.storage_quota_bytes / MIB))
    const reason = (quotaReasons[user.id] || '').trim()
    if (!Number.isFinite(quotaMb) || quotaMb < 20) {
      setError('用户容量不能小于 20MB')
      return
    }
    if (reason.length < 2) {
      setError('手工调整容量必须填写原因，便于审计')
      return
    }
    void act(user.id, () => adminSetStorageUserQuota(user.id, Math.round(quotaMb), reason), '用户容量已更新')
  }

  const searchUsers = async () => {
    setLoading(true)
    try {
      const response = await adminListStorageUsers(userSearch)
      setUsers(response.data)
      setError('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '搜索用户失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-storage-page">
      <header className="admin-storage-topbar">
        <button onClick={() => navigate('/app')}><ArrowLeft />返回工作台</button>
        <div><ShieldCheck /><span><strong>空间与扩容管理</strong><small>套餐、订单、收款、用户容量统一管理</small></span></div>
        <button onClick={() => void load()} disabled={loading}><RefreshCcw />刷新</button>
      </header>

      <section className="admin-storage-content">
        <div className="admin-storage-summary">
          <div><span>待处理订单</span><strong>{items.filter((item) => item.status === 'pending' || item.status === 'quoted').length}</strong></div>
          <div><span>待核款</span><strong>{items.filter((item) => item.payment_status === 'submitted').length}</strong></div>
          <div><span>启用套餐</span><strong>{plans.filter((plan) => plan.is_active).length}</strong></div>
        </div>

        <div className="admin-storage-tabs">
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ShieldCheck />扩容订单</button>
          <button className={tab === 'plans' ? 'active' : ''} onClick={() => setTab('plans')}><Package />套餐配置</button>
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users />用户容量</button>
        </div>

        {error && <div className="admin-storage-error">{error}</div>}
        {notice && <div className="admin-storage-notice">{notice}</div>}

        {tab === 'orders' && (
          <>
            <div className="admin-storage-filters">
              {[
                ['active', '待处理'], ['pending', '待报价'], ['quoted', '已报价'], ['approved', '已批准'], ['rejected', '已拒绝'], ['all', '全部'],
              ].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
            </div>

            {loading && !items.length && <div className="route-loading">正在读取扩容订单…</div>}
            {!loading && !visible.length && <div className="admin-storage-empty">当前没有符合条件的扩容订单</div>}

            <div className="admin-storage-list">
              {visible.map((item) => {
                const disabled = busyId === item.id
                return (
                  <article className="admin-storage-card" key={item.id}>
                    <div className="admin-storage-user">
                      <div><strong>{item.user?.name || '用户'}</strong><small>{item.user?.email} · 订单 {item.order_no}</small></div>
                      <span className={`storage-status ${item.status} ${item.payment_status}`}>{item.status === 'pending' ? '待报价' : item.status === 'quoted' ? (item.payment_status === 'confirmed' ? '已确认付款' : item.payment_status === 'submitted' ? '待核款' : '待付款') : item.status === 'approved' ? '已批准' : '已拒绝'}</span>
                    </div>

                    <div className="admin-storage-quota">
                      <div><span>当前</span><strong>{formatStorage(item.current_quota_bytes)}</strong></div>
                      <b>→</b>
                      <div><span>{item.plan_name ? '套餐' : '申请'}</span><strong>{item.plan_name || formatStorage(item.requested_quota_bytes)}</strong></div>
                      <div><span>金额</span><strong>{formatMoney(item.quoted_price_cents, item.currency)}</strong></div>
                    </div>

                    {item.note && <p className="admin-storage-note">用户备注：{item.note}</p>}
                    {item.payment_reference && <p className="admin-storage-note">付款备注：{item.payment_reference}</p>}
                    {!!item.payment_records?.length && (
                      <div className="admin-payment-timeline">
                        {item.payment_records.map((record) => <span key={record.id}>{new Date(record.created_at).toLocaleString()} · {record.event_type === 'submitted' ? '用户提交付款' : record.event_type === 'confirmed' ? '管理员确认收款' : record.event_type}</span>)}
                      </div>
                    )}

                    {item.status !== 'approved' && item.status !== 'rejected' && (
                      <div className="admin-storage-controls">
                        {!item.plan_id && <label>报价（元）<input type="number" min="0" step="0.01" value={quotes[item.id] ?? (item.quoted_price_cents != null ? String(item.quoted_price_cents / 100) : '')} onChange={(event) => setQuotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="例如 9.90" /></label>}
                        <label>管理员备注<input value={notes[item.id] ?? item.admin_note ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="付款方式或说明" /></label>
                        <div className="admin-storage-actions">
                          {!item.plan_id && <button disabled={disabled} onClick={() => quote(item)}>保存报价</button>}
                          {item.status === 'quoted' && item.payment_status !== 'confirmed' && <button disabled={disabled} onClick={() => void act(item.id, () => adminConfirmStoragePayment(item.id, notes[item.id]), '已确认收到付款')}>确认收到付款</button>}
                          {item.status === 'quoted' && (item.payment_status === 'confirmed' || item.quoted_price_cents === 0) && <button className="approve" disabled={disabled} onClick={() => void act(item.id, () => adminApproveStorageExpansion(item.id, notes[item.id]), '扩容已批准并生效')}><CheckCircle2 />批准扩容</button>}
                          <button className="reject" disabled={disabled} onClick={() => void act(item.id, () => adminRejectStorageExpansion(item.id, notes[item.id] || '管理员拒绝扩容订单'), '订单已拒绝')}><XCircle />拒绝</button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </>
        )}

        {tab === 'plans' && (
          <div className="admin-plan-list">
            <div className="admin-section-help">首次迁移会创建 100MB、500MB、1GB、5GB 四个套餐并默认关闭。填好价格后勾选启用，用户端会立即出现。</div>
            {plans.map((plan) => {
              const draft = planDrafts[plan.id] || { name: plan.name, quotaMb: String(plan.quota_mb), priceYuan: String(plan.price_cents / 100), description: plan.description || '', active: plan.is_active }
              return (
                <article className="admin-plan-card" key={plan.id}>
                  <div className="admin-plan-heading"><strong>{plan.code}</strong><label><input type="checkbox" checked={draft.active} onChange={(event) => setPlanDrafts((current) => ({ ...current, [plan.id]: { ...draft, active: event.target.checked } }))} /> 对用户启用</label></div>
                  <div className="admin-plan-fields">
                    <label>套餐名称<input value={draft.name} onChange={(event) => setPlanDrafts((current) => ({ ...current, [plan.id]: { ...draft, name: event.target.value } }))} /></label>
                    <label>总容量（MB）<input type="number" min="21" value={draft.quotaMb} onChange={(event) => setPlanDrafts((current) => ({ ...current, [plan.id]: { ...draft, quotaMb: event.target.value } }))} /></label>
                    <label>价格（元）<input type="number" min="0" step="0.01" value={draft.priceYuan} onChange={(event) => setPlanDrafts((current) => ({ ...current, [plan.id]: { ...draft, priceYuan: event.target.value } }))} /></label>
                    <label className="wide">说明<input value={draft.description} onChange={(event) => setPlanDrafts((current) => ({ ...current, [plan.id]: { ...draft, description: event.target.value } }))} placeholder="例如：适合轻量图文笔记" /></label>
                  </div>
                  <button className="admin-save-plan" disabled={busyId === plan.id} onClick={() => savePlan(plan)}><Save />保存套餐</button>
                </article>
              )
            })}
          </div>
        )}

        {tab === 'users' && (
          <div className="admin-users-panel">
            <div className="admin-user-search"><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchUsers() }} placeholder="搜索邮箱或用户名" /><button onClick={() => void searchUsers()}><Search />搜索</button></div>
            <div className="admin-user-list">
              {users.map((user) => {
                const quotaMb = Math.round(user.storage_quota_bytes / MIB)
                return (
                  <article className="admin-user-card" key={user.id}>
                    <div className="admin-storage-user"><div><strong>{user.name}</strong><small>{user.email}</small></div><span>{formatStorage(user.storage_used_bytes)} / {formatStorage(user.storage_quota_bytes)}</span></div>
                    <div className="admin-user-quota-row">
                      <label>调整为（MB）<input type="number" min="20" value={quotaDrafts[user.id] ?? String(quotaMb)} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [user.id]: event.target.value }))} /></label>
                      <label>调整原因<input value={quotaReasons[user.id] ?? ''} onChange={(event) => setQuotaReasons((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="必填，例如：线下购买 1GB 套餐" /></label>
                      <button disabled={busyId === user.id} onClick={() => updateQuota(user)}>保存容量</button>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
