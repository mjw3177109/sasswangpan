import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, HardDrive, PackageCheck, X } from 'lucide-react'
import { ApiError } from '../services/api'
import {
  listStorageExpansionRequests,
  listStoragePlans,
  orderStoragePlan,
  requestStorageExpansion,
  submitStorageExpansionPayment,
  type StorageExpansionPlanItem,
  type StorageExpansionRequestItem,
} from '../services/billing'
import type { WorkspaceStorage } from '../services/workspace'

interface Props {
  open: boolean
  storage: WorkspaceStorage | null
  onClose: () => void
  onNotice: (message: string) => void
}

const MIB = 1024 ** 2

function formatStorage(bytes: number) {
  const gib = bytes / (1024 ** 3)
  if (gib >= 1) return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`
  return `${(bytes / MIB).toFixed(1)} MB`
}

function formatMoney(cents: number | null | undefined, currency: string) {
  if (cents == null) return '待报价'
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function statusText(item: StorageExpansionRequestItem) {
  if (item.status === 'approved') return '已扩容'
  if (item.status === 'rejected') return '已拒绝'
  if (item.status === 'pending') return '等待报价'
  if (item.payment_status === 'confirmed') return '付款已确认'
  if (item.payment_status === 'submitted') return '等待核对付款'
  if (item.status === 'quoted') return '等待付款'
  return item.status
}

export function StorageExpansionModal({ open, storage, onClose, onNotice }: Props) {
  const currentMb = Math.max(20, Math.ceil((storage?.quota_bytes ?? 20 * MIB) / MIB))
  const [requestedMb, setRequestedMb] = useState(Math.max(100, currentMb * 5))
  const [note, setNote] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [items, setItems] = useState<StorageExpansionRequestItem[]>([])
  const [plans, setPlans] = useState<StorageExpansionPlanItem[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const active = useMemo(
    () => items.find((item) => item.status === 'pending' || item.status === 'quoted'),
    [items],
  )

  const refresh = async () => {
    setLoading(true)
    try {
      const [requestsResponse, plansResponse] = await Promise.all([
        listStorageExpansionRequests(),
        listStoragePlans(),
      ])
      setItems(requestsResponse.data)
      setPlans(plansResponse.data)
      setError('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '读取空间扩容信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setRequestedMb(Math.max(100, currentMb * 5))
    void refresh()
  }, [open, currentMb])

  if (!open) return null

  const submitRequest = async () => {
    if (!Number.isFinite(requestedMb) || requestedMb <= currentMb) {
      setError(`申请容量必须大于当前 ${currentMb}MB`)
      return
    }
    setBusy(true)
    try {
      const response = await requestStorageExpansion(requestedMb, note)
      onNotice(response.data.message || '扩容申请已提交')
      setNote('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '扩容申请提交失败')
    } finally {
      setBusy(false)
    }
  }

  const selectPlan = async (plan: StorageExpansionPlanItem) => {
    setBusy(true)
    try {
      const response = await orderStoragePlan(plan.id, note)
      onNotice(response.data.message || '套餐订单已创建')
      setNote('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '套餐订单创建失败')
    } finally {
      setBusy(false)
    }
  }

  const submitPayment = async (item: StorageExpansionRequestItem) => {
    setBusy(true)
    try {
      const response = await submitStorageExpansionPayment(item.id, paymentReference)
      onNotice(response.data.message || '付款确认已提交')
      setPaymentReference('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '付款确认提交失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="storage-modal-layer" role="dialog" aria-modal="true" aria-label="空间扩容">
      <button className="storage-modal-backdrop" aria-label="关闭" onClick={onClose} />
      <section className="storage-modal-card">
        <header>
          <div className="storage-modal-title"><HardDrive /><div><strong>空间扩容</strong><small>免费容量 20MB · 当前 {formatStorage(storage?.quota_bytes ?? 20 * MIB)}</small></div></div>
          <button className="storage-modal-close" onClick={onClose}><X /></button>
        </header>

        <div className="storage-current-card">
          <div><span>已使用</span><strong>{formatStorage(storage?.used_bytes ?? 0)}</strong></div>
          <div><span>当前容量</span><strong>{formatStorage(storage?.quota_bytes ?? 20 * MIB)}</strong></div>
          <div><span>剩余</span><strong>{formatStorage(storage?.remaining_bytes ?? 20 * MIB)}</strong></div>
        </div>

        {active?.status === 'quoted' ? (
          <div className="storage-payment-panel">
            <div className="storage-order-line"><span>订单号</span><code>{active.order_no}</code></div>
            {active.plan_name && <div className="storage-order-line"><span>套餐</span><strong>{active.plan_name}</strong></div>}
            <div className="storage-payment-price"><span>应付金额</span><strong>{formatMoney(active.quoted_price_cents, active.currency)}</strong></div>
            <p>{active.payment_instructions || '请按管理员提供的方式完成付款。'}</p>
            {active.admin_note && <small>说明：{active.admin_note}</small>}
            {active.payment_status === 'unpaid' && (
              <div className="storage-payment-submit">
                <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="付款备注/流水号（可选）" />
                <button disabled={busy} onClick={() => void submitPayment(active)}>我已付款</button>
              </div>
            )}
            {active.payment_status === 'submitted' && <div className="storage-state-banner"><Clock3 />已提交付款信息，等待管理员核对</div>}
            {active.payment_status === 'confirmed' && <div className="storage-state-banner success"><CheckCircle2 />付款已确认，等待管理员批准扩容</div>}
          </div>
        ) : (
          <>
            {active?.status === 'pending' && <div className="storage-state-banner"><Clock3 />已有自定义申请等待报价；报价前仍可改选套餐或修改目标容量。</div>}

            {!!plans.length && (
              <div className="storage-plan-section">
                <div className="storage-section-title"><PackageCheck /><span><strong>扩容套餐</strong><small>价格由管理员配置，选中后直接生成订单</small></span></div>
                <div className="storage-plan-grid">
                  {plans.map((plan) => (
                    <button key={plan.id} className="storage-plan-card" disabled={busy} onClick={() => void selectPlan(plan)}>
                      <span>{plan.name}</span>
                      <strong>{formatMoney(plan.price_cents, plan.currency)}</strong>
                      <small>{plan.description || `扩容后总容量 ${formatStorage(plan.quota_bytes)}`}</small>
                      <em>选择套餐</em>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="storage-request-form compact">
              <label>{active ? '修改自定义目标容量' : '没有合适套餐？自定义申请'}</label>
              <div className="storage-size-row">
                {[100, 500, 1024, 5120].filter((value) => value > currentMb).map((value) => (
                  <button key={value} type="button" className={requestedMb === value ? 'active' : ''} onClick={() => setRequestedMb(value)}>{value >= 1024 ? `${value / 1024}GB` : `${value}MB`}</button>
                ))}
              </div>
              <input type="number" min={currentMb + 1} value={requestedMb} onChange={(event) => setRequestedMb(Number(event.target.value))} />
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="用途或备注（可选）" />
              <button className="storage-primary" disabled={busy} onClick={() => void submitRequest()}>{busy ? '提交中…' : active ? '更新自定义申请' : '提交自定义扩容申请'}</button>
            </div>
          </>
        )}

        {!plans.length && !loading && !active && <div className="storage-state-banner">当前暂无已启用的固定套餐，你仍然可以提交自定义扩容申请。</div>}
        {error && <div className="auth-error">{error}</div>}

        <div className="storage-history">
          <div className="storage-history-head"><strong>订单 / 申请记录</strong><button onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中…' : '刷新'}</button></div>
          {!items.length && !loading && <p className="storage-history-empty">暂无扩容记录</p>}
          {items.slice(0, 8).map((item) => (
            <article key={item.id}>
              <div><strong>{item.plan_name || `${formatStorage(item.current_quota_bytes)} → ${formatStorage(item.requested_quota_bytes)}`}</strong><small>{item.order_no} · {new Date(item.created_at).toLocaleString()}</small></div>
              <span className={`storage-status ${item.status} ${item.payment_status}`}>{statusText(item)}</span>
              <em>{formatMoney(item.quoted_price_cents, item.currency)}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
