import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { subscriptions, notificationHistory, completionStatus } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * SQLite-based persistent storage using Drizzle ORM
 * More scalable than JSON files for production use
 */
export class DbStore {
  constructor(dbPath = null) {
    // Default to data/bot-data.sqlite relative to project root
    const defaultPath = path.join(__dirname, '../../data/bot-data.sqlite');
    this.dbPath = dbPath || defaultPath;

    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    this.sqlite = new Database(this.dbPath);
    this.db = drizzle(this.sqlite);

    // Create tables if they don't exist
    this.initializeTables();
    console.log('✅ SQLite store initialized');
  }

  /**
   * Initialize database tables
   */
  initializeTables() {
    // Create subscriptions table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        chat_id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        frequency_seconds INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create notification_history table with composite index
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        first_notified_at INTEGER NOT NULL,
        last_notified_at INTEGER NOT NULL,
        UNIQUE(chat_id, request_id)
      )
    `);

    // Create index for efficient lookups
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_history_chat_id 
      ON notification_history(chat_id)
    `);

    // Create completion_status table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS completion_status (
        chat_id TEXT PRIMARY KEY,
        completion_sent INTEGER NOT NULL DEFAULT 0,
        last_request_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Subscribe a chat to notifications for a wallet
   */
  subscribe(chatId, walletAddress, frequencySeconds) {
    const now = Date.now();
    const chatIdStr = chatId.toString();

    // Insert or replace subscription
    this.sqlite.prepare(`
      INSERT OR REPLACE INTO subscriptions 
      (chat_id, wallet_address, frequency_seconds, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, COALESCE((SELECT created_at FROM subscriptions WHERE chat_id = ?), ?), ?)
    `).run(chatIdStr, walletAddress.toLowerCase(), frequencySeconds, chatIdStr, now, now);

    // Reset completion status
    this.sqlite.prepare('DELETE FROM completion_status WHERE chat_id = ?').run(chatIdStr);

    console.log(`✓ Subscribed chat ${chatId} to wallet ${walletAddress} (freq: ${frequencySeconds}s)`);
  }

  /**
   * Unsubscribe a chat from notifications
   */
  unsubscribe(chatId) {
    const chatIdStr = chatId.toString();

    // Check if subscription exists
    const sub = this.sqlite.prepare('SELECT 1 FROM subscriptions WHERE chat_id = ?').get(chatIdStr);
    
    if (sub) {
      // Delete subscription
      this.sqlite.prepare('DELETE FROM subscriptions WHERE chat_id = ?').run(chatIdStr);

      // Clean up related data
      this.sqlite.prepare('DELETE FROM notification_history WHERE chat_id = ?').run(chatIdStr);
      this.sqlite.prepare('DELETE FROM completion_status WHERE chat_id = ?').run(chatIdStr);

      console.log(`✓ Unsubscribed chat ${chatId}`);
      return true;
    }
    return false;
  }

  /**
   * Get subscription info for a chat
   */
  getSubscription(chatId) {
    const chatIdStr = chatId.toString();
    const sub = this.sqlite.prepare(
      'SELECT wallet_address, frequency_seconds, active FROM subscriptions WHERE chat_id = ?'
    ).get(chatIdStr);

    if (!sub) return null;

    return {
      walletAddress: sub.wallet_address,
      frequencySeconds: sub.frequency_seconds,
      active: Boolean(sub.active)
    };
  }

  /**
   * Get all unique wallet addresses being monitored
   */
  getAllMonitoredWallets() {
    const rows = this.sqlite.prepare(
      'SELECT DISTINCT wallet_address FROM subscriptions WHERE active = 1'
    ).all();

    return rows.map(row => row.wallet_address);
  }

  /**
   * Get all chat IDs subscribed to a wallet
   */
  getChatsForWallet(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    const rows = this.sqlite.prepare(
      'SELECT chat_id FROM subscriptions WHERE active = 1 AND wallet_address = ?'
    ).all(normalizedAddress);

    return rows.map(row => parseInt(row.chat_id));
  }

  /**
   * Check if a notification should be sent based on frequency
   */
  shouldNotify(chatId, requestId) {
    const chatIdStr = chatId.toString();

    // Get subscription
    const sub = this.sqlite.prepare(
      'SELECT frequency_seconds FROM subscriptions WHERE chat_id = ?'
    ).get(chatIdStr);

    if (!sub) return false;

    // Get notification history
    const history = this.sqlite.prepare(
      'SELECT last_notified_at FROM notification_history WHERE chat_id = ? AND request_id = ?'
    ).get(chatIdStr, requestId);

    // First notification - always send
    if (!history) {
      return true;
    }

    // Check if enough time has passed based on frequency
    const now = Date.now();
    const timeSinceLastNotification = now - history.last_notified_at;
    const frequencyMs = sub.frequency_seconds * 1000;

    return timeSinceLastNotification >= frequencyMs;
  }

  /**
   * Record that a notification was sent
   */
  recordNotification(chatId, requestId) {
    const chatIdStr = chatId.toString();
    const now = Date.now();

    // Insert or update notification history
    this.sqlite.prepare(`
      INSERT INTO notification_history (chat_id, request_id, first_notified_at, last_notified_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chat_id, request_id) 
      DO UPDATE SET last_notified_at = ?
    `).run(chatIdStr, requestId, now, now, now);
  }

  /**
   * Clean up notification history for inactive requests
   */
  cleanupInactiveRequests(chatId, activeRequestIds) {
    const chatIdStr = chatId.toString();

    if (activeRequestIds.length === 0) {
      // Delete all notification history for this chat
      this.sqlite.prepare('DELETE FROM notification_history WHERE chat_id = ?').run(chatIdStr);
    } else {
      // Delete notifications not in active list
      const placeholders = activeRequestIds.map(() => '?').join(',');
      this.sqlite.prepare(
        `DELETE FROM notification_history WHERE chat_id = ? AND request_id NOT IN (${placeholders})`
      ).run(chatIdStr, ...activeRequestIds);
    }
  }

  /**
   * Check if we should send the completion notification
   */
  shouldSendCompletion(chatId, requestCount) {
    const chatIdStr = chatId.toString();
    const now = Date.now();

    const status = this.sqlite.prepare(
      'SELECT completion_sent, last_request_count FROM completion_status WHERE chat_id = ?'
    ).get(chatIdStr);

    // If no status or request count changed from 0 to something else, reset
    if (!status || (status.last_request_count === 0 && requestCount > 0)) {
      this.sqlite.prepare(`
        INSERT OR REPLACE INTO completion_status (chat_id, completion_sent, last_request_count, updated_at)
        VALUES (?, 0, ?, ?)
      `).run(chatIdStr, requestCount, now);
      return requestCount === 0;
    }

    // If request count is 0 and we haven't sent completion yet
    if (requestCount === 0 && !status.completion_sent) {
      return true;
    }

    // Update request count for tracking
    if (status.last_request_count !== requestCount) {
      const completionSent = requestCount > 0 ? 0 : status.completion_sent;
      this.sqlite.prepare(`
        UPDATE completion_status 
        SET last_request_count = ?, completion_sent = ?, updated_at = ?
        WHERE chat_id = ?
      `).run(requestCount, completionSent, now, chatIdStr);
    }

    return false;
  }

  /**
   * Mark that completion notification was sent
   */
  markCompletionSent(chatId) {
    const chatIdStr = chatId.toString();
    const now = Date.now();

    this.sqlite.prepare(`
      INSERT OR REPLACE INTO completion_status (chat_id, completion_sent, last_request_count, updated_at)
      VALUES (?, 1, COALESCE((SELECT last_request_count FROM completion_status WHERE chat_id = ?), 0), ?)
    `).run(chatIdStr, chatIdStr, now);
  }

  /**
   * Reset completion status
   */
  resetCompletionStatus(chatId) {
    const chatIdStr = chatId.toString();
    this.sqlite.prepare('DELETE FROM completion_status WHERE chat_id = ?').run(chatIdStr);
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    const activeSubscriptions = this.sqlite.prepare(
      'SELECT COUNT(*) as count FROM subscriptions WHERE active = 1'
    ).get().count;

    const uniqueWallets = this.sqlite.prepare(
      'SELECT COUNT(DISTINCT wallet_address) as count FROM subscriptions WHERE active = 1'
    ).get().count;

    const notificationHistoryCount = this.sqlite.prepare(
      'SELECT COUNT(*) as count FROM notification_history'
    ).get().count;

    return {
      totalSubscriptions: activeSubscriptions,
      totalWallets: uniqueWallets,
      totalNotificationHistory: notificationHistoryCount
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.sqlite.close();
    console.log('✅ SQLite store closed');
  }
}
