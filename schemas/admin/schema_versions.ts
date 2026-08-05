import { defineTable, string, number } from 'longcelot-sheet-db';

export default defineTable({
  name: 'schema_versions',
  actor: 'admin',
  columns: {
    schema_version_id: string().primary(),
    actor_sheet_id: string().required(),
    table_name: string().required(),
    schema_hash: string().required(),
    synced_at: string().required(),
    column_count: number().required(),
  },
});
