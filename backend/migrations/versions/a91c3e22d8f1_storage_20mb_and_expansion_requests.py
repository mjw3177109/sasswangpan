"""20MB free quota and storage expansion requests

Revision ID: a91c3e22d8f1
Revises: f28a16c4b1d2
"""

from alembic import op
import sqlalchemy as sa

revision = "a91c3e22d8f1"
down_revision = "f28a16c4b1d2"
branch_labels = None
depends_on = None

OLD_DEFAULT = 500 * 1024 * 1024 * 1024
FREE_QUOTA = 20 * 1024 * 1024


def upgrade() -> None:
    op.alter_column(
        "users",
        "storage_quota_bytes",
        existing_type=sa.BigInteger(),
        server_default=sa.text(str(FREE_QUOTA)),
        existing_nullable=False,
    )
    # Only shrink accounts that still have the old untouched default. Manually
    # expanded/customized accounts are preserved.
    op.execute(
        sa.text("UPDATE users SET storage_quota_bytes = :new WHERE storage_quota_bytes = :old")
        .bindparams(new=FREE_QUOTA, old=OLD_DEFAULT)
    )
    op.create_table(
        "storage_expansion_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("current_quota_bytes", sa.BigInteger(), nullable=False),
        sa.Column("requested_quota_bytes", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_storage_expansion_requests_user_id", "storage_expansion_requests", ["user_id"])
    op.create_index("ix_storage_expansion_requests_status", "storage_expansion_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_storage_expansion_requests_status", table_name="storage_expansion_requests")
    op.drop_index("ix_storage_expansion_requests_user_id", table_name="storage_expansion_requests")
    op.drop_table("storage_expansion_requests")
    op.alter_column(
        "users",
        "storage_quota_bytes",
        existing_type=sa.BigInteger(),
        server_default=sa.text(str(OLD_DEFAULT)),
        existing_nullable=False,
    )
