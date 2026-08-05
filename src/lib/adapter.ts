import fs from 'fs';
import path from 'path';
import { createSheetAdapter, DriveStorageAdapter } from 'longcelot-sheet-db';
import { env } from '../config/env';
import usersSchema               from '../../schemas/admin/users';
import credentialsSchema         from '../../schemas/admin/credentials';
import categoriesSchema          from '../../schemas/admin/categories';
import servicesSchema            from '../../schemas/admin/services';
import restaurantsSchema               from '../../schemas/admin/restaurants';
import catalogItemsSchema        from '../../schemas/admin/catalog_items';
import merchantApplicationsSchema from '../../schemas/admin/merchant_applications';
import merchantInvitesSchema     from '../../schemas/admin/merchant_invites';
import profileSchema     from '../../schemas/user/profile';
import reservationsSchema    from '../../schemas/user/reservations';

// GOOGLE_ADMIN_TOKENS is a JSON-encoded OAuth token object, used in production
// where there's no local filesystem to persist token state across deploys.
// Locally, fall back to the token file written by `lsdb sync` (.lsdb-tokens.json
// since 0.1.26; .sheet-db-tokens.json is read as a legacy fallback).
function loadAdminTokens(): unknown {
  if (env.google.adminTokens) {
    return JSON.parse(env.google.adminTokens);
  }
  const tokensPath = [
    path.join(process.cwd(), '.lsdb-tokens.json'),
    path.join(process.cwd(), '.sheet-db-tokens.json'),
  ].find(fs.existsSync);
  if (tokensPath) {
    return JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
  }
  return null;
}

const adminTokens: unknown = loadAdminTokens();
if (!adminTokens) {
  throw new Error(
    'No admin OAuth tokens found. Run `lsdb sync` to create .lsdb-tokens.json, ' +
    'or set GOOGLE_ADMIN_TOKENS for production.'
  );
}

export const adapter = createSheetAdapter({
  adminSheetId: env.adminSheetId,
  credentials: {
    clientId:     env.google.clientId,
    clientSecret: env.google.clientSecret,
    redirectUri:  env.google.redirectUri,
  },
  tokens: adminTokens,
  storage: new DriveStorageAdapter({ folder: 'restaurant-uploads' }),
});

adapter.registerSchemas([
  usersSchema,
  credentialsSchema,
  categoriesSchema,
  servicesSchema,
  restaurantsSchema,
  catalogItemsSchema,
  merchantApplicationsSchema,
  merchantInvitesSchema,
  profileSchema,
  reservationsSchema,
]);

export function adminContext() {
  return adapter.withContext({
    userId:       'auth',
    actor:        'admin',
    actorSheetId: env.adminSheetId,
  });
}

export function userContext(userId: string, actorSheetId: string) {
  return adapter.withContext({ userId, actor: 'user', actorSheetId });
}
