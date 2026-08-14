import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createAuthRouter } from 'longcelot-sheet-db';

import { env } from './config/env';
import { adapter } from './lib/adapter';
import { handleGoogleProfile, handleAdminGoogleProfile } from './services/auth.service';
import userRoutes from './routes';
import adminRoutes from './routes/admin';
import merchantRoutes from './routes/merchant';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // ─── Middleware ─────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(requestLogger);
  app.use(cors({
    origin:      [env.frontendUrl, env.adminFrontendUrl, env.merchantFrontendUrl, env.webFrontendUrl],
    credentials: true,
  }));
  app.use(express.json());

  // ─── Google OAuth (GET /user/auth/google  →  GET /user/auth/callback) ───────
  // Mobile app flow: redirects to `frontendUrl`, which is a custom URL scheme deep
  // link, not a browser-navigable URL — the Web app below needs its own router.
  const googleAuth = createAuthRouter({
    adapter,
    jwtSecret:   env.jwtSecret,
    frontendUrl: env.frontendUrl,
    registrationPolicy: 'open',
    onUser: handleGoogleProfile,
  });
  app.use('/user', googleAuth.handler);

  // ─── Web customer Google OAuth (GET /user/web/auth/google → GET /user/web/auth/callback) ─
  // Same customer account lookup/creation as the mobile flow above (`handleGoogleProfile`,
  // `registrationPolicy: 'open'`), but a separate router: it redirects to `webFrontendUrl`
  // (a real browser URL, unlike the mobile app's custom scheme) and needs its own
  // registered `redirect_uri` — Google redirects wherever the *authorizing request* said
  // to, so each browser-navigable flow needs a distinct one, same reasoning as the admin
  // flow below. Mounted at a different path than the mobile router above so the two
  // `/auth/google` routes don't collide.
  const webGoogleAuth = createAuthRouter({
    adapter,
    jwtSecret:   env.jwtSecret,
    frontendUrl: env.webFrontendUrl,
    registrationPolicy: 'open',
    onUser: handleGoogleProfile,
    oauthConfig: {
      clientId:     env.google.clientId,
      clientSecret: env.google.clientSecret,
      redirectUri:  env.google.webRedirectUri,
    },
  });
  app.use('/user/web', webGoogleAuth.handler);

  // ─── Admin Google OAuth (GET /admin/auth/google → GET /admin/auth/callback) ─
  // login-only: no self-registration, and handleAdminGoogleProfile further
  // requires the matched account to have role: 'admin'. Separate redirect_uri
  // from the customer flow above — see adminRedirectUri in config/env.ts.
  const adminGoogleAuth = createAuthRouter({
    adapter,
    jwtSecret:   env.jwtSecret,
    frontendUrl: env.adminFrontendUrl,
    registrationPolicy: 'login-only',
    onUser: handleAdminGoogleProfile,
    oauthConfig: {
      clientId:     env.google.clientId,
      clientSecret: env.google.clientSecret,
      redirectUri:  env.google.adminRedirectUri,
    },
  });
  app.use('/admin', adminGoogleAuth.handler);

  // ─── Routes ─────────────────────────────────────────────────────────────────
  app.use('/user', userRoutes);
  app.use('/admin', adminRoutes);
  app.use('/merchant', merchantRoutes);

  // ─── Health ─────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── 404 ────────────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ─── Errors ─────────────────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
