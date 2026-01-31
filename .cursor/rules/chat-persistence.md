# Chat Message Persistence Rules

## Critical Pattern: Preventing Message Loss During Sync

When implementing chat components with Convex persistence, follow these rules to prevent messages from disappearing:

### 1. Never Sync During Active Streaming

**Rule**: The sync effect MUST skip when:
- `status === 'submitted'` or `status === 'streaming'`
- `hasUnsavedAssistantMessage === true` (message is still being generated)
- Any assistant messages exist in current messages but NOT in persistedMessages

```typescript
// ✅ CORRECT: Check for unsaved messages before syncing
if (status === 'streaming' || hasUnsavedAssistantMessage) {
  return; // Skip sync
}

// Check for unsaved assistant messages
const unsavedAssistantMessages = currentAssistantMessages.filter(
  m => !persistedAssistantIds.has(m.id)
);
if (unsavedAssistantMessages.length > 0) {
  return; // Skip sync - messages not yet persisted
}
```

### 2. Always Wait After Saving Before Syncing

**Rule**: After saving a message, wait at least 3-5 seconds before allowing sync to ensure Convex query has updated.

```typescript
// ✅ CORRECT: Track save time and prevent premature sync
const lastSaveTimeRef = useRef<number>(0);

// After saving
lastSaveTimeRef.current = Date.now();

// In sync effect
const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
if (timeSinceLastSave < 3000) {
  return; // Skip sync - wait for Convex to update
}
```

### 3. Use Dual Save Strategy

**Rule**: Save assistant messages in BOTH:
1. `onFinish` callback (primary)
2. When message appears complete in messages array (backup)

This ensures messages are saved even if `onFinish` doesn't fire or component remounts.

```typescript
// ✅ CORRECT: Save in onFinish
onFinish: (message) => {
  if (message.role === 'assistant' && !savedMessageIdsRef.current.has(message.id)) {
    saveMessage({ ... });
  }
}

// ✅ CORRECT: Also save when message appears complete
useEffect(() => {
  messages.forEach((message) => {
    if (message.role === 'assistant' && isComplete && !savedMessageIdsRef.current.has(message.id)) {
      saveMessage({ ... }); // Backup save
    }
  });
}, [messages, status]);
```

### 4. Store useChat Message IDs in Convex

**Rule**: Always store the `useChat` message ID (`message.id`) in Convex, not just Convex `_id`. This allows proper matching when syncing.

```typescript
// ✅ CORRECT: Store messageId from useChat
saveMessage({
  projectId,
  role: 'assistant',
  content: textContent,
  messageId: message.id, // Store useChat ID for matching
  ...
});

// ✅ CORRECT: Use messageId when syncing
const persistedMessageIds = new Set(
  persistedMessages.map(msg => msg.messageId || msg._id)
);
```

### 5. Check Message Counts Before Syncing

**Rule**: Never sync if current assistant message count exceeds persisted count - this indicates unsaved messages.

```typescript
// ✅ CORRECT: Compare counts
const currentAssistantCount = messages.filter(m => m.role === 'assistant').length;
const persistedAssistantCount = persistedMessages.filter(m => m.role === 'assistant').length;

if (currentAssistantCount > persistedAssistantCount) {
  return; // Skip sync - messages not yet persisted
}
```

### 6. Extended Wait After Remount

**Rule**: When component remounts (`messages.length === 0`), wait longer (5+ seconds) if a save was recent to ensure persistence.

```typescript
// ✅ CORRECT: Extended wait after remount
if (messages.length === 0 && persistedMessages.length > 0 && timeSinceLastSave < 5000) {
  return; // Skip sync - wait for recent saves to persist
}
```

### 7. Track Saved Message IDs

**Rule**: Use a ref to track which messages have been saved to prevent duplicate saves and detect unsaved messages.

```typescript
// ✅ CORRECT: Track saved messages
const savedMessageIdsRef = useRef<Set<string>>(new Set());

// Mark as saved immediately
savedMessageIdsRef.current.add(message.id);

// Check before saving
if (savedMessageIdsRef.current.has(message.id)) {
  return; // Already saved
}
```

## Anti-Patterns to Avoid

❌ **DON'T**: Sync immediately after streaming completes without checking if message is saved
❌ **DON'T**: Sync when `messages.length === 0` without checking recent save activity
❌ **DON'T**: Rely only on `onFinish` callback - it may not fire on remount
❌ **DON'T**: Use Convex `_id` alone for matching - use `messageId` from useChat
❌ **DON'T**: Sync without comparing assistant message counts

## Testing Checklist

Before merging chat persistence code:
- [ ] Messages persist after navigating away and back
- [ ] Messages persist after component remount
- [ ] Messages persist after mode switch (research ↔ studio)
- [ ] No messages lost during streaming
- [ ] No duplicate messages saved
- [ ] Console logs show proper skip conditions
