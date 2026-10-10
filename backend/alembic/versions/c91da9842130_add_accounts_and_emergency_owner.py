"""Add role accounts and optional emergency ownership.

Revision ID: c91da9842130
Revises: faf69178fbb9
"""
from alembic import op
import sqlalchemy as sa

revision = "c91da9842130"
down_revision = "faf69178fbb9"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("hospital_id", sa.Integer(), nullable=True),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_accounts_email", "accounts", ["email"])
    op.create_index("ix_accounts_role", "accounts", ["role"])
    op.create_index("ix_accounts_hospital_id", "accounts", ["hospital_id"])
    with op.batch_alter_table("emergency_cases") as batch:
        batch.add_column(sa.Column("created_by_account_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_emergency_cases_created_by_account", "accounts", ["created_by_account_id"], ["id"], ondelete="SET NULL")
        batch.add_column(sa.Column("assigned_doctor_name", sa.String(160), nullable=True))
    op.create_index("ix_emergency_cases_created_by_account_id", "emergency_cases", ["created_by_account_id"])

def downgrade() -> None:
    op.drop_index("ix_emergency_cases_created_by_account_id", table_name="emergency_cases")
    with op.batch_alter_table("emergency_cases") as batch:
        batch.drop_column("assigned_doctor_name")
        batch.drop_constraint("fk_emergency_cases_created_by_account", type_="foreignkey")
        batch.drop_column("created_by_account_id")
    op.drop_index("ix_accounts_hospital_id", table_name="accounts")
    op.drop_index("ix_accounts_role", table_name="accounts")
    op.drop_index("ix_accounts_email", table_name="accounts")
    op.drop_table("accounts")
