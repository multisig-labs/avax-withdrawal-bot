import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Subscriptions table - stores user subscriptions to wallet addresses
 */
export const subscriptions = sqliteTable('subscriptions', {
  chatId: text('chat_id').primaryKey(),
  walletAddress: text('wallet_address').notNull(),
  frequencySeconds: integer('frequency_seconds').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

/**
 * Notification history table - tracks when notifications were sent
 */
export const notificationHistory = sqliteTable('notification_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: text('chat_id').notNull(),
  requestId: text('request_id').notNull(),
  firstNotifiedAt: integer('first_notified_at').notNull(),
  lastNotifiedAt: integer('last_notified_at').notNull()
});

/**
 * Completion status table - tracks completion notification state
 */
export const completionStatus = sqliteTable('completion_status', {
  chatId: text('chat_id').primaryKey(),
  completionSent: integer('completion_sent', { mode: 'boolean' }).notNull().default(false),
  lastRequestCount: integer('last_request_count').notNull().default(0),
  updatedAt: integer('updated_at').notNull()
});
