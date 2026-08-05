// Loaded before every test file (see vitest.config.ts `setupFiles`). Sets fake-but-
// valid env vars so src/config/env.ts's eager required()/requiredSecret() checks pass
// without needing a real .env or live Google credentials — src/lib/adapter.ts (the
// only thing that would actually use these to talk to Google) is mocked out in every
// test file that touches it (see src/testUtils/fakeAdapter.ts), so these values are
// never used for a real network call.
process.env.NODE_ENV               ??= 'test';
process.env.JWT_SECRET             ??= 'test_jwt_secret_at_least_32_characters_long';
process.env.INVITE_TOKEN_SECRET    ??= 'test_invite_secret_at_least_32_characters_yy';
process.env.ADMIN_SHEET_ID         ??= 'test-admin-sheet-id';
process.env.GOOGLE_CLIENT_ID       ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET   ??= 'test-google-client-secret';
process.env.GOOGLE_REDIRECT_URI    ??= 'http://localhost:3000/user/auth/callback';
