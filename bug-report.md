# Bug Report — `longcelot-sheet-db` v0.1.17

**Package:** `longcelot-sheet-db`  
**Version:** `0.1.17`  
**Reported:** 2026-06-15  
**Repo:** https://github.com/vannseavlong/longcelot-sheet-staging

---

## Bug 1 — `sheet-db mock-users` throws `PermissionError` unconditionally

### Command

```bash
sheet-db mock-users 3
```

### Error

```
✖ Failed to create user mock-xxx-0: PermissionError: User does not have permission to access users
✖ Failed to create user mock-xxx-1: PermissionError: User does not have permission to access users
✖ Failed to create user mock-xxx-2: PermissionError: User does not have permission to access users
Done. 0/3 mock users created.
```

### Root cause

`mockUsersCommand` in `dist/cli/commands/mock-users.js` calls
`adapter.createUserSheet(userId, role, email)` directly on the raw adapter — i.e. **without calling `withContext()` first**.

Inside `createUserSheet` (sheetAdapter.js line ~91), the method calls:

```js
const adminTable = this.table('users');
```

`table()` immediately calls `hasPermission(schema)` (line 64):

```js
hasPermission(schema) {
  if (!this.context) return false;   // ← this.context is undefined → returns false
  if (this.context.role === 'admin') return true;
  ...
}
```

Because the raw adapter has no context (`this.context === undefined`), `hasPermission` returns `false` and `table()` throws `PermissionError` every time. **The command can never succeed.**

### Affected file

`dist/cli/commands/mock-users.js` — the adapter is constructed but `withContext()` is never called before `createUserSheet()`.

### Fix

Before calling `createUserSheet`, set an admin context:

```js
// mock-users.js (proposed fix)
const adminAdapter = adapter.withContext({
  userId:       'mock-cli',
  role:         'admin',
  actorSheetId: adminSheetId,
});
const sheetId = await adminAdapter.createUserSheet(userId, role, email);
```

Or, alternatively, make `createUserSheet` detect the absence of a context and fall back to admin privileges internally, since creating user sheets is inherently an admin operation.

### Workaround

Call `adapter.withContext({ role: 'admin', ... })` before invoking `createUserSheet`. See `scripts/mock-users.ts` in this project for a full working replacement.

---

## Bug 2 — `createUserSheet` inserts an incomplete row into the `users` table

### Description

`createUserSheet` hard-codes the fields it writes to the `users` table:

```js
await adminTable.create({
  user_id:        userId,
  role,
  email,
  actor_sheet_id: sheetId,
  created_at:     new Date().toISOString(),
});
```

Any project that adds required columns to the `users` schema beyond these five (e.g. `full_name`, `auth_provider`, `status`) will either:

- Get a `ValidationError` if those columns are marked `.required()`, or  
- End up with permanently empty cells for those columns, causing downstream read failures.

### Fix

`createUserSheet` should accept an optional `extraFields` parameter that is merged into the `create()` call:

```ts
async createUserSheet(
  userId: string,
  role: string,
  email: string,
  extraFields?: Record<string, unknown>,   // ← proposed addition
): Promise<string>
```

### Workaround

After calling `createUserSheet`, immediately call `adapter.table('users').update()` to fill in the missing columns. See `scripts/mock-users.ts`.

---

## Bug 3 — `sheet-db mock-users` CLI ignores the `schemasDir` config option

### Description

`loadSchemasForActor` in `sync.js` and `mock-users.js` always resolves schemas from:

```js
path.join(process.cwd(), 'schemas', role)
```

The `schemasDir` field in `sheet-db.config.ts` is read from the config object but **never applied** to the schema lookup path. Projects that store schemas under `src/schemas/` or any non-default location will always get:

```
⚠️  No schemas found. Nothing to sync.
```

### Fix

Apply the configured `schemasDir` when it is set:

```js
const schemasRoot = config.schemasDir
  ? path.resolve(process.cwd(), config.schemasDir)
  : path.join(process.cwd(), 'schemas');

const actorDir = path.join(schemasRoot, role);
```

### Workaround

Keep schemas at the project root under `./schemas/{role}/` (the hard-coded default path).

---

## Environment

| | |
|---|---|
| Node | v22.19.0 |
| pnpm | 10.29.3 |
| OS | macOS Darwin 25.5.0 |
| `longcelot-sheet-db` | 0.1.17 |
| TypeScript | 6.0.3 |
