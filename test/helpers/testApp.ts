import express from 'express';
import adminRoutes from '../../src/routes/admin';
import merchantRoutes from '../../src/routes/merchant';
import authRoutes from '../../src/routes/auth.routes';
import reservationsRoutes from '../../src/routes/reservations.routes';
import restaurantsRoutes from '../../src/routes/restaurants.routes';
import catalogItemsRoutes from '../../src/routes/catalogItems.routes';
import categoriesRoutes from '../../src/routes/categories.routes';
import cuisinesRoutes from '../../src/routes/cuisines.routes';
import plansRoutes from '../../src/routes/plans.routes';
import { errorHandler } from '../../src/middleware/errorHandler';

// Deliberately doesn't use src/app.ts's createApp(): that also wires up the three
// createAuthRouter() Google OAuth flows, which require a real longcelot-sheet-db
// SheetAdapter instance (typed as the concrete class, not the swappable
// DatabaseAdapter interface — see src/testUtils/fakeAdapter.ts) and aren't part of
// what's under test here. `routes/auth.routes.ts` below is this repo's own
// register/login/me/logout router (not the OAuth ones) and mounts fine on the fake
// adapter. Mounting the resource routers directly still exercises the real
// requireAuth/requireAdmin/requireMerchant middleware, asyncHandler, and errorHandler.
export function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRoutes);
  app.use('/merchant', merchantRoutes);
  app.use('/user/auth', authRoutes);
  app.use('/user/reservations', reservationsRoutes);
  app.use('/user/restaurants', restaurantsRoutes);
  app.use('/user/catalog-items', catalogItemsRoutes);
  app.use('/user/categories', categoriesRoutes);
  app.use('/user/cuisines', cuisinesRoutes);
  app.use('/user/plans', plansRoutes);
  app.use(errorHandler);
  return app;
}
