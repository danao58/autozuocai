# API 说明

本项目后端运行在 Vercel Serverless Functions，数据库使用 Supabase PostgreSQL。

## 兼容接口

- `GET /api/data`：读取完整应用快照，返回前端现有 JSON 结构。
- `PUT /api/data`：保存完整应用快照。内部会按快照重建拆分后的业务表，语义与旧版“保存整包 JSON”一致。

## 模块接口

- `GET /api/categories`：分类列表。
- `POST /api/categories`：新增分类。
- `PUT /api/categories?id=:id`：更新分类。
- `DELETE /api/categories?id=:id`：删除分类。
- `GET /api/ingredients`：食材列表。
- `POST /api/ingredients`：新增食材。
- `PUT /api/ingredients?id=:id`：更新食材。
- `DELETE /api/ingredients?id=:id`：删除食材。
- `GET /api/tags`：标签列表。
- `POST /api/tags`：新增标签。
- `PUT /api/tags?id=:id`：更新标签。
- `DELETE /api/tags?id=:id`：删除标签。
- `GET /api/recipes`：菜谱列表。
- `POST /api/recipes`：新增菜谱。
- `PUT /api/recipes?id=:id`：更新菜谱。
- `DELETE /api/recipes?id=:id`：删除菜谱。
- `GET /api/shopping`：购物清单。
- `POST /api/shopping`：新增购物项。
- `PUT /api/shopping?id=:id`：更新购物项。
- `DELETE /api/shopping?id=:id`：删除购物项。
- `GET /api/snapshot`：读取拆表后的聚合快照。
- `POST /api/migrate-json`：把旧版导出的 JSON 快照导入拆分表。

## 数据库

建表脚本在 `database/schema.sql`。首次部署前需要在 Supabase SQL Editor 执行该脚本。
