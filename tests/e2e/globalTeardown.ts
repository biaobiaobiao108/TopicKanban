import { rm } from 'node:fs/promises';

export default async function globalTeardown(): Promise<void> {
  const dataDir = process.env.TOPIC_KANBAN_E2E_DATA_DIR;
  if (!dataDir || !dataDir.includes('/test-results/e2e-data-')) return;
  await rm(dataDir, { recursive: true, force: true });
}
