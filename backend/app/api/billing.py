from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_site_admin
from app.core.config import settings
from app.core.responses import success
from app.db.session import get_db
from app.models import (
    Attachment,
    BillingSubscription,
    StorageExpansionPlan,
    StorageExpansionRequest,
    StoragePaymentRecord,
    StorageQuotaAdjustment,
    User,
)

router = APIRouter(prefix="/billing", tags=["billing"])
MIB = 1024 * 1024


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _new_order_no() -> str:
    return f"STG{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8].upper()}"


class CheckoutInput(BaseModel):
    plan: Literal["pro", "team"]


class StorageExpansionRequestInput(BaseModel):
    requested_quota_mb: int | None = Field(default=None, gt=20, le=1024 * 1024)
    plan_id: str | None = Field(default=None, max_length=36)
    note: str | None = Field(default=None, max_length=500)


class StoragePaymentSubmittedInput(BaseModel):
    payment_reference: str | None = Field(default=None, max_length=200)


class StorageExpansionQuoteInput(BaseModel):
    price_cents: int = Field(ge=0, le=100_000_000_00)
    currency: str = Field(default="CNY", min_length=3, max_length=10)
    admin_note: str | None = Field(default=None, max_length=500)


class StorageExpansionAdminNoteInput(BaseModel):
    admin_note: str | None = Field(default=None, max_length=500)


class StorageExpansionRejectInput(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class StoragePlanCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    quota_mb: int = Field(gt=20, le=1024 * 1024)
    price_cents: int = Field(ge=0, le=100_000_000_00)
    currency: str = Field(default="CNY", min_length=3, max_length=10)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = False
    sort_order: int = Field(default=100, ge=-10000, le=10000)


class StoragePlanUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    quota_mb: int | None = Field(default=None, gt=20, le=1024 * 1024)
    price_cents: int | None = Field(default=None, ge=0, le=100_000_000_00)
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=-10000, le=10000)


class StorageAdminQuotaInput(BaseModel):
    quota_mb: int = Field(ge=20, le=1024 * 1024)
    reason: str = Field(min_length=2, max_length=500)


def _require_billing() -> None:
    if not settings.payments_enabled:
        raise HTTPException(
            503,
            {"code": "PAYMENTS_DISABLED", "message": "支付功能尚未开启；免费版不需要支付配置"},
        )
    if not settings.stripe_secret_key:
        raise HTTPException(503, {"code": "PAYMENTS_NOT_CONFIGURED", "message": "支付服务未配置"})
    stripe.api_key = settings.stripe_secret_key


def _price_id(plan: str) -> str:
    value = settings.stripe_pro_price_id if plan == "pro" else settings.stripe_team_price_id
    if not value:
        raise HTTPException(
            503,
            {"code": "PRICE_NOT_CONFIGURED", "message": f"{plan} 套餐尚未配置 Stripe Price ID"},
        )
    return value


def _plan_payload(item: StorageExpansionPlan) -> dict[str, object]:
    return {
        "id": item.id,
        "code": item.code,
        "name": item.name,
        "quota_bytes": int(item.quota_bytes),
        "quota_mb": int(item.quota_bytes) // MIB,
        "price_cents": int(item.price_cents),
        "currency": item.currency,
        "description": item.description,
        "is_active": bool(item.is_active),
        "sort_order": int(item.sort_order),
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


def _payment_payload(item: StoragePaymentRecord, *, order_no: str | None = None) -> dict[str, object]:
    return {
        "id": item.id,
        "request_id": item.request_id,
        "order_no": order_no,
        "event_type": item.event_type,
        "amount_cents": item.amount_cents,
        "currency": item.currency,
        "payment_reference": item.payment_reference,
        "note": item.note,
        "actor_user_id": item.actor_user_id,
        "created_at": item.created_at.isoformat(),
    }


def _request_payload(
    item: StorageExpansionRequest,
    *,
    user: User | None = None,
    payment_records: list[StoragePaymentRecord] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": item.id,
        "order_no": item.order_no,
        "user_id": item.user_id,
        "plan_id": item.plan_id,
        "plan_name": item.plan_name_snapshot,
        "plan_quota_bytes": item.plan_quota_bytes_snapshot,
        "plan_price_cents": item.plan_price_cents_snapshot,
        "current_quota_bytes": item.current_quota_bytes,
        "requested_quota_bytes": item.requested_quota_bytes,
        "status": item.status,
        "note": item.note,
        "quoted_price_cents": item.quoted_price_cents,
        "currency": item.currency,
        "payment_status": item.payment_status,
        "payment_reference": item.payment_reference,
        "admin_note": item.admin_note,
        "quoted_at": item.quoted_at.isoformat() if item.quoted_at else None,
        "payment_submitted_at": item.payment_submitted_at.isoformat() if item.payment_submitted_at else None,
        "payment_confirmed_at": item.payment_confirmed_at.isoformat() if item.payment_confirmed_at else None,
        "resolved_at": item.resolved_at.isoformat() if item.resolved_at else None,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }
    if item.status == "quoted":
        payload["payment_instructions"] = settings.storage_payment_instructions
    if user is not None:
        payload["user"] = {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "storage_quota_bytes": user.storage_quota_bytes,
        }
    if payment_records is not None:
        payload["payment_records"] = [_payment_payload(record, order_no=item.order_no) for record in payment_records]
    return payload


def _payment_records_for(db: Session, request_id: str) -> list[StoragePaymentRecord]:
    return list(
        db.scalars(
            select(StoragePaymentRecord)
            .where(StoragePaymentRecord.request_id == request_id)
            .order_by(StoragePaymentRecord.created_at.asc())
        ).all()
    )


def _add_payment_record(
    db: Session,
    *,
    item: StorageExpansionRequest,
    actor_user_id: str | None,
    event_type: str,
    payment_reference: str | None = None,
    note: str | None = None,
) -> None:
    db.add(
        StoragePaymentRecord(
            request_id=item.id,
            actor_user_id=actor_user_id,
            event_type=event_type,
            amount_cents=item.quoted_price_cents,
            currency=item.currency,
            payment_reference=payment_reference,
            note=note,
        )
    )


def _storage_used(db: Session, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(Attachment.size_bytes), 0)).where(Attachment.uploader_id == user_id)
        )
        or 0
    )


@router.get("/status")
def billing_status(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    subscription = db.scalar(select(BillingSubscription).where(BillingSubscription.user_id == user.id))
    return success(
        {
            "payments_enabled": settings.payments_enabled,
            "plan": user.plan,
            "subscription": None
            if subscription is None
            else {"provider": subscription.provider, "plan": subscription.plan, "status": subscription.status},
        },
        request=request,
    )


@router.get("/storage-plans")
def list_storage_plans(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    current = int(user.storage_quota_bytes or settings.default_user_storage_quota_bytes)
    items = db.scalars(
        select(StorageExpansionPlan)
        .where(StorageExpansionPlan.is_active.is_(True), StorageExpansionPlan.quota_bytes > current)
        .order_by(StorageExpansionPlan.sort_order.asc(), StorageExpansionPlan.quota_bytes.asc())
    ).all()
    return success([_plan_payload(item) for item in items], request=request)


@router.get("/storage-expansion-requests")
def list_storage_expansion_requests(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    items = db.scalars(
        select(StorageExpansionRequest)
        .where(StorageExpansionRequest.user_id == user.id)
        .order_by(StorageExpansionRequest.created_at.desc())
    ).all()
    return success(
        [_request_payload(item, payment_records=_payment_records_for(db, item.id)) for item in items],
        request=request,
    )


@router.post("/storage-expansion-requests", status_code=201)
def create_storage_expansion_request(
    payload: StorageExpansionRequestInput,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if bool(payload.plan_id) == bool(payload.requested_quota_mb):
        raise HTTPException(400, {"code": "EXPANSION_TARGET_REQUIRED", "message": "请选择套餐或填写自定义扩容容量"})

    current_quota = int(user.storage_quota_bytes or settings.default_user_storage_quota_bytes)
    selected_plan: StorageExpansionPlan | None = None
    if payload.plan_id:
        selected_plan = db.get(StorageExpansionPlan, payload.plan_id)
        if selected_plan is None or not selected_plan.is_active:
            raise HTTPException(404, {"code": "STORAGE_PLAN_NOT_FOUND", "message": "扩容套餐不存在或已下架"})
        requested_quota_bytes = int(selected_plan.quota_bytes)
    else:
        requested_quota_bytes = int(payload.requested_quota_mb or 0) * MIB

    if requested_quota_bytes <= current_quota:
        raise HTTPException(400, {"code": "EXPANSION_MUST_INCREASE_QUOTA", "message": "申请容量必须大于当前容量"})

    active = db.scalar(
        select(StorageExpansionRequest).where(
            StorageExpansionRequest.user_id == user.id,
            StorageExpansionRequest.status.in_(["pending", "quoted"]),
        )
    )
    if active is not None and active.status == "quoted":
        raise HTTPException(409, {"code": "EXPANSION_ALREADY_QUOTED", "message": "已有扩容订单进入付款阶段，请先处理当前订单"})

    item = active or StorageExpansionRequest(
        order_no=_new_order_no(),
        user_id=user.id,
        current_quota_bytes=current_quota,
        requested_quota_bytes=requested_quota_bytes,
    )
    if active is None:
        db.add(item)

    item.current_quota_bytes = current_quota
    item.requested_quota_bytes = requested_quota_bytes
    item.note = payload.note
    item.payment_status = "unpaid"
    item.payment_reference = None
    item.payment_submitted_at = None
    item.payment_confirmed_at = None
    item.resolved_at = None
    item.reviewed_by = None

    if selected_plan is not None:
        item.plan_id = selected_plan.id
        item.plan_name_snapshot = selected_plan.name
        item.plan_quota_bytes_snapshot = int(selected_plan.quota_bytes)
        item.plan_price_cents_snapshot = int(selected_plan.price_cents)
        item.quoted_price_cents = int(selected_plan.price_cents)
        item.currency = selected_plan.currency
        item.status = "quoted"
        item.quoted_at = _now()
        item.admin_note = selected_plan.description
    else:
        item.plan_id = None
        item.plan_name_snapshot = None
        item.plan_quota_bytes_snapshot = None
        item.plan_price_cents_snapshot = None
        item.quoted_price_cents = None
        item.currency = "CNY"
        item.status = "pending"
        item.quoted_at = None
        item.admin_note = None

    db.commit()
    db.refresh(item)
    result = _request_payload(item, payment_records=[])
    result["message"] = "套餐订单已创建，请按说明付款" if selected_plan else "扩容申请已提交，等待管理员报价"
    return success(result, request=request)


@router.post("/storage-expansion-requests/{request_id}/payment-submitted")
def mark_storage_payment_submitted(
    request_id: str,
    payload: StoragePaymentSubmittedInput,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = db.get(StorageExpansionRequest, request_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(404, {"code": "EXPANSION_NOT_FOUND", "message": "扩容订单不存在"})
    if item.status != "quoted":
        raise HTTPException(409, {"code": "EXPANSION_NOT_QUOTED", "message": "该订单尚未进入付款阶段"})
    if item.payment_status == "confirmed":
        raise HTTPException(409, {"code": "PAYMENT_ALREADY_CONFIRMED", "message": "付款已确认"})

    reference = payload.payment_reference.strip() if payload.payment_reference else None
    item.payment_status = "submitted"
    item.payment_reference = reference
    item.payment_submitted_at = _now()
    _add_payment_record(db, item=item, actor_user_id=user.id, event_type="submitted", payment_reference=reference)
    db.commit()
    db.refresh(item)
    result = _request_payload(item, payment_records=_payment_records_for(db, item.id))
    result["message"] = "已提交付款确认，等待管理员核对"
    return success(result, request=request)


@router.get("/admin/storage-plans")
def admin_list_storage_plans(
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    items = db.scalars(
        select(StorageExpansionPlan).order_by(StorageExpansionPlan.sort_order.asc(), StorageExpansionPlan.quota_bytes.asc())
    ).all()
    return success([_plan_payload(item) for item in items], request=request)


@router.post("/admin/storage-plans", status_code=201)
def admin_create_storage_plan(
    payload: StoragePlanCreateInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    item = StorageExpansionPlan(
        code=f"custom-{uuid4().hex[:12]}",
        name=payload.name.strip(),
        quota_bytes=payload.quota_mb * MIB,
        price_cents=payload.price_cents,
        currency=payload.currency.strip().upper(),
        description=payload.description,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success(_plan_payload(item), request=request)


@router.patch("/admin/storage-plans/{plan_id}")
def admin_update_storage_plan(
    plan_id: str,
    payload: StoragePlanUpdateInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    item = db.get(StorageExpansionPlan, plan_id)
    if item is None:
        raise HTTPException(404, {"code": "STORAGE_PLAN_NOT_FOUND", "message": "扩容套餐不存在"})
    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.quota_mb is not None:
        item.quota_bytes = payload.quota_mb * MIB
    if payload.price_cents is not None:
        item.price_cents = payload.price_cents
    if payload.currency is not None:
        item.currency = payload.currency.strip().upper()
    if "description" in payload.model_fields_set:
        item.description = payload.description
    if payload.is_active is not None:
        item.is_active = payload.is_active
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order
    db.commit()
    db.refresh(item)
    return success(_plan_payload(item), request=request)


@router.get("/admin/storage-expansion-requests")
def admin_list_storage_expansion_requests(
    request: Request,
    status: str | None = Query(default=None, max_length=30),
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    stmt = select(StorageExpansionRequest).order_by(StorageExpansionRequest.created_at.desc())
    if status:
        stmt = stmt.where(StorageExpansionRequest.status == status)
    items = db.scalars(stmt).all()
    user_ids = {item.user_id for item in items}
    users = {user.id: user for user in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    return success(
        [
            _request_payload(item, user=users.get(item.user_id), payment_records=_payment_records_for(db, item.id))
            for item in items
        ],
        request=request,
    )


@router.post("/admin/storage-expansion-requests/{request_id}/quote")
def admin_quote_storage_expansion(
    request_id: str,
    payload: StorageExpansionQuoteInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = db.get(StorageExpansionRequest, request_id)
    if item is None:
        raise HTTPException(404, {"code": "EXPANSION_NOT_FOUND", "message": "扩容订单不存在"})
    if item.status in {"approved", "rejected"}:
        raise HTTPException(409, {"code": "EXPANSION_RESOLVED", "message": "该订单已处理完成"})

    item.quoted_price_cents = payload.price_cents
    item.currency = payload.currency.strip().upper()
    item.admin_note = payload.admin_note
    item.reviewed_by = admin.id
    item.status = "quoted"
    item.payment_status = "unpaid"
    item.payment_reference = None
    item.quoted_at = _now()
    item.payment_submitted_at = None
    item.payment_confirmed_at = None
    db.commit()
    db.refresh(item)
    result = _request_payload(item, user=db.get(User, item.user_id), payment_records=_payment_records_for(db, item.id))
    result["message"] = "报价已保存，用户现在可以按说明付款"
    return success(result, request=request)


@router.post("/admin/storage-expansion-requests/{request_id}/confirm-payment")
def admin_confirm_storage_payment(
    request_id: str,
    payload: StorageExpansionAdminNoteInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = db.get(StorageExpansionRequest, request_id)
    if item is None:
        raise HTTPException(404, {"code": "EXPANSION_NOT_FOUND", "message": "扩容订单不存在"})
    if item.status != "quoted" or item.quoted_price_cents is None:
        raise HTTPException(409, {"code": "EXPANSION_NOT_QUOTED", "message": "请先为该订单报价"})
    if item.payment_status != "confirmed":
        item.payment_status = "confirmed"
        item.payment_confirmed_at = _now()
        item.reviewed_by = admin.id
        _add_payment_record(
            db,
            item=item,
            actor_user_id=admin.id,
            event_type="confirmed",
            payment_reference=item.payment_reference,
            note=payload.admin_note,
        )
    if payload.admin_note is not None:
        item.admin_note = payload.admin_note
    db.commit()
    db.refresh(item)
    result = _request_payload(item, user=db.get(User, item.user_id), payment_records=_payment_records_for(db, item.id))
    result["message"] = "付款已确认，可以批准扩容"
    return success(result, request=request)


@router.post("/admin/storage-expansion-requests/{request_id}/approve")
def admin_approve_storage_expansion(
    request_id: str,
    payload: StorageExpansionAdminNoteInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = db.get(StorageExpansionRequest, request_id)
    if item is None:
        raise HTTPException(404, {"code": "EXPANSION_NOT_FOUND", "message": "扩容订单不存在"})
    if item.status == "approved":
        return success(_request_payload(item, user=db.get(User, item.user_id), payment_records=_payment_records_for(db, item.id)), request=request)
    if item.status == "rejected":
        raise HTTPException(409, {"code": "EXPANSION_REJECTED", "message": "已拒绝的订单不能批准"})
    if item.quoted_price_cents is None:
        raise HTTPException(409, {"code": "EXPANSION_NOT_QUOTED", "message": "请先为该订单报价"})
    if item.quoted_price_cents > 0 and item.payment_status != "confirmed":
        raise HTTPException(409, {"code": "PAYMENT_NOT_CONFIRMED", "message": "请先确认已收到付款"})

    target_user = db.get(User, item.user_id)
    if target_user is None:
        raise HTTPException(404, {"code": "USER_NOT_FOUND", "message": "申请用户不存在"})
    old_quota = int(target_user.storage_quota_bytes or 0)
    new_quota = max(old_quota, int(item.requested_quota_bytes))
    target_user.storage_quota_bytes = new_quota
    if new_quota != old_quota:
        db.add(
            StorageQuotaAdjustment(
                user_id=target_user.id,
                admin_user_id=admin.id,
                old_quota_bytes=old_quota,
                new_quota_bytes=new_quota,
                reason=f"批准扩容订单 {item.order_no}" + (f"：{payload.admin_note}" if payload.admin_note else ""),
            )
        )
    item.status = "approved"
    item.reviewed_by = admin.id
    item.resolved_at = _now()
    if payload.admin_note is not None:
        item.admin_note = payload.admin_note
    db.commit()
    db.refresh(item)
    db.refresh(target_user)
    result = _request_payload(item, user=target_user, payment_records=_payment_records_for(db, item.id))
    result["message"] = "扩容已批准，用户容量已立即生效"
    return success(result, request=request)


@router.post("/admin/storage-expansion-requests/{request_id}/reject")
def admin_reject_storage_expansion(
    request_id: str,
    payload: StorageExpansionRejectInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = db.get(StorageExpansionRequest, request_id)
    if item is None:
        raise HTTPException(404, {"code": "EXPANSION_NOT_FOUND", "message": "扩容订单不存在"})
    if item.status == "approved":
        raise HTTPException(409, {"code": "EXPANSION_APPROVED", "message": "已批准的订单不能拒绝"})
    item.status = "rejected"
    item.reviewed_by = admin.id
    item.admin_note = payload.reason
    item.resolved_at = _now()
    db.commit()
    db.refresh(item)
    result = _request_payload(item, user=db.get(User, item.user_id), payment_records=_payment_records_for(db, item.id))
    result["message"] = "扩容订单已拒绝"
    return success(result, request=request)


@router.get("/admin/storage-users")
def admin_list_storage_users(
    request: Request,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=100, ge=1, le=200),
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    stmt = select(User).order_by(User.created_at.desc()).limit(limit)
    if q and q.strip():
        needle = f"%{q.strip().lower()}%"
        stmt = select(User).where(or_(func.lower(User.email).like(needle), func.lower(User.name).like(needle))).order_by(User.created_at.desc()).limit(limit)
    users = db.scalars(stmt).all()
    user_ids = [user.id for user in users]
    usage: dict[str, int] = {}
    if user_ids:
        rows = db.execute(
            select(Attachment.uploader_id, func.coalesce(func.sum(Attachment.size_bytes), 0))
            .where(Attachment.uploader_id.in_(user_ids))
            .group_by(Attachment.uploader_id)
        ).all()
        usage = {str(user_id): int(total or 0) for user_id, total in rows}
    return success(
        [
            {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "plan": user.plan,
                "is_active": user.is_active,
                "storage_quota_bytes": int(user.storage_quota_bytes or 0),
                "storage_used_bytes": usage.get(user.id, 0),
                "created_at": user.created_at.isoformat(),
            }
            for user in users
        ],
        request=request,
    )


@router.post("/admin/storage-users/{user_id}/quota")
def admin_set_storage_user_quota(
    user_id: str,
    payload: StorageAdminQuotaInput,
    request: Request,
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, {"code": "USER_NOT_FOUND", "message": "用户不存在"})
    new_quota = payload.quota_mb * MIB
    used = _storage_used(db, target.id)
    if new_quota < used:
        raise HTTPException(409, {"code": "QUOTA_BELOW_USAGE", "message": "新容量不能小于用户当前已使用空间", "used_bytes": used})
    old_quota = int(target.storage_quota_bytes or 0)
    target.storage_quota_bytes = new_quota
    db.add(
        StorageQuotaAdjustment(
            user_id=target.id,
            admin_user_id=admin.id,
            old_quota_bytes=old_quota,
            new_quota_bytes=new_quota,
            reason=payload.reason.strip(),
        )
    )
    db.commit()
    db.refresh(target)
    return success(
        {
            "id": target.id,
            "email": target.email,
            "name": target.name,
            "storage_quota_bytes": int(target.storage_quota_bytes),
            "storage_used_bytes": used,
            "message": "用户容量已更新并记录审计日志",
        },
        request=request,
    )


@router.get("/admin/storage-payment-records")
def admin_list_storage_payment_records(
    request: Request,
    request_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=100, ge=1, le=500),
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    stmt = select(StoragePaymentRecord).order_by(StoragePaymentRecord.created_at.desc()).limit(limit)
    if request_id:
        stmt = select(StoragePaymentRecord).where(StoragePaymentRecord.request_id == request_id).order_by(StoragePaymentRecord.created_at.desc()).limit(limit)
    items = db.scalars(stmt).all()
    request_ids = {item.request_id for item in items}
    orders = {item.id: item.order_no for item in db.scalars(select(StorageExpansionRequest).where(StorageExpansionRequest.id.in_(request_ids))).all()} if request_ids else {}
    return success([_payment_payload(item, order_no=orders.get(item.request_id)) for item in items], request=request)


@router.get("/admin/storage-quota-adjustments")
def admin_list_storage_quota_adjustments(
    request: Request,
    user_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=100, ge=1, le=500),
    admin: User = Depends(require_site_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    del admin
    stmt = select(StorageQuotaAdjustment).order_by(StorageQuotaAdjustment.created_at.desc()).limit(limit)
    if user_id:
        stmt = select(StorageQuotaAdjustment).where(StorageQuotaAdjustment.user_id == user_id).order_by(StorageQuotaAdjustment.created_at.desc()).limit(limit)
    items = db.scalars(stmt).all()
    return success(
        [
            {
                "id": item.id,
                "user_id": item.user_id,
                "admin_user_id": item.admin_user_id,
                "old_quota_bytes": item.old_quota_bytes,
                "new_quota_bytes": item.new_quota_bytes,
                "reason": item.reason,
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ],
        request=request,
    )


@router.post("/checkout")
def create_checkout(
    payload: CheckoutInput,
    request: Request,
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    _require_billing()
    success_url = settings.billing_success_url or f"{settings.frontend_origin}/app?billing=success"
    cancel_url = settings.billing_cancel_url or f"{settings.frontend_origin}/app?billing=cancel"
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": _price_id(payload.plan), "quantity": 1}],
            customer_email=user.email,
            client_reference_id=user.id,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": user.id, "plan": payload.plan},
            subscription_data={"metadata": {"user_id": user.id, "plan": payload.plan}},
        )
    except Exception as exc:
        raise HTTPException(502, {"code": "CHECKOUT_CREATE_FAILED", "message": "创建支付页面失败，请稍后重试"}) from exc
    return success({"checkout_url": session.url}, request=request)


def _upsert_subscription(
    db: Session,
    *,
    user_id: str,
    plan: str,
    status: str,
    customer_id: str | None,
    subscription_id: str | None,
) -> None:
    item = db.scalar(select(BillingSubscription).where(BillingSubscription.user_id == user_id))
    if item is None:
        item = BillingSubscription(user_id=user_id)
        db.add(item)
    item.provider = "stripe"
    item.plan = plan
    item.status = status
    item.customer_id = customer_id
    item.subscription_id = subscription_id
    user = db.get(User, user_id)
    if user is not None:
        user.plan = plan if status in {"active", "trialing"} else "free"
    db.commit()


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, bool]:
    _require_billing()
    if not settings.stripe_webhook_secret:
        raise HTTPException(503, {"code": "WEBHOOK_NOT_CONFIGURED", "message": "支付回调未配置"})
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception as exc:
        raise HTTPException(400, {"code": "INVALID_WEBHOOK", "message": "支付回调签名无效"}) from exc

    event_type = event.get("type")
    obj = event["data"]["object"]
    if event_type == "checkout.session.completed":
        metadata = obj.get("metadata") or {}
        user_id = metadata.get("user_id") or obj.get("client_reference_id")
        plan = metadata.get("plan") or "pro"
        if user_id:
            _upsert_subscription(
                db,
                user_id=user_id,
                plan=plan,
                status="active",
                customer_id=obj.get("customer"),
                subscription_id=obj.get("subscription"),
            )
    elif event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
        subscription_id = obj.get("id")
        item = db.scalar(select(BillingSubscription).where(BillingSubscription.subscription_id == subscription_id))
        if item is not None:
            status = obj.get("status") or ("canceled" if event_type.endswith("deleted") else "inactive")
            _upsert_subscription(
                db,
                user_id=item.user_id,
                plan=item.plan,
                status=status,
                customer_id=obj.get("customer") or item.customer_id,
                subscription_id=subscription_id,
            )
    return {"ok": True}
