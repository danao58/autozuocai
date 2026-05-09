# 做菜助手

做菜管理网页。目标部署形态为 Vercel 静态页面 + Vercel Serverless API + Supabase PostgreSQL。前端保留 `localStorage` 兜底缓存，生产环境建议使用远程存储。

## 使用方式

本地静态预览可直接用浏览器打开 `index.html`，此时远程 API 不可用会自动使用本地缓存。

需要本地连 Supabase 数据库时，不要使用 IDE 的 `63342` 静态预览，必须启动 Vercel Dev：

```bash
npm install
npm start
```

然后访问 Vercel Dev 输出的本地地址，例如 `http://localhost:3000`。

Vercel 部署时需要配置环境变量：

```txt
DATABASE_URL=postgresql://postgres:你的密码@db.wrpduaofxopoiqdumhyz.supabase.co:5432/postgres
```

首次使用 Supabase 时，先在 SQL Editor 执行 `database/schema.sql`。

后台密码在 `config.js` 中配置。

## 已实现功能

- 今日推荐：根据库存推荐菜谱，显示缺少食材和临期食材。
- 今日菜品：按餐次管理，支持进入步骤制作和计时。
- 菜谱：搜索、标签、难度、耗时、可做筛选。
- 冰箱：管理食材库存和保质期。
- 购物清单：缺少食材一键加入，已购买项可入库。
- 做菜历史：制作完成后自动记录。
- 后台管理：食材分类、食材、菜谱增删改查。
- 菜谱图片：支持上传、预览、替换、删除。
- 备份恢复：支持导出、导入、复制备份文本和重置示例数据。

## 存储说明

当前通过统一的 `storage` 对象读写数据。`config.js` 中 `storageMode` 为 `remote` 时会调用 `/api/data` 读写数据库；接口失败时使用本地缓存兜底。

后端已经拆成模块 API：

- `GET/POST /api/categories`
- `PUT/DELETE /api/categories/:id`
- `GET/POST /api/ingredients`
- `PUT/DELETE /api/ingredients/:id`
- `GET/POST /api/tags`
- `PUT/DELETE /api/tags/:id`
- `GET/POST /api/recipes`
- `PUT/DELETE /api/recipes/:id`
- `GET/POST /api/shopping`
- `PUT/DELETE /api/shopping/:id`
- `GET /api/snapshot`
- `POST /api/migrate-json`

`/api/data` 作为兼容聚合接口保留，内部已经读写拆分后的 Supabase 表。
