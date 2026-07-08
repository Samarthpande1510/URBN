"""add_missing_columns

Revision ID: a1b2c3d4e5f6
Revises: cd8506be469d
Create Date: 2026-07-08 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'cd8506be469d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def add_col(table, col_sql):
    op.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_sql}"))


def upgrade() -> None:
    add_col('refresh_tokens', 'device_label VARCHAR')

    add_col('products', 'status_changed_at TIMESTAMP')
    add_col('products', 'rejected_by VARCHAR')
    add_col('products', 'archive_remarks TEXT')
    add_col('products', 'version INTEGER DEFAULT 1')
    add_col('products', 'sample_version INTEGER DEFAULT 1')

    add_col('order_decisions', 'order_archived BOOLEAN DEFAULT false')

    add_col('golden_workflows', 'purchase_notified_at TIMESTAMP')
    add_col('golden_workflows', 'order_confirmed_at TIMESTAMP')
    add_col('golden_workflows', 'packaging_archived BOOLEAN DEFAULT false')

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS login_attempts (
            id SERIAL PRIMARY KEY,
            email VARCHAR NOT NULL,
            ip_address VARCHAR,
            succeeded BOOLEAN NOT NULL,
            attempted_at TIMESTAMP DEFAULT NOW()
        )
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS notification_dismissals (
            id SERIAL PRIMARY KEY,
            notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            dismissed_at TIMESTAMP DEFAULT NOW()
        )
    """))


def downgrade() -> None:
    pass
