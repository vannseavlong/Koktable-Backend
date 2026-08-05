import { Router } from 'express';
import authRoutes         from './auth.routes';
import servicesRoutes     from './services.routes';
import profileRoutes      from './profile.routes';
import reservationsRoutes     from './reservations.routes';
import restaurantsRoutes        from './restaurants.routes';
import catalogItemsRoutes from './catalogItems.routes';
import categoriesRoutes   from './categories.routes';
import cuisinesRoutes     from './cuisines.routes';

const router = Router();

router.use('/auth',          authRoutes);
router.use('/services',      servicesRoutes);
router.use('/profile',       profileRoutes);
router.use('/reservations',      reservationsRoutes);
router.use('/restaurants',         restaurantsRoutes);
router.use('/catalog-items', catalogItemsRoutes);
router.use('/categories',    categoriesRoutes);
router.use('/cuisines',      cuisinesRoutes);

export default router;
