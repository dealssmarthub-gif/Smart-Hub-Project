# Privacy notes: who can see what

What each kind of personal data is visible to, as enforced by the database (row-level security), not just by what the app shows. "Anyone" means anyone with the public anon key, which ships in the website, so they can query the API directly as well as browse the site.

Last checked against migrations up to `20261023120000_student_profile_fields` (written and tested, not yet applied to live). If `20261022120000_products_visible_when_vendor_approved` isn't applied yet, the "Listings" section's previous rule applies, as noted there.

## Accounts (`profiles`)
- **Email, phone, credit score and limit, roles, institution:** the account owner, plus staff with the admin, super admin, finance or dispute role. Not public (`20261015121000_profiles_private`).
- **"Are you a student?", campus** (`is_student`, `student_campus`, `20261023120000`): asked at sign-up and editable on the Me page. Same visibility as the rest of the profile: the owner, plus admin, super admin, finance and dispute staff. Self-declared and never checked; it decides what someone sees (Student OS links, their campus first in the marketplace, the "Student seller" label on their listings), never what they can do. No database policy or function reads it for access, and `supabase/tests/student_profile_fields.test.sql` checks that.
- Sign-up no longer asks for a phone number. Older accounts keep the one they gave, private as above.
- The account phone is never copied into a listing automatically. The sell form's phone field starts empty, or with the seller's contact phone if they have already published one.

## Sellers (`vendors`) and the contact phone
- **Approved vendors are public:** shop name, description, logo, owner account id and **contact phone** (`contact_phone`, added in `20261021120000`).
  - Anyone's first listing ("Sell an item") creates their vendor with **their account name as the shop name**, so the name is public once the vendor is approved. Listings show it as "Seller: …" and "By …".
  - The contact phone is what buyers call or WhatsApp. The seller types it on the sell form under the note "Visible to buyers: anyone who views your listings can see this number and your name". If it's left empty, buyers see no contact button and no number. There is no fallback number.
  - An admin can also set it when creating a vendor (Super Admin → Vendors), with the owner's agreement.
- **Pending or rejected vendors:** visible only to the owner and to admins / super admins.
- **Removing a published number:** the seller can do it themselves. The sell form shows their current public number with **Remove … from my listings now**, and saving a listing with the field empty also removes it. The number is per seller, so it changes on all their listings at once. The database already allowed this ("Users can update their own vendor profile"); `supabase/tests/product_visibility.test.sql` checks it, and that nobody can clear someone else's number.

## Listings (`products`) and photos
- **With `20261022120000` applied:** anyone can read products of approved vendors only. A seller also sees their own products while pending or rejected, and admins, super admins, finance and dispute staff see all of them.
- **Before it is applied (live today):** product rows are readable by anyone through the API as soon as they're saved, even while the seller's vendor is pending (title, description, price, category, campus, meetup location, photo links). The app only shows approved vendors' listings, and the seller's phone is never on the product row.
- **Photos** (`product-images` bucket) are public by URL as soon as they're uploaded, including photos on listings that are later deleted, unless the file is removed too.
- **"Student seller"** shows on listings from sellers who said they are students (`listing_type = 'student'`). It is self-declared and shown as plain text, never as verified. Those listings always carry a campus; other listings may have none.
- **Meetup location** is free text the seller chooses and is public. Hall names are fine; room numbers are not needed.

## Campus content
- **SRC notices, events and resources** (`campus_events`, `campus_resources`) are public, including the publisher's account id (`created_by`). Uploaded files (`campus-docs` bucket) are public by URL.

## Other data
- **Search terms** (`demand_logs`): admins / super admins only.
- **Orders, payments, wallets, installment plans, reservations, tickets:** the person they belong to, plus the staff roles named in each table's policy.
- **Lost & found:** reporters, claimants and the campus desk. Photos marked private stay in `lost-found-private`, readable by the uploader only.
