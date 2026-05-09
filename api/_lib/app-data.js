const { query } = require("./db");

const defaultFrontOrder = ["recommend", "today", "recipes", "fridge", "shopping", "history"];
const defaultAdminOrder = ["categories", "ingredients", "tags", "recipeAdmin", "backup"];

function dateValue(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

async function readSnapshot() {
  const [categories, ingredients, tags, recipes, todayDishes, shoppingList, cookHistory, settings] = await Promise.all([
    query("select id, name from app_categories order by sort_order, created_at"),
    query("select id, name, category_id, stock, unit, expire_at from app_ingredients order by created_at"),
    query("select id, name from app_tags order by sort_order, created_at"),
    query(`
      select r.*,
             coalesce(array_agg(rt.tag_name) filter (where rt.tag_name is not null), '{}') as tags
      from app_recipes r
      left join app_recipe_tags rt on rt.recipe_id = r.id
      group by r.id
      order by r.created_at
    `),
    query("select id, recipe_id, meal_type, status, created_at from app_today_dishes order by created_at"),
    query("select id, ingredient_id, name, count, unit, checked from app_shopping_items order by created_at"),
    query("select id, recipe_id, recipe_name, cooked_at from app_cook_history order by cooked_at"),
    query("select key, value from app_settings")
  ]);

  const settingsMap = Object.fromEntries(settings.rows.map((row) => [row.key, row.value]));
  return {
    categories: categories.rows.map((row) => ({ id: row.id, name: row.name })),
    ingredients: ingredients.rows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id || "",
      stock: Number(row.stock) || 0,
      unit: row.unit || "",
      expireAt: dateValue(row.expire_at)
    })),
    tags: tags.rows.map((row) => ({ id: row.id, name: row.name })),
    recipes: recipes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      desc: row.description || "",
      image: row.image || null,
      coverColor: row.cover_color || "#1769e0",
      tags: row.tags || [],
      difficulty: row.difficulty || "简单",
      favorite: Boolean(row.favorite),
      steps: row.steps || []
    })),
    todayDishes: todayDishes.rows.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      mealType: row.meal_type,
      status: row.status,
      createdAt: Number(row.created_at)
    })),
    shoppingList: shoppingList.rows.map((row) => ({
      id: row.id,
      ingredientId: row.ingredient_id || "",
      name: row.name,
      count: Number(row.count) || 0,
      unit: row.unit || "",
      checked: Boolean(row.checked)
    })),
    cookHistory: cookHistory.rows.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      recipeName: row.recipe_name,
      cookedAt: Number(row.cooked_at)
    })),
    meta: {
      version: 2,
      storageMode: "remote",
      expireWarningDays: settingsMap.expireWarningDays || 3,
      frontPageOrder: settingsMap.frontPageOrder || defaultFrontOrder,
      adminPageOrder: settingsMap.adminPageOrder || defaultAdminOrder,
      exportedAt: null
    }
  };
}

async function upsertSetting(key, value) {
  await query(
    `
      insert into app_settings (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `,
    [key, JSON.stringify(value)]
  );
}

async function importSnapshot(data) {
  await query("delete from app_recipe_tags");
  await query("delete from app_today_dishes");
  await query("delete from app_shopping_items");
  await query("delete from app_cook_history");
  await query("delete from app_recipes");
  await query("delete from app_ingredients");
  await query("delete from app_tags");
  await query("delete from app_categories");

  for (const category of data.categories || []) {
    await query(
      "insert into app_categories (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name",
      [category.id, category.name]
    );
  }

  for (const ingredient of data.ingredients || []) {
    await query(
      `
        insert into app_ingredients (id, name, category_id, stock, unit, expire_at)
        values ($1, $2, nullif($3, ''), $4, $5, nullif($6, '')::date)
        on conflict (id) do update
        set name = excluded.name,
            category_id = excluded.category_id,
            stock = excluded.stock,
            unit = excluded.unit,
            expire_at = excluded.expire_at,
            updated_at = now()
      `,
      [ingredient.id, ingredient.name, ingredient.categoryId || "", ingredient.stock || 0, ingredient.unit || "", ingredient.expireAt || ""]
    );
  }

  for (const tag of data.tags || []) {
    await query(
      "insert into app_tags (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name",
      [tag.id, tag.name]
    );
  }

  for (const recipe of data.recipes || []) {
    await query(
      `
        insert into app_recipes (id, name, description, image, cover_color, difficulty, favorite, steps)
        values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)
        on conflict (id) do update
        set name = excluded.name,
            description = excluded.description,
            image = excluded.image,
            cover_color = excluded.cover_color,
            difficulty = excluded.difficulty,
            favorite = excluded.favorite,
            steps = excluded.steps,
            updated_at = now()
      `,
      [
        recipe.id,
        recipe.name,
        recipe.desc || "",
        JSON.stringify(recipe.image || null),
        recipe.coverColor || "#1769e0",
        recipe.difficulty || "简单",
        Boolean(recipe.favorite),
        JSON.stringify(recipe.steps || [])
      ]
    );
    await query("delete from app_recipe_tags where recipe_id = $1", [recipe.id]);
    for (const tag of recipe.tags || []) {
      await query("insert into app_recipe_tags (recipe_id, tag_name) values ($1, $2) on conflict do nothing", [recipe.id, tag]);
    }
  }

  for (const item of data.shoppingList || []) {
    await query(
      `
        insert into app_shopping_items (id, ingredient_id, name, count, unit, checked)
        values ($1, nullif($2, ''), $3, $4, $5, $6)
        on conflict (id) do update
        set ingredient_id = excluded.ingredient_id,
            name = excluded.name,
            count = excluded.count,
            unit = excluded.unit,
            checked = excluded.checked,
            updated_at = now()
      `,
      [item.id, item.ingredientId || "", item.name, item.count || 1, item.unit || "", Boolean(item.checked)]
    );
  }

  for (const dish of data.todayDishes || []) {
    await query(
      `
        insert into app_today_dishes (id, recipe_id, meal_type, status, created_at)
        values ($1, $2, $3, $4, $5)
        on conflict (id) do update
        set recipe_id = excluded.recipe_id,
            meal_type = excluded.meal_type,
            status = excluded.status,
            created_at = excluded.created_at
      `,
      [dish.id, dish.recipeId, dish.mealType || "lunch", dish.status || "pending", dish.createdAt || Date.now()]
    );
  }

  for (const history of data.cookHistory || []) {
    await query(
      `
        insert into app_cook_history (id, recipe_id, recipe_name, cooked_at)
        values ($1, $2, $3, $4)
        on conflict (id) do update
        set recipe_id = excluded.recipe_id,
            recipe_name = excluded.recipe_name,
            cooked_at = excluded.cooked_at
      `,
      [history.id, history.recipeId, history.recipeName, history.cookedAt || Date.now()]
    );
  }

  const meta = data.meta || {};
  await upsertSetting("expireWarningDays", meta.expireWarningDays || 3);
  await upsertSetting("frontPageOrder", meta.frontPageOrder || defaultFrontOrder);
  await upsertSetting("adminPageOrder", meta.adminPageOrder || defaultAdminOrder);
}

module.exports = {
  importSnapshot,
  readSnapshot
};
