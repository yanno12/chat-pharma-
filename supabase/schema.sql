-- Run once in the Supabase SQL Editor on a new project.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'pharmacy' check (role in ('pharmacy','admin'))
);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;
create table public.pharmacies (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 150),
 country text not null check (country in ('TG','BJ','BF','CI')),
 city text not null check (char_length(city) between 2 and 100),
 address text not null check (char_length(address) between 3 and 300),
 phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
 license_number text not null check (char_length(license_number) between 2 and 100),
 approved boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.inventory (
 id uuid primary key default gen_random_uuid(),
 pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
 medicine text not null check (char_length(medicine) between 2 and 150),
 dosage text not null check (char_length(dosage) between 1 and 100),
 quantity integer not null check (quantity >= 0),
 price integer check (price >= 0),
 updated_at timestamptz not null default now(),
 unique(pharmacy_id,medicine,dosage)
);
create index inventory_search on public.inventory(lower(medicine));
create function public.touch_inventory() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger inventory_timestamp before insert or update on public.inventory for each row execute function public.touch_inventory();
alter table public.profiles enable row level security;
alter table public.pharmacies enable row level security;
alter table public.inventory enable row level security;
-- Roles cannot be assigned or changed by application clients.
revoke all on public.profiles, public.pharmacies, public.inventory from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.pharmacies to authenticated;
grant update(name,country,city,address,phone,license_number) on public.pharmacies to authenticated;
grant select, insert, update, delete on public.inventory to authenticated;
create policy profile_read on public.profiles for select to authenticated using (id = auth.uid());
create policy pharmacy_read on public.pharmacies for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy pharmacy_create on public.pharmacies for insert to authenticated with check (owner_id = auth.uid() and approved = false);
-- Editing a verified listing requires a new review; the trigger resets approval.
create function public.reset_approval() returns trigger language plpgsql set search_path = '' as $$
begin
 if (new.name,new.country,new.city,new.address,new.phone,new.license_number) is distinct from (old.name,old.country,old.city,old.address,old.phone,old.license_number) then new.approved = false; end if;
 return new;
end; $$;
create trigger reset_pharmacy_approval before update on public.pharmacies for each row execute function public.reset_approval();
create policy pharmacy_edit on public.pharmacies for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy stock_read on public.inventory for select to authenticated using (exists(select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()));
create policy stock_create on public.inventory for insert to authenticated with check (exists(select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()));
create policy stock_edit on public.inventory for update to authenticated using (exists(select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid())) with check (exists(select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()));
create policy stock_delete on public.inventory for delete to authenticated using (exists(select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()));
create function public.review_pharmacy(target uuid, decision boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
 update public.pharmacies set approved = decision where id = target;
end; $$;
-- Only this limited projection is public: no owner, licence, or exact stock counts.
create function public.search_medicines(term text, country_code text, city_query text default '')
returns table(stock_id uuid,medicine text,dosage text,price integer,updated_at timestamptz,pharmacy text,country text,city text,address text,phone text)
language sql stable security definer set search_path = '' as $$
 select i.id,i.medicine,i.dosage,i.price,i.updated_at,p.name,p.country,p.city,p.address,p.phone
 from public.inventory i join public.pharmacies p on p.id = i.pharmacy_id
 where p.approved and i.quantity > 0 and char_length(trim(term)) >= 2
 and p.country = country_code and position(lower(trim(term)) in lower(i.medicine)) > 0
 and position(lower(trim(city_query)) in lower(p.city)) > 0
 order by i.updated_at desc limit 100;
$$;
revoke all on function public.handle_new_user(),public.touch_inventory(),public.reset_approval(),public.is_admin(),public.review_pharmacy(uuid,boolean),public.search_medicines(text,text,text) from public;
grant execute on function public.is_admin(),public.review_pharmacy(uuid,boolean) to authenticated;
grant execute on function public.search_medicines(text,text,text) to anon,authenticated;
commit;
