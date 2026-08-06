import { defineTable, string } from 'longcelot-sheet-db';

// Public, unauthenticated restaurant-owner applications (POST /merchant/apply), reviewed
// by an admin (approve creates a restaurants row + invite; reject just records a reason).
export default defineTable({
  name: 'merchant_applications',
  actor: 'admin',
  timestamps: true,
  columns: {
    application_id:   string().required().unique().primary(),
    restaurant_name:        string().required(),
    applicant_name:   string().required(),
    contact_email:    string().required(),
    contact_phone:    string(),
    description:      string(),
    // Business license/ID upload (Overview.md §1.2) — a DriveStorageAdapter URL, same as
    // restaurants.logo/catalog_items.image.
    document_url:     string(),
    status:           string().enum(['pending', 'under_review', 'approved', 'rejected']).default('pending').required(),
    rejection_reason: string(),
  },
});
