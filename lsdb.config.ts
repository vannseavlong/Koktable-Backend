export default {
  projectName: "restaurant_sheetDB",
  superAdminEmail: "seavlongvann55@gmail.com",
  actors: [
  {
    "name": "admin",
    "sheetIdEnv": "ADMIN_SHEET_ID"
  },
  {
    "name": "user",
    "sheetIdEnv": "DEV_USER_SHEET_ID"
  }
],
  // Schema mismatch behaviour: 'warn' | 'error' | 'auto-sync'
  onSchemaMismatch: 'auto-sync',
};
