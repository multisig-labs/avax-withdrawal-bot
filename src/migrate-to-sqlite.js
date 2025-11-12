#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DbStore } from './services/db-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migration utility to convert JSON data to SQLite
 * Usage: node src/migrate-to-sqlite.js [json-file-path] [sqlite-file-path]
 */

const jsonPath = process.argv[2] || path.join(__dirname, '../data/bot-data.json');
const sqlitePath = process.argv[3] || path.join(__dirname, '../data/bot-data.sqlite');

console.log('🔄 Starting migration from JSON to SQLite...');
console.log(`📄 JSON file: ${jsonPath}`);
console.log(`💾 SQLite file: ${sqlitePath}`);

// Check if JSON file exists
if (!fs.existsSync(jsonPath)) {
  console.log('❌ JSON file not found. Nothing to migrate.');
  console.log('✅ You can proceed with the new SQLite storage.');
  process.exit(0);
}

// Check if SQLite file already exists
if (fs.existsSync(sqlitePath)) {
  console.log('⚠️  SQLite database already exists.');
  console.log('💡 To re-migrate, delete the SQLite file first.');
  process.exit(1);
}

try {
  // Load JSON data
  console.log('📖 Reading JSON data...');
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  console.log(`   Found ${Object.keys(jsonData.subscriptions || {}).length} subscriptions`);
  console.log(`   Found ${Object.keys(jsonData.notificationHistory || {}).length} notification history entries`);
  console.log(`   Found ${Object.keys(jsonData.completionStatus || {}).length} completion status entries`);

  // Initialize SQLite store
  console.log('💾 Initializing SQLite database...');
  const store = new DbStore(sqlitePath);

  // Migrate subscriptions
  console.log('🔄 Migrating subscriptions...');
  let migratedSubs = 0;
  for (const [chatId, sub] of Object.entries(jsonData.subscriptions || {})) {
    if (sub.active) {
      store.subscribe(parseInt(chatId), sub.walletAddress, sub.frequencySeconds);
      migratedSubs++;
    }
  }
  console.log(`   ✓ Migrated ${migratedSubs} active subscriptions`);

  // Migrate notification history
  console.log('🔄 Migrating notification history...');
  let migratedHistory = 0;
  for (const [key, history] of Object.entries(jsonData.notificationHistory || {})) {
    const [chatId, requestId] = key.split(':');
    if (chatId && requestId) {
      // Record as if notification was sent
      store.recordNotification(parseInt(chatId), requestId);
      migratedHistory++;
    }
  }
  console.log(`   ✓ Migrated ${migratedHistory} notification history entries`);

  // Migrate completion status
  console.log('🔄 Migrating completion status...');
  let migratedStatus = 0;
  for (const [chatId, status] of Object.entries(jsonData.completionStatus || {})) {
    if (status.completionSent) {
      store.markCompletionSent(parseInt(chatId));
      migratedStatus++;
    }
  }
  console.log(`   ✓ Migrated ${migratedStatus} completion status entries`);

  // Close database
  store.close();

  console.log('✅ Migration completed successfully!');
  console.log(`📊 Stats: ${migratedSubs} subscriptions, ${migratedHistory} notifications, ${migratedStatus} completions`);
  console.log('💡 You can now delete the JSON file or keep it as a backup.');

} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
