"""Add batch outcome and explanation to emergency_case

Revision ID: faf69178fbb9
Revises: 7a5f1f0c8d21
Create Date: 2026-10-10 16:07:15.373901

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'faf69178fbb9'
down_revision: Union[str, Sequence[str], None] = '7a5f1f0c8d21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add batch_outcome and batch_explanation columns to emergency_case table
    op.add_column('emergency_cases', sa.Column('batch_outcome', sa.String(), nullable=True))
    op.add_column('emergency_cases', sa.Column('batch_explanation', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove batch_outcome and batch_explanation columns
    op.drop_column('emergency_cases', 'batch_explanation')
    op.drop_column('emergency_cases', 'batch_outcome')