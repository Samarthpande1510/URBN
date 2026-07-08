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
    # refresh_tokens
    add_col('refresh_tokens', 'device_label VARCHAR')

    # products
    add_col('products', 'status_changed_at TIMESTAMP')
    add_col('products', 'rejected_by VARCHAR')
    add_col('products', 'archive_remarks TEXT')
    add_col('products', 'version INTEGER DEFAULT 1')
    add_col('products', 'sample_version INTEGER DEFAULT 1')

    # order_decisions
    add_col('order_decisions', 'order_archived BOOLEAN DEFAULT false')

    # golden_workflows
    add_col('golden_workflows', 'purchase_notified_at TIMESTAMP')
    add_col('golden_workflows', 'order_confirmed_at TIMESTAMP')
    add_col('golden_workflows', 'packaging_archived BOOLEAN DEFAULT false')

    # factory_comms
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS factory_comms (
            id SERIAL PRIMARY KEY,
            product_id INTEGER UNIQUE REFERENCES products(id) ON DELETE CASCADE,
            decided_action VARCHAR,
            decided_at TIMESTAMP,
            acknowledged_at TIMESTAMP,
            reply_at TIMESTAMP,
            reply_text TEXT,
            tentative_return_date DATE,
            expected_reply_date DATE,
            reply_received_at TIMESTAMP,
            reply_summary VARCHAR,
            reply_notes TEXT,
            partial_resolved_at TIMESTAMP,
            internal_decision VARCHAR,
            internal_decision_at TIMESTAMP,
            internal_decision_by VARCHAR,
            internal_decision_notes TEXT,
            improvement_sample_expected BOOLEAN DEFAULT false,
            improvement_sample_expected_date DATE,
            improvement_sample_received_at TIMESTAMP,
            case_log JSON
        )
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS factory_comm_edits (
            id SERIAL PRIMARY KEY,
            factory_comm_id INTEGER REFERENCES factory_comms(id) ON DELETE CASCADE,
            edited_at TIMESTAMP DEFAULT NOW(),
            previous_reply TEXT,
            previous_date DATE
        )
    """))

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
