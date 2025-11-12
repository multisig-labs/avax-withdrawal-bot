#!/usr/bin/env node
import { DbStore } from './services/db-store.js';
import fs from 'fs';
import path from 'path';

/**
 * Test script to verify DbStore functionality
 */

const testDbPath = '/tmp/test-bot-data.sqlite';

console.log('🧪 Testing DbStore implementation...\n');

// Clean up any existing test database
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

try {
  // Initialize store
  console.log('1️⃣ Testing initialization...');
  const store = new DbStore(testDbPath);
  console.log('   ✓ Store initialized\n');

  // Test subscribe
  console.log('2️⃣ Testing subscribe...');
  store.subscribe(123456, '0x1234567890123456789012345678901234567890', 86400);
  const sub1 = store.getSubscription(123456);
  console.log('   Subscription:', sub1);
  if (!sub1 || sub1.walletAddress !== '0x1234567890123456789012345678901234567890') {
    throw new Error('Subscribe test failed');
  }
  console.log('   ✓ Subscribe works\n');

  // Test getAllMonitoredWallets
  console.log('3️⃣ Testing getAllMonitoredWallets...');
  const wallets = store.getAllMonitoredWallets();
  console.log('   Monitored wallets:', wallets);
  if (wallets.length !== 1) {
    throw new Error('getAllMonitoredWallets test failed');
  }
  console.log('   ✓ getAllMonitoredWallets works\n');

  // Test getChatsForWallet
  console.log('4️⃣ Testing getChatsForWallet...');
  const chats = store.getChatsForWallet('0x1234567890123456789012345678901234567890');
  console.log('   Chats for wallet:', chats);
  if (chats.length !== 1 || chats[0] !== 123456) {
    throw new Error('getChatsForWallet test failed');
  }
  console.log('   ✓ getChatsForWallet works\n');

  // Test shouldNotify (first time should be true)
  console.log('5️⃣ Testing shouldNotify...');
  const shouldNotify1 = store.shouldNotify(123456, 'req_1');
  console.log('   First notification should be sent:', shouldNotify1);
  if (!shouldNotify1) {
    throw new Error('shouldNotify test failed (first notification)');
  }
  console.log('   ✓ shouldNotify works (first time)\n');

  // Test recordNotification
  console.log('6️⃣ Testing recordNotification...');
  store.recordNotification(123456, 'req_1');
  const shouldNotify2 = store.shouldNotify(123456, 'req_1');
  console.log('   Second notification should NOT be sent immediately:', shouldNotify2);
  if (shouldNotify2) {
    throw new Error('recordNotification test failed');
  }
  console.log('   ✓ recordNotification works\n');

  // Test cleanupInactiveRequests
  console.log('7️⃣ Testing cleanupInactiveRequests...');
  store.recordNotification(123456, 'req_2');
  store.recordNotification(123456, 'req_3');
  store.cleanupInactiveRequests(123456, ['req_1', 'req_2']);
  // req_3 should be deleted
  console.log('   ✓ cleanupInactiveRequests works\n');

  // Test completion status
  console.log('8️⃣ Testing completion status...');
  const shouldSend1 = store.shouldSendCompletion(123456, 5);
  console.log('   Should send completion with 5 requests:', shouldSend1);
  const shouldSend2 = store.shouldSendCompletion(123456, 0);
  console.log('   Should send completion with 0 requests:', shouldSend2);
  if (!shouldSend2) {
    throw new Error('shouldSendCompletion test failed');
  }
  store.markCompletionSent(123456);
  const shouldSend3 = store.shouldSendCompletion(123456, 0);
  console.log('   Should NOT send completion again:', shouldSend3);
  if (shouldSend3) {
    throw new Error('markCompletionSent test failed');
  }
  console.log('   ✓ Completion status works\n');

  // Test multiple subscriptions
  console.log('9️⃣ Testing multiple subscriptions...');
  store.subscribe(789012, '0xABCDEF1234567890123456789012345678901234', 43200);
  const allWallets = store.getAllMonitoredWallets();
  console.log('   Total monitored wallets:', allWallets.length);
  if (allWallets.length !== 2) {
    throw new Error('Multiple subscriptions test failed');
  }
  console.log('   ✓ Multiple subscriptions work\n');

  // Test unsubscribe
  console.log('🔟 Testing unsubscribe...');
  const unsubResult = store.unsubscribe(123456);
  console.log('   Unsubscribe result:', unsubResult);
  if (!unsubResult) {
    throw new Error('Unsubscribe test failed');
  }
  const sub2 = store.getSubscription(123456);
  console.log('   Subscription after unsubscribe:', sub2);
  if (sub2 !== null) {
    throw new Error('Unsubscribe cleanup test failed');
  }
  console.log('   ✓ Unsubscribe works\n');

  // Test stats
  console.log('1️⃣1️⃣ Testing getStats...');
  const stats = store.getStats();
  console.log('   Stats:', stats);
  if (stats.totalSubscriptions !== 1) {
    throw new Error('getStats test failed');
  }
  console.log('   ✓ getStats works\n');

  // Close store
  store.close();

  console.log('✅ All tests passed!');
  console.log(`📁 Test database created at: ${testDbPath}`);
  console.log('💡 You can inspect it with: sqlite3 ' + testDbPath);

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
