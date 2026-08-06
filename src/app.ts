import express from 'express';
import cors from 'cors';
import { createAuthRouter } from 'longcelot-sheet-db';

import { env } from './config/env';
import { adapter } from './lib/adapter';
import { handleGoogleProfile, handleAdminGoogleProfile } from './services/auth.service';
import userRoutes from './routes';
import adminRoutes from './routes/admin';
import merchantRoutes from './routes/merchant';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  // ─── Middleware ─────────────────────────────────────────────────────────────
  app.use(cors({
    origin:      [env.frontendUrl, env.adminFrontendUrl, env.merchantFrontendUrl, env.webFrontendUrl],
    credentials: true,
  }));
  app.use(express.json());

  // ─── Google OAuth (GET /user/auth/google  →  GET /user/auth/callback) ───────
  const googleAuth = createAuthRouter({
    adapter,
    jwtSecret:   env.jwtSecret,
    frontendUrl: env.frontendUrl,
    registrationPolicy: 'open',
    onUser: handleGoogleProfile,
  });
  app.use('/user', googleAuth.handler);

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
