-- Rode isso no editor SQL do Supabase (Project > SQL Editor > New query)

create table shop_settings (
  id int primary key default 1,
  name text default 'Norte House Burger',
  logo_url text,
  constraint single_row check (id = 1)
);
insert into shop_settings (id, name) values (1, 'Norte House Burger');

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null,
  cost numeric(10,2),
  photo_url text,
  created_at timestamptz default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references menu_items(id),
  item_name text not null,
  category text default 'burger', -- 'burger' ou 'drink'
  unit_price numeric(10,2) not null,
  quantity int not null default 1,
  sold_at timestamptz default now()
);

-- Storage: crie um bucket público chamado "menu-photos" em Storage > New bucket
-- para guardar as fotos enviadas pelo dono da loja.

-- RLS (Row Level Security) básico — ajuste depois conforme autenticação
alter table menu_items enable row level security;
alter table sales enable row level security;
alter table shop_settings enable row level security;

create policy "public read menu" on menu_items for select using (true);
create policy "public write menu" on menu_items for insert with check (true);
create policy "public read sales" on sales for select using (true);
create policy "public write sales" on sales for insert with check (true);
create policy "public read settings" on shop_settings for select using (true);
create policy "public write settings" on shop_settings for update using (true);
