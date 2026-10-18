"""workspace unfiled display name

Revision ID: f07d9e0b84d2
Revises: e47a11df1031
Create Date: 2026-09-16 22:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f07d9e0b84d2"
down_revision: str | Sequence[str] | None = "e47a11df1031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("unfiled_name", sa.String(length=160), nullable=False, server_default="未归档"),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "unfiled_name")
