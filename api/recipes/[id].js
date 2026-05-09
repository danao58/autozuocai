const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

function mapRecipe(row, tags = []) {
  return {
    id: row.id,
    name: row.name,
    desc: row.description || "",
    image: row.image || null,
    coverColor: row.cover_color || "#1769e0",
    tags,
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
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const body = parseBody(req);
      const result = await query(
        `
          update app_recipes
          set name = $2,
              description = $3,
              image = $4::jsonb,
              cover_color = $5,
              difficulty = $6,
              favorite = $7,
              steps = $8::jsonb,
              updated_at = now()
          where id = $1
          returning *
        `,
        [
          id,
          body.name,
          body.desc || "",
          JSON.stringify(body.image || null),
          body.coverColor || "#1769e0",
          body.difficulty || "简单",
          Boolean(body.favorite),
          JSON.stringify(body.steps || [])
        ]
      );
      if (!result.rows[0]) {
        sendJson(res, 404, { error: "Recipe not found" });
        return;
      }
      await replaceRecipeTags(id, body.tags || []);
      sendJson(res, 200, mapRecipe(result.rows[0], body.tags || []));
      return;
    }

    if (req.method === "DELETE") {
      await query("delete from app_recipes where id = $1", [id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
