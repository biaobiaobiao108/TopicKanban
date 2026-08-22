// All business persistence goes through the authenticated Hono API and D1.
// LocalStorage is reserved for authentication, UI preferences, and draft recovery.
export * from './remoteStorage';

export function initializeStorage(): void {
  // Kept as a compatibility no-op while callers migrate to query hooks.
}
