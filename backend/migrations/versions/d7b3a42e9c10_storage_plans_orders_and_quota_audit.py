"""storage plans orders payment records and quota audit

Revision ID: d7b3a42e9c10
Revises: c51e9d7a2f44
"""

from alembic import op
import sqlalchemy as sa

revision = "d7b3a42e9c10"
down_revision = "c51e9d7a2f44"
branch_labels = None
depends_on = None

MIB = 1024 * 1024


def upgrade() -> None:
    op.create_table(
        "storage_expansion_plans",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("quota_bytes", sa.BigInteger(), nullable=False),
        sa.Column("price_cents", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="CNY", nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code", name="uq_storage_expansion_plans_code"),
    )
    op.create_index("ix_storage_expansion_plans_code", "storage_expansion_plans", ["code"], unique=True)
    op.create_index("ix_storage_expansion_plans_is_active", "storage_expansion_plans", ["is_active"])

    plans = sa.table(
        "storage_expansion_plans",
        sa.column("id", sa.String), sa.column("code", sa.String), sa.column("name", sa.String),
        sa.column("quota_bytes", sa.BigInteger), sa.column("price_cents", sa.BigInteger),
        sa.column("currency", sa.String), sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean), sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(plans, [
        {"id": "10000000-0000-0000-0000-000000000100", "code": "storage-100mb", "name": "100MB 空间", "quota_bytes": 100 * MIB, "price_cents": 0, "currency": "CNY", "description": "扩容后总容量为 100MB", "is_active": False, "sort_order": 10},
        {"id": "50000000-0000-0000-0000-000000000500", "code": "storage-500mb", "name": "500MB 空间", "quota_bytes": 500 * MIB, "price_cents": 0, "currency": "CNY", "description": "扩容后总容量为 500MB", "is_active": False, "sort_order": 20},
        {"id": "10000000-0000-0000-0000-000000001024", "code": "storage-1gb", "name": "1GB 空间", "quota_bytes": 1024 * MIB, "price_cents": 0, "currency": "CNY", "description": "扩容后总容量为 1GB", "is_active": False, "sort_order": 30},
        {"id": "50000000-0000-0000-0000-000000005120", "code": "storage-5gb", "name": "5GB 空间", "quota_bytes": 5120 * MIB, "price_cents": 0, "currency": "CNY", "description": "扩容后总容量为 5GB", "is_active": False, "sort_order": 40},
    ])

    with op.batch_alter_table("storage_expansion_requests") as batch:
        batch.add_column(sa.Column("order_no", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("plan_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("plan_name_snapshot", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("plan_quota_bytes_snapshot", sa.BigInteger(), nullable=True))
        batch.add_column(sa.Column("plan_price_cents_snapshot", sa.BigInteger(), nullable=True))
    op.execute(sa.text("UPDATE storage_expansion_requests SET order_no = 'LEGACY-' || id WHERE order_no IS NULL"))
    with op.batch_alter_table("storage_expansion_requests") as batch:
        batch.alter_column("order_no", existing_type=sa.String(length=50), nullable=False)
        batch.create_foreign_key(
            "fk_storage_expansion_requests_plan_id_storage_expansion_plans",
            "storage_expansion_plans", ["plan_id"], ["id"], ondelete="SET NULL"
        )
    op.create_index("ix_storage_expansion_requests_order_no", "storage_expansion_requests", ["order_no"], unique=True)
    op.create_index("ix_storage_expansion_requests_plan_id", "storage_expansion_requests", ["plan_id"])

    op.create_table(
        "storage_payment_records",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("request_id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(length=10), server_default="CNY", nullable=False),
        sa.Column("payment_reference", sa.String(length=200), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["storage_expansion_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_storage_payment_records_request_id", "storage_payment_records", ["request_id"])
    op.create_index("ix_storage_payment_records_actor_user_id", "storage_payment_records", ["actor_user_id"])
    op.create_index("ix_storage_payment_records_event_type", "storage_payment_records", ["event_type"])
    op.create_index("ix_storage_payment_records_created_at", "storage_payment_records", ["created_at"])

    op.create_table(
        "storage_quota_adjustments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("admin_user_id", sa.String(length=36), nullable=True),
        sa.Column("old_quota_bytes", sa.BigInteger(), nullable=False),
        sa.Column("new_quota_bytes", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_storage_quota_adjustments_user_id", "storage_quota_adjustments", ["user_id"])
    op.create_index("ix_storage_quota_adjustments_admin_user_id", "storage_quota_adjustments", ["admin_user_id"])
    op.create_index("ix_storage_quota_adjustments_created_at", "storage_quota_adjustments", ["created_at"])


def downgrade() -> None:
    op.drop_table("storage_quota_adjustments")
    op.drop_table("storage_payment_records")
    op.drop_index("ix_storage_expansion_requests_plan_id", table_name="storage_expansion_requests")
    op.drop_index("ix_storage_expansion_requests_order_no", table_name="storage_expansion_requests")
    with op.batch_alter_table("storage_expansion_requests") as batch:
        batch.drop_constraint("fk_storage_expansion_requests_plan_id_storage_expansion_plans", type_="foreignkey")
        for column in ["plan_price_cents_snapshot", "plan_quota_bytes_snapshot", "plan_name_snapshot", "plan_id", "order_no"]:
            batch.drop_column(column)
    op.drop_table("storage_expansion_plans")
