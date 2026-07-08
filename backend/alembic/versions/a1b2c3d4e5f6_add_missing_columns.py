"""add_missing_columns

Revision ID: a1b2c3d4e5f6
Revises: cd8506be469d
Create Date: 2026-07-08 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'cd8506be469d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # refresh_tokens
    op.add_column('refresh_tokens', sa.Column('device_label', sa.String(), nullable=True))

    # products
    op.add_column('products', sa.Column('status_changed_at', sa.DateTime(), nullable=True))
    op.add_column('products', sa.Column('rejected_by', sa.String(), nullable=True))
    op.add_column('products', sa.Column('archive_remarks', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('version', sa.Integer(), nullable=True, server_default='1'))
    op.add_column('products', sa.Column('sample_version', sa.Integer(), nullable=True, server_default='1'))

    # order_decisions
    op.add_column('order_decisions', sa.Column('order_archived', sa.Boolean(), nullable=True, server_default='false'))

    # golden_workflows
    op.add_column('golden_workflows', sa.Column('purchase_notified_at', sa.DateTime(), nullable=True))
    op.add_column('golden_workflows', sa.Column('order_confirmed_at', sa.DateTime(), nullable=True))
    op.add_column('golden_workflows', sa.Column('packaging_archived', sa.Boolean(), nullable=True, server_default='false'))

    # login_attempts
    op.create_table(
        'login_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(), nullable=False, index=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('succeeded', sa.Boolean(), nullable=False),
        sa.Column('attempted_at', sa.DateTime(), nullable=True),
    )

    # notification_dismissals (if missing)
    op.create_table(
        'notification_dismissals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('notification_id', sa.Integer(), sa.ForeignKey('notifications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dismissed_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('notification_dismissals')
    op.drop_table('login_attempts')
    op.drop_column('golden_workflows', 'packaging_archived')
    op.drop_column('golden_workflows', 'order_confirmed_at')
    op.drop_column('golden_workflows', 'purchase_notified_at')
    op.drop_column('order_decisions', 'order_archived')
    op.drop_column('products', 'sample_version')
    op.drop_column('products', 'version')
    op.drop_column('products', 'archive_remarks')
    op.drop_column('products', 'rejected_by')
    op.drop_column('products', 'status_changed_at')
    op.drop_column('refresh_tokens', 'device_label')
