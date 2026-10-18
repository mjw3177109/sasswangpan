"""supabase quota and billing fields

Revision ID: f28a16c4b1d2
Revises: f07d9e0b84d2
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f28a16c4b1d2"
down_revision: str | Sequence[str] | None = "f07d9e0b84d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024 * 1024


def upgrade() -> None:
    op.add_column(
        "attachments",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ready"),
    )
    op.create_index(op.f("ix_attachments_status"), "attachments", ["status"], unique=False)
    op.add_column(
        "users",
        sa.Column("plan", sa.String(length=20), nullable=False, server_default="free"),
    )
    op.add_column(
        "users",
        sa.Column(
            "storage_quota_bytes",
            sa.BigInteger(),
            nullable=False,
            server_default=str(DEFAULT_QUOTA_BYTES),
        ),
    )
    op.create_table(
        "billing_subscriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=True),
        sa.Column("subscription_id", sa.String(length=255), nullable=True),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subscription_id"),
    )
    op.create_index(
        op.f("ix_billing_subscriptions_user_id"),
        "billing_subscriptions",
        ["user_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_billing_subscriptions_customer_id"),
        "billing_subscriptions",
        ["customer_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_attachments_status"), table_name="attachments")
    op.drop_column("attachments", "status")
    op.drop_index(op.f("ix_billing_subscriptions_customer_id"), table_name="billing_subscriptions")
    op.drop_index(op.f("ix_billing_subscriptions_user_id"), table_name="billing_subscriptions")
    op.drop_table("billing_subscriptions")
    op.drop_column("users", "storage_quota_bytes")
    op.drop_column("users", "plan")
