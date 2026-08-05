import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

// Reservations are an actor:'user' table — each user's rows live in their own sheet,
// so "all reservations" (whether scoped by admin, or by restaurant_id for a merchant) means
// fanning out to every registered user's actor sheet and merging the results. Fine
// at this product's scale; would need a different approach (e.g. a denormalized
// admin-side index table) at high user counts. Shared by admin/reservations.service.ts
// and merchant/orders.service.ts so both fan out the same way.
export async function usersWithSheets(): Promise<Record<string, unknown>[]> {
  const ctx   = adminContext();
  const users = await ctx.table('users').findMany({}) as Record<string, unknown>[];
  return users.filter((u) => !!u.actor_sheet_id);
}

export async function findUser(userId: string): Promise<Record<string, unknown>> {
  if (!userId) {
    throw new AppError(400, 'user_id is required');
  }

  const ctx  = adminContext();
  const user = await ctx.table('users').findOne({ where: { user_id: userId } }) as Record<string, unknown> | null;
  if (!user || !user.actor_sheet_id) {
    throw new AppError(404, 'User not found or has no reservations sheet');
  }
  return user;
}
