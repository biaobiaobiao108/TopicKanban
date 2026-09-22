// All business persistence goes through the authenticated Bun API and SQLite.
// LocalStorage is reserved for authentication, UI preferences, and draft recovery.
export * from './remoteStorage';
