const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

function mapRecipe(row) {
  return {
    id: row.id,
    name: row.name,
    desc: row.description || "",
    image: row.image || null,
    coverColor: row.cover_color || "#1769e0",
    tags: row.tags || [],
    difficulty: row.difficulty || "简单",
    favorite: Boolean(row.favorite),
    steps: row.steps || []
  };
}

async function replaceRecipeTags(recipeId, tags = []) {
  await query("delete from app_recipe_tags where recipe_id = $1", [recipeId]);
  for (const tag of tags) {
    await query("insert into app_recipe_tags (recipe_id, tag_name) values ($1, $2) on conflict do nothing", [recipeId, tag]);
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await query(`
        select r.*,
               coalesce(array_agg(rt.tag_name) filter (where rt.tag_name is not null), '{}') as tags
        from app_recipes r
        left join app_recipe_tags rt on rt.recipe_id = r.id
        group by r.id
        order by r.created_at
      `);
      sendJson(res, 200, result.rows.map(mapRecipe));
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const result = await query(
        `
          insert into app_recipes (id, name, description, image, cover_color, difficulty, favorite, steps)
          values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)
          returning *
        `,
        [
          body.id,
          body.name,
          body.desc || "",
          JSON.stringify(body.image || null),
          body.coverColor || "#1769e0",
          body.difficulty || "简单",
          Boolean(body.favorite),
          JSON.stringify(body.steps || [])
        ]
      );
      await replaceRecipeTags(body.id, body.tags || []);
      sendJson(res, 201, mapRecipe({ ...result.rows[0], tags: body.tags || [] }));
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    handleError(res, error);
  }
};
