"""add hidden flag to products

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-09 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false"))


def downgrade() -> None:
    op.execute(text("ALTER TABLE products DROP COLUMN IF EXISTS hidden"))
