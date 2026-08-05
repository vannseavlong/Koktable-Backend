import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import usersRoutes    from './users.routes';
import categoriesRoutes from './categories.routes';
import servicesRoutes from './services.routes';
import reservationsRoutes from './reservations.routes';
import merchantApplicationsRoutes from './merchantApplications.routes';
import restaurantsRoutes    from './restaurants.routes';
import catalogItemsRoutes from './catalogItems.routes';

const router = Router();

// Every /admin route requires an authenticated admin (role: 'admin') JWT.
router.use(requireAdmin);

router.use('/users',      usersRoutes);
router.use('/categories', categoriesRoutes);
router.use('/services',   servicesRoutes);
router.use('/reservations', reservationsRoutes);
router.use('/merchant-applications', merchantApplicationsRoutes);
router.use('/restaurants',    restaurantsRoutes);
router.use('/catalog-items', catalogItemsRoutes);

export default router;
