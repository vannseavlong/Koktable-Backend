# Restaurant directory crawl — instructions for Claude

You are populating this app's restaurant directory with **real, public business-listing
data** (name, address, phone, hours, cuisine, price level, public rating, public photos)
for restaurants in a target city, the same way the original ~106-restaurant seed set was
built (`resteruant.json` — Google Places data for Phnom Penh, Sihanoukville, Siem Reap).
This is the acquisition mechanism described in `Overview.md` §7.1: a restaurant is already
listed and searchable before its owner has signed up, so "claim your restaurant" is a much
easier ask than "build a profile from scratch."

Your output is **TSV files, one per table, ready to paste directly under that table's
header row in Google Sheets** — no API calls, no writing to the live sheet yourself.

## Hard rules

1. **Public business-directory facts only.** Name, address, phone, public hours, cuisine
   tags, price level, star rating + rating count, public photo URLs. All must be real,
   sourced from a live public listing (Google Maps/Search, the restaurant's own website or
   Facebook page, a delivery platform listing) — never invented or guessed.
2. **Never fabricate a translation.** Only fill a `name_km`/`name_zh`/`name_ko` column if
   the source itself shows that name (e.g. a Khmer-script listing on Google Maps). Leave it
   blank otherwise — a machine-guessed translation labeled as sourced data is worse than no
   data.
3. **Never touch `reviews`, `catalog_items`, or anything requiring a real user account**
   (`subscriptions`, `support_tickets`, `restaurant_staff`, `roles`, etc.). Reviews require
   a real reservation from a real registered user (`reviews.reservation_id` is unique and
   `reviewer_user_id` refs a real `users` row) — a scraped star rating is not a review, it
   belongs on `restaurant_locations.rating`/`rating_count`, not a fabricated `reviews` row.
   Menu/catalog data is intentionally left for merchants to fill in themselves after they
   claim their listing (`Overview.md` §1.5/§2 — scraped menus were the explicit gap the
   photo/menu self-serve flow was built to fix; don't reintroduce it here).
4. **Resolve against existing canonical rows before creating new ones.** `city_id`,
   `district_id`, `cuisine_id`, `category_id` are foreign keys into small lookup tables —
   ask for (or read) the current contents of `cities`/`districts`/`cuisines`/`categories`
   first. Reuse an existing row's id whenever the name matches (case-insensitively, allow
   for "Khmer" vs "Khmer Food" type near-duplicates — match to the existing one, don't
   create a near-duplicate). Only add a new lookup row when nothing existing fits.
5. **Dedupe restaurants by `google_place_id`.** If a listing's Google Place ID already
   appears in the current `restaurant_locations` data you were given, skip it (or note it
   as "already present" in your summary) rather than creating a duplicate row.
6. **Respect source sites.** Don't scrape content behind a login/paywall, don't hammer a
   single site with rapid-fire requests, and prefer official public listing/business-profile
   pages over reposted/aggregator content when both exist.
7. **Blank beats guessed.** Every column below marked optional may be left empty if the
   source doesn't have it. Do not invent a phone number, coordinate, or rating to avoid an
   empty cell.

## Scope for this run

**Cities: Phnom Penh, Siem Reap, Sihanoukville, Cambodia** — the same three cities the
original ~106-restaurant seed set covers. Aim for broad cuisine coverage per city (don't
over-index on one cuisine); no fixed restaurant-count target, but check each one against
Hard Rule 5 before adding it.

## Tables you produce

In dependency order — `restaurants` needs `categories`/`cuisines` resolved first,
`restaurant_locations` needs `cities`/`districts` resolved first, etc.

| # | File | Only needed if... |
|---|------|--------------------|
| 1 | `cities.tsv` | you had to add a city not already in the canonical list |
| 2 | `districts.tsv` | you had to add a district not already in the canonical list |
| 3 | `cuisines.tsv` | you had to add a cuisine not already in the canonical list |
| 4 | `categories.tsv` | you had to add a dining-style category not already in the list |
| 5 | `restaurants.tsv` | always (one row per restaurant) |
| 6 | `restaurant_locations.tsv` | always (one row per restaurant's site) |
| 7 | `restaurant_cuisines.tsv` | always, if any cuisine tags were found |
| 8 | `restaurant_hours.tsv` | always, if opening hours were found (up to 7 rows/location) |

Skip a file entirely (don't create an empty one) if that table needed no new/changed rows.

## Column spec

Every TSV's first line is the header (the exact column names below, tab-separated, in
this exact order — this is the schema's own column declaration order plus the three
bookkeeping columns every table gets). Booleans are `TRUE`/`FALSE`. Blank cell = empty
string between two tabs, not the word "null". A JSON column (`images`, `periods`) is the
literal JSON text, e.g. `["https://...","https://..."]`. If a text value starts with
`=`, `+`, `-`, or `@` (rare, but a phone number like `+855...` does), prefix it with a
single `'` so Sheets doesn't parse it as a formula.

Generate a unique id per new row — any collision-free scheme works (a random 10-character
alphanumeric suffix mirrors this app's own `nanoid(10)`; a per-batch counter is fine too),
using the prefix shown. `restaurant_cuisines`/`restaurant_hours` use a **deterministic**
id instead (shown below) so re-running the crawl on the same restaurant doesn't create
duplicate join rows.

Every row also ends with `_created_at`, `_updated_at` (both = the ISO timestamp you ran
the crawl at) and `_id` (any random 12-character string) — bookkeeping columns every
table has, filled in the same way `scripts/export-restaurant-tsv.ts` already does it.

### cities — id prefix `city_`
`city_id  name  name_zh  name_km  name_ko  active  sort_order  _created_at  _updated_at  _id`
- `name` required. `active` = `TRUE`. `sort_order` = `0` unless told otherwise.

### districts — id prefix `dist_`
`district_id  city_id  name  name_zh  name_km  name_ko  active  sort_order  _created_at  _updated_at  _id`
- `city_id` must be an existing (or newly-added-this-run) city id. `name` required.

### cuisines — id prefix `cui_`
`cuisine_id  name  name_zh  name_km  name_ko  icon  active  sort_order  moderation_status  submitted_by  _created_at  _updated_at  _id`
- `moderation_status` = `approved`, `submitted_by` = blank (this is an admin/system
  import, not a merchant submission — see `schemas/admin/cuisines.ts`). `icon` optional
  (leave blank; an admin assigns an emoji later).

### categories — id prefix `cat_`
`category_id  name  name_zh  name_km  name_ko  icon  active  sort_order  moderation_status  submitted_by  _created_at  _updated_at  _id`
- Same `moderation_status`/`submitted_by` rule as cuisines. Only add a category if you're
  confident of the dining style (e.g. "Fine Dining", "Casual", "Street Food") — leave
  `restaurants.category_id` blank rather than force-fitting one.

### restaurants — id prefix `restaurant_`
`restaurant_id  application_id  owner_user_id  category_id  name  name_zh  name_km  name_ko  description  description_zh  description_km  description_ko  logo  banner  status  suspension_reason  _created_at  _updated_at  _id`
- `application_id`, `owner_user_id`, `logo`, `banner`, `suspension_reason` — always blank
  (this restaurant has no owner/merchant yet; a real merchant fills logo/banner in when
  they claim it). `category_id` blank unless resolved per above. `status` = `pending`
  (unclaimed listings aren't bookable yet — this matches how the original seed data and
  `scripts/backfill-district.ts`-imported rows are treated). `description` from the
  listing's public "about" blurb if one exists, otherwise blank — don't invent one.

### restaurant_locations — id prefix `loc_`
`location_id  restaurant_id  name  name_zh  name_km  name_ko  contact_email  contact_phone  address  city_id  district_id  latitude  longitude  active  rating  rating_count  price_level  price_symbol  images  google_place_id  _created_at  _updated_at  _id`
- `restaurant_id` must match the row you just created in `restaurants.tsv`. `name` blank
  for a single-location restaurant (the common case). `contact_email` almost never
  publicly available — leave blank. `price_level` is the Google Places 1–4 scale (1=`$`
  ... 4=`$$$$`); leave **`price_symbol` blank always** — the app derives it from
  `price_level` on every read (`src/utils/restaurantPricing.ts`), a stored value would
  just be redundant/driftable. `images` = JSON array of public photo URLs, `[]` if none.
  `google_place_id` = the source's Google Place ID if you have one (this is the dedup key
  — see Hard Rule 5); leave blank rather than fabricate one, since it's a unique column
  and a fake value could later collide with a real one.

### restaurant_cuisines — id **`rc_<restaurant_id>_<cuisine_id>`** (deterministic, not random)
`restaurant_cuisine_id  restaurant_id  cuisine_id  _created_at  _updated_at  _id`
- One row per (restaurant, cuisine) tag. `cuisine_id` must be a resolved/created cuisines
  row from this same run.

### restaurant_hours — id **`hrs_<location_id>_<day_of_week>`** (deterministic, not random)
`hours_id  restaurant_id  location_id  day_of_week  closed  open_24h  periods  _created_at  _updated_at  _id`
- One row per day the source actually states hours for (skip a day entirely if unknown —
  don't assume every restaurant is open every day). `day_of_week` is lowercase full name:
  `monday`...`sunday`. `periods` = JSON array of `{"open":"HH:MM","close":"HH:MM"}` in
  24-hour time, e.g. `[{"open":"11:00","close":"14:00"},{"open":"17:00","close":"22:00"}]`
  for a split lunch/dinner schedule, or a single entry for continuous hours. `closed` =
  `TRUE` and `periods` = `[]` for a day explicitly listed as closed. `open_24h` = `TRUE`
  only if the source explicitly says 24 hours (rare) — otherwise `FALSE`.

## Workflow

1. Get the current `cities`/`districts`/`cuisines`/`categories` rows (ask for them, or
   read exported TSVs if given) so you have real ids to resolve against.
2. Search for restaurants matching the target city/cuisine/count. Prefer sources that
   expose structured data (Google Maps listing pages, official business sites) over
   listicle articles.
3. For each restaurant: pull name, address, phone, hours, cuisine(s), price level,
   rating/count, photos, Google Place ID (if visible), and Khmer-script name if the
   listing shows one.
4. Cross-check against Hard Rule 5 (dedupe by `google_place_id` against what you were
   given) before adding it.
5. Resolve/create lookup rows (cities/districts/cuisines/categories) first, then write
   the restaurant/location/join rows referencing them.
6. Write each `.tsv` per the Column Spec above, into an output folder you name (e.g.
   `tmp-crawl-<city>/`).
7. Finish with a short plain-text summary: how many restaurants added, how many skipped
   as duplicates, any new lookup rows created, and anything you couldn't source cleanly
   and left blank (so a human can spot-check before pasting).

## After you're done (human step, not yours)

`pnpm db:sync` must already have created the tabs/headers for any table you're pasting
into. Each `.tsv`'s data rows (everything after the header line) get pasted starting at
the first empty row under that tab's own header — the header line in your file is just
for the human to visually confirm column alignment before pasting, not something they
paste again.
