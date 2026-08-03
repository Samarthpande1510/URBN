"""track each Part 1 confirmation individually, with a tick/untick history

The UI showed "Confirmed <date>" for each of the four confirmations, but that
date came from golden_details.saved_at — the whole-record save time — so all
four always displayed the same moment regardless of when each was actually
ticked. This adds a real timestamp per confirmation plus an append-only log of
every tick/untick.

Backfill note: existing confirmations have no true tick time recorded anywhere,
so confirmed rows are seeded from saved_at. That is an approximation of when the
box was ticked, not a measurement of it.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-04 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FIELDS = ["colour", "logo_marking", "rating_label", "bom"]


def upgrade() -> None:
    conn = op.get_bind()

    for f in FIELDS:
        conn.execute(text(f"ALTER TABLE golden_details ADD COLUMN IF NOT EXISTS {f}_confirmed_at TIMESTAMP"))
    conn.execute(text("ALTER TABLE golden_details ADD COLUMN IF NOT EXISTS confirmation_log JSON DEFAULT '[]'::json"))

    # Seed timestamps for already-confirmed boxes from saved_at (approximate).
    for f in FIELDS:
        conn.execute(text(f"""
            UPDATE golden_details
            SET {f}_confirmed_at = saved_at
            WHERE {f}_confirmed IS TRUE AND {f}_confirmed_at IS NULL
        """))

    conn.execute(text("UPDATE golden_details SET confirmation_log = '[]'::json WHERE confirmation_log IS NULL"))


def downgrade() -> None:
    conn = op.get_bind()
    for f in FIELDS:
        conn.execute(text(f"ALTER TABLE golden_details DROP COLUMN IF EXISTS {f}_confirmed_at"))
    conn.execute(text("ALTER TABLE golden_details DROP COLUMN IF EXISTS confirmation_log"))
