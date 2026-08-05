import { signJwt } from '../../src/middleware/auth';

export function adminToken(overrides: Partial<{ user_id: string; email: string; full_name: string }> = {}): string {
  return signJwt({
    user_id:   overrides.user_id ?? 'admin_test_1',
    email:     overrides.email ?? 'admin@test.local',
    full_name: overrides.full_name ?? 'Test Admin',
    role:      'admin',
  });
}

export function merchantToken(restaurantId: string, overrides: Partial<{ user_id: string; email: string }> = {}): string {
  return signJwt({
    user_id:   overrides.user_id ?? 'm_test_1',
    email:     overrides.email ?? 'merchant@test.local',
    full_name: 'Test Merchant',
    role:      'merchant',
    restaurant_id:   restaurantId,
  });
}

export function userToken(overrides: Partial<{ user_id: string; actor_sheet_id: string }> = {}): string {
  return signJwt({
    user_id:        overrides.user_id ?? 'u_test_1',
    email:          'user@test.local',
    full_name:      'Test User',
    role:           'user',
    actor_sheet_id: overrides.actor_sheet_id ?? 'sheet_test_1',
  });
}
