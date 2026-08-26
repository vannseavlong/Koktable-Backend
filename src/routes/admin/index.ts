import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import usersRoutes    from './users.routes';
import categoriesRoutes from './categories.routes';
import cuisinesRoutes from './cuisines.routes';
import citiesRoutes from './cities.routes';
import districtsRoutes from './districts.routes';
import servicesRoutes from './services.routes';
import reservationsRoutes from './reservations.routes';
import merchantApplicationsRoutes from './merchantApplications.routes';
import restaurantsRoutes    from './restaurants.routes';
import catalogItemsRoutes from './catalogItems.routes';
import invoicesRoutes from './invoices.routes';
import plansRoutes from './plans.routes';
import dashboardRoutes from './dashboard.routes';

const router = Router();

// Every /admin route requires an authenticated admin (role: 'admin') JWT.
router.use(requireAdmin);

router.use('/users',      usersRoutes);
router.use('/categories', categoriesRoutes);
router.use('/cuisines',   cuisinesRoutes);
router.use('/cities',     citiesRoutes);
router.use('/districts',  districtsRoutes);
router.use('/services',   servicesRoutes);
router.use('/reservations', reservationsRoutes);
router.use('/merchant-applications', merchantApplicationsRoutes);
router.use('/restaurants',    restaurantsRoutes);
router.use('/catalog-items', catalogItemsRoutes);
router.use('/invoices', invoicesRoutes);
router.use('/plans', plansRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
