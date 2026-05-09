create table if not exists app_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_ingredients (
  id text primary key,
  name text not null,
  category_id text references app_categories(id) on delete set null,
  stock numeric not null default 0,
  unit text not null default '',
  expire_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_tags (
  id text primary key,
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_recipes (
  id text primary key,
  name text not null,
  description text not null default '',
  image jsonb,
  cover_color text not null default '#1769e0',
  difficulty text not null default '简单',
  favorite boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_recipe_tags (
  recipe_id text not null references app_recipes(id) on delete cascade,
  tag_name text not null,
  primary key (recipe_id, tag_name)
);

create table if not exists app_today_dishes (
  id text primary key,
  recipe_id text references app_recipes(id) on delete cascade,
  meal_type text not null default 'lunch',
  status text not null default 'pending',
  created_at bigint not null
);

create table if not exists app_shopping_items (
  id text primary key,
  ingredient_id text references app_ingredients(id) on delete set null,
  name text not null,
  count numeric not null default 1,
  unit text not null default '',
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_cook_history (
  id text primary key,
  recipe_id text,
  recipe_name text not null,
  cooked_at bigint not null
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_ingredients_category on app_ingredients(category_id);
create index if not exists idx_app_recipe_tags_recipe on app_recipe_tags(recipe_id);
create index if not exists idx_app_today_dishes_recipe on app_today_dishes(recipe_id);
create index if not exists idx_app_shopping_items_checked on app_shopping_items(checked);
create index if not exists idx_app_cook_history_cooked_at on app_cook_history(cooked_at);
