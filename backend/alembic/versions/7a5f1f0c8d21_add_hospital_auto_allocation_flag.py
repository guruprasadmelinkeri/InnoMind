"""Add hospital automatic allocation flag

Revision ID: 7a5f1f0c8d21
Revises: 1c38e13ce9fb
Create Date: 2026-10-10 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a5f1f0c8d21'
down_revision: Union[str, Sequence[str], None] = '1c38e13ce9fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'hospitals',
        sa.Column('automatic_resource_allocation', sa.Boolean(), nullable=False, server_default=sa.true())
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('hospitals', 'automatic_resource_allocation')
