"""multi-user

Adds `users` and scopes categories, mappings, overrides, synonyms and items
to a user. Existing rows are parked under a placeholder user
(clerk_user_id = 'legacy-owner'); `scripts/claim_legacy.py` moves them to
the real owner after they sign in once.

Revision ID: a100f294faa3
Revises: 668666f81a45
Create Date: 2026-09-05 02:12:55.652239

"""
import uuid

from alembic import op
import sqlalchemy as sa


revision = 'a100f294faa3'
down_revision = '668666f81a45'
branch_labels = None
depends_on = None

LEGACY_ID = str(uuid.uuid4())
SCOPED = ("items", "categories", "category_mappings", "merchant_overrides", "reply_synonyms")


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('clerk_user_id', sa.String(), nullable=False),
    sa.Column('telegram_chat_id', sa.String(), nullable=True),
    sa.Column('telegram_link_code', sa.String(), nullable=True),
    sa.Column('telegram_link_code_expires_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('clerk_user_id'),
    sa.UniqueConstraint('telegram_chat_id'),
    sa.UniqueConstraint('telegram_link_code')
    )

    # Placeholder owner for everything that already exists.
    op.execute(
        sa.text("INSERT INTO users (id, clerk_user_id, created_at, last_seen_at) VALUES (:id, 'legacy-owner', now(), now())")
        .bindparams(id=LEGACY_ID)
    )

    # Add user_id nullable, backfill, then tighten.
    for table in SCOPED:
        op.add_column(table, sa.Column('user_id', sa.UUID(), nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET user_id = :id").bindparams(id=LEGACY_ID))
        op.alter_column(table, 'user_id', nullable=False)
        op.create_foreign_key(f'fk_{table}_user', table, 'users', ['user_id'], ['id'])

    op.drop_constraint('categories_name_key', 'categories', type_='unique')
    op.create_unique_constraint('uq_categories_user_name', 'categories', ['user_id', 'name'])
    op.drop_constraint('category_mappings_plaid_code_key', 'category_mappings', type_='unique')
    op.create_unique_constraint('uq_mappings_user_code', 'category_mappings', ['user_id', 'plaid_code'])
    op.drop_constraint('merchant_overrides_merchant_key_key', 'merchant_overrides', type_='unique')
    op.create_unique_constraint('uq_overrides_user_merchant', 'merchant_overrides', ['user_id', 'merchant_key'])
    op.drop_constraint('reply_synonyms_phrase_key', 'reply_synonyms', type_='unique')
    op.create_unique_constraint('uq_synonyms_user_phrase', 'reply_synonyms', ['user_id', 'phrase'])


def downgrade() -> None:
    op.drop_constraint('uq_synonyms_user_phrase', 'reply_synonyms', type_='unique')
    op.create_unique_constraint('reply_synonyms_phrase_key', 'reply_synonyms', ['phrase'])
    op.drop_constraint('uq_overrides_user_merchant', 'merchant_overrides', type_='unique')
    op.create_unique_constraint('merchant_overrides_merchant_key_key', 'merchant_overrides', ['merchant_key'])
    op.drop_constraint('uq_mappings_user_code', 'category_mappings', type_='unique')
    op.create_unique_constraint('category_mappings_plaid_code_key', 'category_mappings', ['plaid_code'])
    op.drop_constraint('uq_categories_user_name', 'categories', type_='unique')
    op.create_unique_constraint('categories_name_key', 'categories', ['name'])
    for table in reversed(SCOPED):
        op.drop_constraint(f'fk_{table}_user', table, type_='foreignkey')
        op.drop_column(table, 'user_id')
    op.drop_table('users')
