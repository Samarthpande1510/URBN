"""keep one NPD report per sample version instead of one per product

Previously npd_reports had a UNIQUE constraint on product_id, so submitting a
report for a revised sample overwrote the earlier one and its attached file was
lost. This adds sample_version and re-keys the uniqueness to
(product_id, sample_version) so every version's report and file is retained.

Existing rows are backfilled with the product's current sample_version, which is
the version they were actually submitted against.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-03 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add the column (nullable first so the backfill can run).
    conn.execute(text("ALTER TABLE npd_reports ADD COLUMN IF NOT EXISTS sample_version INTEGER"))

    # 2. Backfill from the product's current sample_version; default to 1.
    conn.execute(text("""
        UPDATE npd_reports r
        SET sample_version = COALESCE(p.sample_version, 1)
        FROM products p
        WHERE r.product_id = p.id AND r.sample_version IS NULL
    """))
    conn.execute(text("UPDATE npd_reports SET sample_version = 1 WHERE sample_version IS NULL"))

    # 3. Lock it down.
    conn.execute(text("ALTER TABLE npd_reports ALTER COLUMN sample_version SET DEFAULT 1"))
    conn.execute(text("ALTER TABLE npd_reports ALTER COLUMN sample_version SET NOT NULL"))

    # 4. Drop the old one-report-per-product constraint. Its name varies by how
    #    the table was created, so find it rather than guessing.
    rows = conn.execute(text("""
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'npd_reports'
          AND con.contype = 'u'
          AND array_length(con.conkey, 1) = 1
          AND att.attname = 'product_id'
    """)).fetchall()
    for (name,) in rows:
        conn.execute(text(f'ALTER TABLE npd_reports DROP CONSTRAINT IF EXISTS "{name}"'))

    # Same for a bare unique index on product_id, if one exists instead.
    idx = conn.execute(text("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'npd_reports' AND indexdef LIKE '%UNIQUE%(product_id)%'
    """)).fetchall()
    for (name,) in idx:
        conn.execute(text(f'DROP INDEX IF EXISTS "{name}"'))

    # 5. New composite uniqueness + lookup index.
    conn.execute(text("""
        ALTER TABLE npd_reports
        ADD CONSTRAINT uq_npd_report_product_version UNIQUE (product_id, sample_version)
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_npd_reports_product_id ON npd_reports (product_id)"))


def downgrade() -> None:
    conn = op.get_bind()
    # Collapse back to one row per product, keeping the newest version.
    conn.execute(text("""
        DELETE FROM npd_reports r
        USING npd_reports r2
        WHERE r.product_id = r2.product_id
          AND (r.sample_version < r2.sample_version
               OR (r.sample_version = r2.sample_version AND r.id < r2.id))
    """))
    conn.execute(text("ALTER TABLE npd_reports DROP CONSTRAINT IF EXISTS uq_npd_report_product_version"))
    conn.execute(text("DROP INDEX IF EXISTS ix_npd_reports_product_id"))
    conn.execute(text("ALTER TABLE npd_reports ADD CONSTRAINT npd_reports_product_id_key UNIQUE (product_id)"))
    conn.execute(text("ALTER TABLE npd_reports DROP COLUMN IF EXISTS sample_version"))
