import { adminContext } from '../lib/adapter';
import { AppError } from './AppError';
import { withLock } from '../lib/mutex';

async function loadCatalogItem(itemId: string): Promise<Record<string, unknown> | null> {
  const ctx = adminContext();
  return ctx.table('catalog_items').findOne({ where: { item_id: itemId } }) as Promise<Record<string, unknown> | null>;
}

// Only meaningful for catalog_items rows with item_type: 'product' and a quantity
// set (undefined quantity means "unlimited") — a no-op for services and for the
// legacy `services`-table reservation path (whose service_id never matches a
// catalog_items row). Wrapped in the same per-key mutex already used for
// invite-token redemption (src/lib/mutex.ts) to close the read-then-write race
// within a single process. Same documented tradeoff as that existing usage: not
// safe across multiple Node instances.
//
// Called before the reservation row is created, so an out-of-stock item never
// produces an orphaned reservation. The reverse risk — stock decremented but the
// subsequent reservation-row write then fails — is a pre-existing class of problem
// in this backend (no cross-write transactions anywhere) and isn't solved here.
export async function decrementIfProduct(itemId: string): Promise<void> {
  await withLock(`catalog-item:${itemId}`, async () => {
    const item = await loadCatalogItem(itemId);
    if (!item || item.item_type !== 'product' || item.quantity == null) return;

    const quantity = item.quantity as number;
    if (quantity <= 0) {
      throw new AppError(400, 'This product is out of stock');
    }

    const ctx = adminContext();
    await ctx.table('catalog_items').update({ where: { item_id: itemId }, data: { quantity: quantity - 1 } });
  });
}

// Called when a reservation transitions to 'cancelled'. `restaurantId` is the reservation's own
// restaurant_id column — blank for legacy `services`-table reservations, which never had
// stock decremented in the first place, so this is a safe no-op for them.
export async function restockIfProduct(restaurantId: string, itemId: string): Promise<void> {
  if (!restaurantId || !itemId) return;

  await withLock(`catalog-item:${itemId}`, async () => {
    const item = await loadCatalogItem(itemId);
    if (!item || item.item_type !== 'product' || item.quantity == null) return;

    const ctx = adminContext();
    await ctx.table('catalog_items').update({
      where: { item_id: itemId },
      data:  { quantity: (item.quantity as number) + 1 },
    });
  });
}
