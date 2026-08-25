-- Directory's medallion previously reused banner_url (the same photo shown
-- on Home/deal cards), which made the list read as a second deal
-- carousel. Separate logo_url so Directory has its own distinct image,
-- editable by staff the same way banner_url/bio already are.
alter table public.restaurants
  add column if not exists logo_url text;
