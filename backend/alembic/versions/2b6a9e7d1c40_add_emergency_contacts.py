"""Add user emergency contacts."""
from alembic import op
import sqlalchemy as sa

revision = "2b6a9e7d1c40"
down_revision = "c91da9842130"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "emergency_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("contact_type", sa.String(8), nullable=False),
        sa.Column("value", sa.String(320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.CheckConstraint("contact_type IN ('EMAIL', 'PHONE')", name="check_emergency_contact_type"),
        sa.UniqueConstraint("account_id", "contact_type", "value", name="uq_emergency_contact_account_type_value"),
    )
    op.create_index("ix_emergency_contacts_account_id", "emergency_contacts", ["account_id"])

def downgrade() -> None:
    op.drop_index("ix_emergency_contacts_account_id", table_name="emergency_contacts")
    op.drop_table("emergency_contacts")
