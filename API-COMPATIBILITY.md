# API Compatibility: JsonStore vs DbStore

Both `JsonStore` and `DbStore` implement the same public API interface, ensuring drop-in compatibility.

## Public API Methods (Implemented by Both)

- `subscribe(chatId, walletAddress, frequencySeconds)` - Subscribe a chat to wallet notifications
- `unsubscribe(chatId)` - Unsubscribe a chat from notifications
- `getSubscription(chatId)` - Get subscription info for a chat
- `getAllMonitoredWallets()` - Get all unique wallet addresses being monitored
- `getChatsForWallet(walletAddress)` - Get all chat IDs subscribed to a wallet
- `shouldNotify(chatId, requestId)` - Check if a notification should be sent based on frequency
- `recordNotification(chatId, requestId)` - Record that a notification was sent
- `cleanupInactiveRequests(chatId, activeRequestIds)` - Clean up notification history for inactive requests
- `shouldSendCompletion(chatId, requestCount)` - Check if we should send the completion notification
- `markCompletionSent(chatId)` - Mark that completion notification was sent
- `resetCompletionStatus(chatId)` - Reset completion status
- `getStats()` - Get stats for monitoring
- `close()` - Close/cleanup (save final state for JSON, close DB connection for SQLite)

## Implementation-Specific Methods

### JsonStore Only
- `loadData()` - Internal method to load JSON from disk
- `saveData()` - Internal method to save JSON to disk

### DbStore Only
- `initializeTables()` - Internal method to create database tables

## Migration Notes

The stores are **100% compatible** for all external usage. The differences in internal methods do not affect the public API:

- JsonStore uses `loadData()`/`saveData()` for explicit persistence
- DbStore uses SQL transactions for automatic persistence
- Both provide identical functionality to the rest of the application
