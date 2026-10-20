import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  kind: text('kind').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: integer('version').notNull().default(1),
}, table => [index('records_owner_kind').on(table.ownerId, table.kind)]);
