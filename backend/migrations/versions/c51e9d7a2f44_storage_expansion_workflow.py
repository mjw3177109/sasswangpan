"""storage expansion quote and payment workflow

Revision ID: c51e9d7a2f44
Revises: a91c3e22d8f1
"""

from alembic import op
import sqlalchemy as sa

revision = "c51e9d7a2f44"
down_revision = "a91c3e22d8f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("storage_expansion_requests", sa.Column("quoted_price_cents", sa.BigInteger(), nullable=True))
    op.add_column(
        "storage_expansion_requests",
        sa.Column("currency", sa.String(length=10), server_default="CNY", nullable=False),
    )
    op.add_column(
        "storage_expansion_requests",
        sa.Column("payment_status", sa.String(length=30), server_default="unpaid", nullable=False),
    )
    op.add_column("storage_expansion_requests", sa.Column("payment_reference", sa.String(length=200), nullable=True))
    op.add_column("storage_expansion_requests", sa.Column("admin_note", sa.String(length=500), nullable=True))
    op.add_column("storage_expansion_requests", sa.Column("reviewed_by", sa.String(length=36), nullable=True))
    op.add_column("storage_expansion_requests", sa.Column("quoted_at", sa.DateTime(), nullable=True))
    op.add_column("storage_expansion_requests", sa.Column("payment_submitted_at", sa.DateTime(), nullable=True))
    op.add_column("storage_expansion_requests", sa.Column("payment_confirmed_at", sa.DateTime(), nullable=True))
    op.add_column("storage_expansion_requests", sa.Column("resolved_at", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_storage_expansion_requests_reviewed_by_users",
        "storage_expansion_requests",
        "users",
        ["reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_storage_expansion_requests_payment_status",
        "storage_expansion_requests",
        ["payment_status"],
    )
    op.create_index(
        "ix_storage_expansion_requests_reviewed_by",
        "storage_expansion_requests",
        ["reviewed_by"],
    )


def downgrade() -> None:
    op.drop_index("ix_storage_expansion_requests_reviewed_by", table_name="storage_expansion_requests")
    op.drop_index("ix_storage_expansion_requests_payment_status", table_name="storage_expansion_requests")
    op.drop_constraint(
        "fk_storage_expansion_requests_reviewed_by_users",
        "storage_expansion_requests",
        type_="foreignkey",
    )
    for column in [
        "resolved_at",
        "payment_confirmed_at",
        "payment_submitted_at",
        "quoted_at",
        "reviewed_by",
        "admin_note",
        "payment_reference",
        "payment_status",
        "currency",
        "quoted_price_cents",
    ]:
        op.drop_column("storage_expansion_requests", column)
