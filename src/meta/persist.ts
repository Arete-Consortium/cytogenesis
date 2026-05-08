/**
 * IndexedDB-backed persistence for run history. Single object store
 * (`meta`) holds simple keyed values: `best` (BestRun) + `runCount`.
 * Schema is versioned so future fields can migrate cleanly.
 */
import { openDB, type IDBPDatabase } from "idb";

export interface BestRun {
  peakCaptured: number;
  durationMs: number;
  bonds: number;
  endedAtUnix: number;
}

const DB_NAME = "cytogenesis";
const DB_VERSION = 1;
const STORE = "meta";

let dbPromise: Promise<IDBPDatabase> | null = null;

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function getDb(): Promise<IDBPDatabase> | null {
  if (!isAvailable()) return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function loadBest(): Promise<BestRun | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const db = await p;
    const v = await db.get(STORE, "best");
    return (v as BestRun | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function recordRun(
  run: Omit<BestRun, "endedAtUnix">,
): Promise<{ best: BestRun | null; isNewBest: boolean }> {
  const p = getDb();
  if (!p) return { best: null, isNewBest: false };
  try {
    const db = await p;
    const prev = (await db.get(STORE, "best")) as BestRun | undefined;
    // "Best" rules: higher peak wins; ties broken by longer duration.
    const isNewBest =
      !prev ||
      run.peakCaptured > prev.peakCaptured ||
      (run.peakCaptured === prev.peakCaptured && run.durationMs > prev.durationMs);
    if (isNewBest) {
      const next: BestRun = { ...run, endedAtUnix: Date.now() };
      await db.put(STORE, next, "best");
      return { best: next, isNewBest: true };
    }
    return { best: prev, isNewBest: false };
  } catch {
    return { best: null, isNewBest: false };
  }
}

export async function loadRunCount(): Promise<number> {
  const p = getDb();
  if (!p) return 0;
  try {
    const db = await p;
    return ((await db.get(STORE, "runCount")) ?? 0) as number;
  } catch {
    return 0;
  }
}

export async function bumpRunCount(): Promise<number> {
  const p = getDb();
  if (!p) return 0;
  try {
    const db = await p;
    const n = ((await db.get(STORE, "runCount")) ?? 0) as number;
    await db.put(STORE, n + 1, "runCount");
    return n + 1;
  } catch {
    return 0;
  }
}
