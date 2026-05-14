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
GEMINI_API_KEY=你的 Google AI Studio API Key
```

`GEMINI_API_KEY` 用于后台“菜谱模板导入”的 AI 解析功能。可以使用 Google AI Studio 的 Gemini API 免费层，免费层有请求频率限制，适合后台偶尔把文字或链接整理成菜谱 JSON 模板。AI Key 只放在 Vercel 环境变量里，不要写进前端文件。

首次使用 Supabase 时，先在 SQL Editor 执行 `database/schema.sql`。

后台密码在 `config.js` 中配置。

## EmailJS 到期预警配置

1. 在 EmailJS 创建 Email Service，当前项目已预填 `serviceId: "service_vqns7od"`。
2. 在 EmailJS 创建 Email Template，模板变量建议包含：
   - `{{to_email}}`：收件邮箱
   - `{{subject}}`：邮件标题
   - `{{items_text}}` 或 `{{message}}`：临期/过期食材明细
   - `{{warning_days}}`：提前预警天数
   - `{{item_count}}`：预警食材数量
   - `{{sent_at}}`：发送时间
3. 打开 `config.js`，填写 `emailjs.templateId` 和 `emailjs.publicKey`。
4. 进入后台的“临期预警设置”，填写收件邮箱、提前天数，并可点击“发送测试邮件”验证。多个邮箱可用逗号、分号、空格或换行分隔。
5. 项目已配置 Vercel Cron：`/api/cron-expire-warning` 每天 UTC 01:00 触发一次，也就是北京时间 09:00 左右。
6. Vercel Cron 使用 UTC 时间；Hobby 计划支持每天一次，执行时间可能在目标小时内浮动。
7. Cron 后台发送复用后台“临期预警设置”的收件邮箱、提前天数、启用状态和自动发送开关。接口数量只新增 1 个。

Vercel 环境变量建议配置：

```text
EMAILJS_SERVICE_ID=service_vqns7od
EMAILJS_TEMPLATE_ID=template_6l87u93
EMAILJS_PUBLIC_KEY=TwCRrKD7ZF6bNrHuE
```

## 已实现功能

- 今日推荐：根据库存推荐菜谱，显示缺少食材和临期食材。
- 今日菜品：按餐次管理，支持进入步骤制作和计时。
- 菜谱：搜索、标签、难度、耗时、可做筛选。
- 冰箱：管理食材库存和保质期。
- 购物清单：缺少食材一键加入，已购买项可入库。
- 做菜历史：制作完成后自动记录。
- 后台管理：食材分类、食材、菜谱增删改查。
- 菜谱模板导入：可复制带填写说明的 JSON 模板，也可直接填写文字或链接，由服务端调用 Gemini 免费 API 生成模板后导入；模板内说明了难度、时间和可用食材单位。
- 菜谱图片：支持上传、预览、替换、删除。
- 备份恢复：支持导出、导入、复制备份文本和重置示例数据。

## 存储说明

当前通过统一的 `storage` 对象读写数据。`config.js` 中 `storageMode` 为 `remote` 时会调用 `/api/data` 读写数据库；接口失败时使用本地缓存兜底。

后端已经拆成模块 API：

- `GET/POST /api/categories`
- `PUT/DELETE /api/categories?id=:id`
- `GET/POST /api/ingredients`
- `PUT/DELETE /api/ingredients?id=:id`
- `GET/POST /api/tags`
- `PUT/DELETE /api/tags?id=:id`
- `GET/POST /api/recipes`
- `PUT/DELETE /api/recipes?id=:id`
- `GET/POST /api/shopping`
- `PUT/DELETE /api/shopping?id=:id`
- `GET /api/snapshot`
- `POST /api/migrate-json`
- `POST /api/ai-recipe`

`/api/data` 作为兼容聚合接口保留，内部已经读写拆分后的 Supabase 表。
