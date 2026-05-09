# 做菜助手

做菜管理网页。默认配置为 Vercel API + Supabase PostgreSQL 远程存储，接口失败时会临时使用浏览器 `localStorage` 缓存。

## 使用方式

本地静态预览可直接用浏览器打开 `index.html`，此时远程 API 不可用会自动使用本地缓存。

Vercel 部署时需要配置环境变量：

```txt
DATABASE_URL=postgresql://postgres:你的密码@db.wrpduaofxopoiqdumhyz.supabase.co:5432/postgres
```

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
