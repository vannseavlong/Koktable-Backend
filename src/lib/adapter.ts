import fs from 'fs';
import path from 'path';
import { createSheetAdapter, DriveStorageAdapter } from 'longcelot-sheet-db';
import { env } from '../config/env';
import usersSchema               from '../../schemas/admin/users';
import credentialsSchema         from '../../schemas/admin/credentials';
import categoriesSchema          from '../../schemas/admin/categories';
import cuisinesSchema            from '../../schemas/admin/cuisines';
import citiesSchema               from '../../schemas/admin/cities';
import districtsSchema           from '../../schemas/admin/districts';
import servicesSchema            from '../../schemas/admin/services';
import restaurantsSchema               from '../../schemas/admin/restaurants';
import restaurantLocationsSchema  from '../../schemas/admin/restaurant_locations';
import restaurantCuisinesSchema   from '../../schemas/admin/restaurant_cuisines';
import restaurantHoursSchema     from '../../schemas/admin/restaurant_hours';
import floorsSchema              from '../../schemas/admin/floors';
import roomsSchema                from '../../schemas/admin/rooms';
import tablesSchema                from '../../schemas/admin/tables';
import catalogItemsSchema        from '../../schemas/admin/catalog_items';
import merchantApplicationsSchema from '../../schemas/admin/merchant_applications';
import merchantInvitesSchema     from '../../schemas/admin/merchant_invites';
import reservationForwardsSchema from '../../schemas/admin/reservation_forwards';
import restaurantStatusHistorySchema from '../../schemas/admin/restaurant_status_history';
import restaurantBookingPoliciesSchema from '../../schemas/admin/restaurant_booking_policies';
import restaurantHoursExceptionsSchema from '../../schemas/admin/restaurant_hours_exceptions';
import reviewsSchema             from '../../schemas/admin/reviews';
import reservationTokensSchema   from '../../schemas/admin/reservation_tokens';
import revokedTokensSchema       from '../../schemas/admin/revoked_tokens';
import rolesSchema               from '../../schemas/admin/roles';
import modulesSchema             from '../../schemas/admin/modules';
import actionsSchema             from '../../schemas/admin/actions';
import moduleActionsSchema       from '../../schemas/admin/module_actions';
import rolePermissionsSchema     from '../../schemas/admin/role_permissions';
import restaurantStaffSchema     from '../../schemas/admin/restaurant_staff';
import subscriptionsSchema       from '../../schemas/admin/subscriptions';
import invoicesSchema            from '../../schemas/admin/invoices';
import commissionChargesSchema   from '../../schemas/admin/commission_charges';
import platformSettingsSchema    from '../../schemas/admin/platform_settings';
import notificationTemplatesSchema from '../../schemas/admin/notification_templates';
import featuredRestaurantsSchema from '../../schemas/admin/featured_restaurants';
import supportTicketsSchema      from '../../schemas/admin/support_tickets';
import supportTicketMessagesSchema from '../../schemas/admin/support_ticket_messages';
import restaurantReportsSchema   from '../../schemas/admin/restaurant_reports';
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
  cuisinesSchema,
  citiesSchema,
  districtsSchema,
  servicesSchema,
  restaurantsSchema,
  restaurantLocationsSchema,
  restaurantCuisinesSchema,
  restaurantHoursSchema,
  floorsSchema,
  roomsSchema,
  tablesSchema,
  catalogItemsSchema,
  merchantApplicationsSchema,
  merchantInvitesSchema,
  reservationForwardsSchema,
  restaurantStatusHistorySchema,
  restaurantBookingPoliciesSchema,
  restaurantHoursExceptionsSchema,
  reviewsSchema,
  reservationTokensSchema,
  revokedTokensSchema,
  rolesSchema,
  modulesSchema,
  actionsSchema,
  moduleActionsSchema,
  rolePermissionsSchema,
  restaurantStaffSchema,
  subscriptionsSchema,
  invoicesSchema,
  commissionChargesSchema,
  platformSettingsSchema,
  notificationTemplatesSchema,
  featuredRestaurantsSchema,
  supportTicketsSchema,
  supportTicketMessagesSchema,
  restaurantReportsSchema,
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
