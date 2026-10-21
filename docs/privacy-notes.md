# Privacy notes: who can see what

What each kind of personal data is visible to, as enforced by the database (row-level security), not just by what the app shows. "Anyone" means anyone with the public anon key, which ships in the website, so they can query the API directly as well as browse the site.

Last checked against migrations up to `20261021120000_student_listings_and_vendor_admin`.

## Accounts (`profiles`)
- **Email, phone, credit score and limit, roles, institution:** the account owner, plus staff with the admin, super admin, finance or dispute role. Not public (`20261015121000_profiles_private`).
- The account phone is never copied into a listing automatically. The sell form's phone field starts empty.

## Sellers (`vendors`) and the contact phone
- **Approved vendors are public:** shop name, description, logo, owner account id and **contact phone** (`contact_phone`, added in `20261021120000`).
  - A student's first listing creates their vendor with **their account name as the shop name**, so the name is public once the vendor is approved. Listings show it as "Seller: …" and "By …".
  - The contact phone is what buyers call or WhatsApp. The seller types it on the sell form under the note "Visible to buyers: anyone who views your listings can see this number and your name". If it's left empty, buyers see no contact button and no number. There is no fallback number.
  - An admin can also set it when creating a vendor (Super Admin → Vendors), with the owner's agreement.
- **Pending or rejected vendors:** visible only to the owner and to admins / super admins.
- **Removing a published number:** the sell form only replaces it (an empty field keeps the current number), and there is no "remove my number" button yet. Until there is, an admin clears it with `update vendors set contact_phone = null where id = '<vendor id>';`.

## Listings (`products`) and photos
- **Product rows are readable by anyone as soon as they're saved, even while the seller's vendor is pending.** The app only shows approved vendors' listings, but the API returns every row: title, description, price, category, campus, meetup location and photo links. The seller's phone is not on the product row; it stays hidden until the vendor is approved.
  - Possible follow-up: limit `products` reads to approved vendors (plus the owner and admins).
- **Photos** (`product-images` bucket) are public by URL as soon as they're uploaded, including photos on listings that are later deleted, unless the file is removed too.
- **Meetup location** is free text the seller chooses and is public. Hall names are fine; room numbers are not needed.

## Campus content
- **SRC notices, events and resources** (`campus_events`, `campus_resources`) are public, including the publisher's account id (`created_by`). Uploaded files (`campus-docs` bucket) are public by URL.

## Other data
- **Search terms** (`demand_logs`): admins / super admins only.
- **Orders, payments, wallets, installment plans, reservations, tickets:** the person they belong to, plus the staff roles named in each table's policy.
- **Lost & found:** reporters, claimants and the campus desk. Photos marked private stay in `lost-found-private`, readable by the uploader only.
