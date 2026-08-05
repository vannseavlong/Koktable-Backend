import { nanoid } from 'nanoid';

// In-memory stand-in for the real longcelot-sheet-db SheetAdapter, used to unit-test
// services/routes without hitting live Google Sheets. Only implements the subset of
// TableOperations actually exercised by this codebase's services: exact-match `where`
// (no operators — nothing here uses anything else), orderBy/order, limit/offset, and
// a hard delete (no service in this repo calls .delete() on a softDelete-schema table
// today, so soft-delete semantics aren't modeled).
//
// Module-level singleton (mirrors src/lib/adapter.ts's own `adapter` singleton) so
// `vi.mock('../lib/adapter', () => import('../testUtils/fakeAdapter'))` in a test file
// and this same module's `reset()`/`seed()` calls share one instance without fighting
// vitest's `vi.mock` hoisting rules.

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface FindOptions {
  where?: Where;
  orderBy?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// A blank Sheets cell round-trips as `null`, not `''` (confirmed against live data —
// see the comment in merchantApplications.service.ts's resendInvite for the bug this
// caught). Normalize on write so a `where: { someField: '' }` fails to match here the
// same way it silently fails to match against the real adapter, instead of the fake
// giving false confidence that exact-empty-string matching works.
function normalizeBlanks(data: Row): Row {
  const normalized: Row = {};
  for (const [key, value] of Object.entries(data)) {
    normalized[key] = value === '' ? null : value;
  }
  return normalized;
}

function matches(row: Row, where?: Where): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function sortRows(rows: Row[], orderBy?: string, order: 'asc' | 'desc' = 'asc'): Row[] {
  if (!orderBy) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = a[orderBy];
    const bv = b[orderBy];
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av ?? '').localeCompare(String(bv ?? ''));
  });
  return order === 'desc' ? sorted.reverse() : sorted;
}

class FakeTable {
  constructor(private rows: Row[]) {}

  async findMany(options: FindOptions = {}): Promise<Row[]> {
    let result = this.rows.filter((r) => matches(r, options.where));
    result = sortRows(result, options.orderBy, options.order);
    if (options.offset !== undefined) result = result.slice(options.offset);
    if (options.limit  !== undefined) result = result.slice(0, options.limit);
    return result.map((r) => ({ ...r }));
  }

  async findOne(options: FindOptions = {}): Promise<Row | null> {
    const sorted = sortRows(this.rows.filter((r) => matches(r, options.where)), options.orderBy, options.order);
    return sorted[0] ? { ...sorted[0] } : null;
  }

  async create(data: Row): Promise<Row> {
    const now = new Date().toISOString();
    const row: Row = { _id: nanoid(12), _created_at: now, _updated_at: now, _deleted_at: null, ...normalizeBlanks(data) };
    this.rows.push(row);
    return { ...row };
  }

  async update({ where, data }: { where: Where; data: Row }): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    this.rows.forEach((row, i) => {
      if (matches(row, where)) {
        this.rows[i] = { ...row, ...normalizeBlanks(data), _updated_at: now };
        count += 1;
      }
    });
    return count;
  }

  async delete({ where }: { where: Where }): Promise<number> {
    const kept = this.rows.filter((r) => !matches(r, where));
    const removed = this.rows.length - kept.length;
    this.rows.length = 0;
    this.rows.push(...kept);
    return removed;
  }

  async count(options: Pick<FindOptions, 'where'> = {}): Promise<number> {
    return this.rows.filter((r) => matches(r, options.where)).length;
  }
}

let adminStore: Map<string, Row[]> = new Map();
let userStores: Map<string, Map<string, Row[]>> = new Map();

function adminTable(name: string): FakeTable {
  if (!adminStore.has(name)) adminStore.set(name, []);
  return new FakeTable(adminStore.get(name)!);
}

function userTable(actorSheetId: string, name: string): FakeTable {
  if (!userStores.has(actorSheetId)) userStores.set(actorSheetId, new Map());
  const sheet = userStores.get(actorSheetId)!;
  if (!sheet.has(name)) sheet.set(name, []);
  return new FakeTable(sheet.get(name)!);
}

export function adminContext() {
  return { table: adminTable };
}

// Fakes the `adapter.upload`/`deleteFile` pair (src/utils/imageUpload.ts) so tests
// that exercise image-upload code paths don't need a live Drive/StorageAdapter.
export const adapter = {
  upload: async (_file: Buffer, options: { filename: string }): Promise<string> =>
    `fake://upload/${nanoid(8)}-${options.filename}`,
  deleteFile: async (_url: string): Promise<void> => {},
};

export function userContext(_userId: string, actorSheetId: string) {
  return { table: (name: string) => userTable(actorSheetId, name) };
}

/** Test-only: seed rows directly, bypassing service-layer validation. */
export function seed(scope: 'admin' | (string & {}), tableName: string, rows: Row[]): void {
  const now = new Date().toISOString();
  const filled = rows.map((r) => ({ _id: nanoid(12), _created_at: now, _updated_at: now, _deleted_at: null, ...normalizeBlanks(r) }));
  if (scope === 'admin') {
    adminTable(tableName);
    adminStore.get(tableName)!.push(...filled);
  } else {
    userTable(scope, tableName);
    userStores.get(scope)!.get(tableName)!.push(...filled);
  }
}

/** Call between tests (e.g. beforeEach) to clear all in-memory data. */
export function reset(): void {
  adminStore = new Map();
  userStores = new Map();
}
