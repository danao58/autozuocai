"use strict";

const STORE_KEY = "cookbook_app_v1";
const PENDING_REMOTE_SAVE_KEY = `${STORE_KEY}_pending_remote_save`;
const REMOTE_SAVE_TIMEOUT = 8000;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const DEFAULT_RECIPE_IMAGE = "defalut.png";
const CONFIG = window.APP_CONFIG || {};
const mealLabels = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐"
};
const difficulties = ["简单", "中等", "复杂"];
const defaultTags = ["快手菜", "家常", "下饭", "主食", "素菜", "低脂", "早餐", "暖胃"];
const units = ["个", "克", "斤", "把", "颗", "瓣", "勺", "碗", "份", "毫升"];
const timeOptions = [
  { label: "不计时", value: 0 },
  { label: "1 分钟", value: 60 },
  { label: "2 分钟", value: 120 },
  { label: "3 分钟", value: 180 },
  { label: "5 分钟", value: 300 },
  { label: "10 分钟", value: 600 }
];
const pageLabels = {
  recommend: "今日推荐",
  today: "今日菜品",
  recipes: "菜谱",
  fridge: "冰箱",
  shopping: "购物清单",
  history: "做菜历史",
  categories: "食材分类",
  ingredients: "食材管理",
  tags: "标签管理",
  recipeAdmin: "菜谱管理",
  backup: "备份恢复"
};
const defaultFrontOrder = ["recommend", "today", "recipes", "fridge", "shopping", "history"];
const defaultAdminOrder = ["categories", "ingredients", "tags", "recipeAdmin", "backup"];

let state = {
  mode: "front",
  page: "recommend",
  data: null,
  cooking: null,
  timerId: null,
  modal: null,
  activeMeal: "lunch",
  activeFridgeCategoryId: "",
  filters: {
    recipeSearch: "",
    recipeTag: "",
    recipeDifficulty: "",
    recipeTime: "",
    recipeCanCook: "",
    recommendCanCook: "",
    fridgeSearch: "",
    historySearch: "",
    ingredientAdminSearch: "",
    ingredientAdminCategory: "",
    recipeAdminSearch: "",
    recipeAdminTag: "",
    recipeAdminDifficulty: ""
  },
  adminAuthed: false
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

window.COOKBOOK_APP_BUILD = "20260509-savefix-10";

const storage = {
  loadLocal() {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const demo = createDemoData();
      this.saveLocal(demo);
      return demo;
    }
    try {
      return normalizeData(JSON.parse(raw));
    } catch {
      const demo = createDemoData();
      this.saveLocal(demo);
      return demo;
    }
  },
  saveLocal(data) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn(err);
      showToast("本地暂存失败，可能是浏览器存储空间不足");
      return false;
    }
  },
  async load() {
    if (CONFIG.storageMode !== "remote") return this.loadLocal();
    if (localStorage.getItem(PENDING_REMOTE_SAVE_KEY)) {
      const local = this.loadLocal();
      this.save(local);
      return local;
    }
    try {
      const response = await fetch(`${CONFIG.apiBase || "/api"}/data`, { cache: "no-store" });
      if (!response.ok) throw new Error("远程数据读取失败");
      const remote = await response.json();
      if (!remote || !Array.isArray(remote.categories)) {
        const demo = createDemoData();
        await this.save(demo);
        return demo;
      }
      const normalized = normalizeData(remote);
      this.saveLocal(normalized);
      return normalized;
    } catch (err) {
      console.warn(err);
      showToast("远程数据读取失败，已使用本地缓存");
      const local = this.loadLocal();
      if (state.data) {
        state.data = local;
        render();
      }
      return local;
    }
  },
  async save(data) {
    const localSaved = this.saveLocal(data);
    if (CONFIG.storageMode !== "remote") return localSaved;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REMOTE_SAVE_TIMEOUT);
    try {
      const response = await fetch(`${CONFIG.apiBase || "/api"}/data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("远程数据保存失败");
      localStorage.removeItem(PENDING_REMOTE_SAVE_KEY);
      return true;
    } catch (err) {
      console.warn(err);
      localStorage.setItem(PENDING_REMOTE_SAVE_KEY, String(Date.now()));
      showToast("远程保存失败，已暂存本地，请检查接口或数据库配置");
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  },
  export() {
    return JSON.stringify({ ...state.data, meta: { ...state.data.meta, exportedAt: Date.now() } }, null, 2);
  },
  async import(nextData) {
    validateImport(nextData);
    const normalized = normalizeData(nextData);
    const saved = await this.save(normalized);
    state.data = normalized;
    return saved;
  },
  async reset() {
    const demo = createDemoData();
    const saved = await this.save(demo);
    state.data = demo;
    return saved;
  },
  clear() {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(PENDING_REMOTE_SAVE_KEY);
  }
};

function createEmptyData() {
  return {
    categories: [],
    ingredients: [],
    tags: defaultTags.map((name) => tagItem(name)),
    recipes: [],
    todayDishes: [],
    shoppingList: [],
    cookHistory: [],
    meta: { version: 1, storageMode: "local", expireWarningDays: 3, frontPageOrder: defaultFrontOrder, adminPageOrder: defaultAdminOrder, exportedAt: null }
  };
}

function createDemoData() {
  const today = new Date();
  const plus = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const categories = [
    { id: "cat_meat", name: "肉类" },
    { id: "cat_veg", name: "蔬菜" },
    { id: "cat_egg", name: "蛋奶" },
    { id: "cat_main", name: "主食" },
    { id: "cat_spice", name: "调料" }
  ];
  const ingredients = [
    { id: "ing_egg", name: "鸡蛋", categoryId: "cat_egg", stock: 6, unit: "个", expireAt: plus(2) },
    { id: "ing_tomato", name: "番茄", categoryId: "cat_veg", stock: 4, unit: "个", expireAt: plus(1) },
    { id: "ing_pork", name: "猪肉", categoryId: "cat_meat", stock: 300, unit: "克", expireAt: plus(5) },
    { id: "ing_beef", name: "牛肉", categoryId: "cat_meat", stock: 0, unit: "克", expireAt: "" },
    { id: "ing_potato", name: "土豆", categoryId: "cat_veg", stock: 3, unit: "个", expireAt: plus(8) },
    { id: "ing_green", name: "青菜", categoryId: "cat_veg", stock: 2, unit: "把", expireAt: plus(2) },
    { id: "ing_rice", name: "米饭", categoryId: "cat_main", stock: 2, unit: "碗", expireAt: "" },
    { id: "ing_noodle", name: "面条", categoryId: "cat_main", stock: 1, unit: "份", expireAt: "" },
    { id: "ing_onion", name: "洋葱", categoryId: "cat_veg", stock: 1, unit: "个", expireAt: plus(10) },
    { id: "ing_garlic", name: "大蒜", categoryId: "cat_spice", stock: 8, unit: "瓣", expireAt: "" },
    { id: "ing_soy", name: "生抽", categoryId: "cat_spice", stock: 10, unit: "勺", expireAt: "" },
    { id: "ing_oil", name: "食用油", categoryId: "cat_spice", stock: 10, unit: "勺", expireAt: "" }
  ];
  const recipes = [
    recipe("rec_egg_tomato", "番茄炒蛋", "酸甜下饭的家常快手菜", "#f97316", ["快手菜", "家常", "下饭"], "简单", true, [
      step("鸡蛋打散，番茄切块。", 0, [["ing_egg", 2], ["ing_tomato", 2]]),
      step("热锅倒油，先炒鸡蛋后盛出。", 120, [["ing_oil", 1]]),
      step("番茄炒出汁，加入鸡蛋和生抽翻炒。", 180, [["ing_soy", 1]])
    ]),
    recipe("rec_green_rice", "青菜蛋炒饭", "适合处理剩米饭的晚餐", "#16a34a", ["快手菜", "主食"], "简单", false, [
      step("青菜切碎，鸡蛋打散。", 0, [["ing_green", 1], ["ing_egg", 1]]),
      step("炒蛋后加入米饭炒散。", 180, [["ing_rice", 1], ["ing_oil", 1]]),
      step("加入青菜和生抽炒匀。", 120, [["ing_soy", 1]])
    ]),
    recipe("rec_pork_potato", "土豆肉片", "咸香家常菜，适合午餐", "#d97706", ["家常", "下饭"], "中等", true, [
      step("土豆切片，猪肉切片，大蒜拍碎。", 0, [["ing_potato", 2], ["ing_pork", 150], ["ing_garlic", 2]]),
      step("肉片下锅炒到变色。", 180, [["ing_oil", 1]]),
      step("加入土豆片和生抽炒熟。", 360, [["ing_soy", 1]])
    ]),
    recipe("rec_beef_noodle", "洋葱牛肉面", "需要牛肉的热汤面", "#7c3aed", ["主食", "暖胃"], "中等", false, [
      step("洋葱切丝，牛肉切片。", 0, [["ing_onion", 1], ["ing_beef", 160]]),
      step("炒香洋葱和牛肉。", 240, [["ing_oil", 1], ["ing_soy", 1]]),
      step("煮面并合并汤底。", 360, [["ing_noodle", 1]])
    ]),
    recipe("rec_garlic_green", "蒜蓉青菜", "清爽的素菜搭配", "#0891b2", ["素菜", "快手菜", "低脂"], "简单", false, [
      step("青菜洗净，大蒜切末。", 0, [["ing_green", 1], ["ing_garlic", 2]]),
      step("爆香蒜末，加入青菜快炒。", 180, [["ing_oil", 1], ["ing_soy", 1]])
    ])
  ];
  return normalizeData({
    categories,
    ingredients,
    tags: defaultTags.map((name) => tagItem(name)),
    recipes,
    todayDishes: [],
    shoppingList: [],
    cookHistory: [],
    meta: { version: 1, storageMode: "local", expireWarningDays: 3, frontPageOrder: defaultFrontOrder, adminPageOrder: defaultAdminOrder, exportedAt: null }
  });
}

function recipe(id, name, desc, color, tags, difficulty, favorite, steps) {
  return {
    id,
    name,
    desc,
    image: null,
    coverColor: color,
    tags,
    difficulty,
    favorite,
    steps
  };
}

function tagItem(name, id = "") {
  return { id: id || uid("tag"), name };
}

function step(content, time, consumes) {
  return {
    id: uid("step"),
    content,
    time,
    consumes: consumes.map(([ingredientId, count]) => ({ ingredientId, count }))
  };
}

function normalizeData(data) {
  const normalizedTags = normalizeTags(data.tags, data.recipes);
  return {
    categories: Array.isArray(data.categories) ? data.categories : [],
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.map((item) => ({
      id: item.id || uid("ing"),
      name: item.name || "",
      categoryId: item.categoryId || "",
      stock: Number(item.stock) || 0,
      unit: item.unit || "",
      expireAt: item.expireAt || ""
    })) : [],
    tags: normalizedTags,
    recipes: Array.isArray(data.recipes) ? data.recipes.map((item) => ({
      id: item.id || uid("rec"),
      name: item.name || "",
      desc: item.desc || "",
      image: item.image || null,
      coverColor: item.coverColor || "#1769e0",
      tags: Array.isArray(item.tags) ? item.tags : [],
      difficulty: item.difficulty || "简单",
      favorite: Boolean(item.favorite),
      steps: Array.isArray(item.steps) ? item.steps.map((s) => ({
        id: s.id || uid("step"),
        content: s.content || "",
        time: Number(s.time) || 0,
        consumes: Array.isArray(s.consumes) ? s.consumes.map((c) => ({
          ingredientId: c.ingredientId,
          count: Number(c.count) || 0
        })).filter((c) => c.ingredientId && c.count > 0) : []
      })) : []
    })) : [],
    todayDishes: Array.isArray(data.todayDishes) ? data.todayDishes : [],
    shoppingList: Array.isArray(data.shoppingList) ? data.shoppingList : [],
    cookHistory: Array.isArray(data.cookHistory) ? data.cookHistory : [],
    meta: normalizeMeta(data.meta)
  };
}

function normalizeMeta(meta = {}) {
  return {
    version: 1,
    storageMode: "local",
    expireWarningDays: 3,
    frontPageOrder: normalizeOrder(meta.frontPageOrder, defaultFrontOrder),
    adminPageOrder: normalizeOrder(meta.adminPageOrder, defaultAdminOrder),
    exportedAt: null,
    ...meta,
    frontPageOrder: normalizeOrder(meta.frontPageOrder, defaultFrontOrder),
    adminPageOrder: normalizeOrder(meta.adminPageOrder, defaultAdminOrder)
  };
}

function normalizeOrder(order, defaults) {
  const list = Array.isArray(order) ? order.filter((page) => defaults.includes(page)) : [];
  return [...list, ...defaults.filter((page) => !list.includes(page))];
}

function validateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("备份内容必须是对象格式");
  }
  ["categories", "ingredients", "recipes", "todayDishes", "shoppingList", "cookHistory"].forEach((key) => {
    if (!Array.isArray(data[key])) {
      throw new Error(`缺少必要字段：${key}`);
    }
  });
}

function normalizeTags(tags, recipes = []) {
  const names = [];
  if (Array.isArray(tags)) {
    tags.forEach((item) => {
      const name = typeof item === "string" ? item.trim() : item?.name?.toString().trim();
      if (name && !names.includes(name)) names.push(name);
    });
  }
  if (!names.length && Array.isArray(recipes)) {
    recipes.forEach((recipeItem) => {
      (Array.isArray(recipeItem.tags) ? recipeItem.tags : []).forEach((tag) => {
        const name = tag?.toString().trim();
        if (name && !names.includes(name)) names.push(name);
      });
    });
  }
  if (!names.length) names.push(...defaultTags);
  return names.map((name) => {
    const existing = Array.isArray(tags) ? tags.find((item) => item?.name === name || item === name) : null;
    return tagItem(name, existing?.id || "");
  });
}

async function saveAndRender(message) {
  const saveTask = storage.save(state.data);
  render();
  if (message) showToast(message);
  const saved = await saveTask;
  return saved;
}

function persistAndRender(message) {
  storage.saveLocal(state.data);
  render();
  if (message) showToast(message);
  storage.save(state.data);
  return true;
}

let filterRenderTimer = null;

function scheduleFilterRender(target) {
  const selector = target.dataset.filter ? `[data-filter="${target.dataset.filter}"]` : "";
  window.clearTimeout(filterRenderTimer);
  filterRenderTimer = window.setTimeout(() => {
    render();
    const next = selector ? document.querySelector(selector) : null;
    if (next && ["INPUT", "TEXTAREA"].includes(next.tagName)) {
      next.focus();
      const end = next.value.length;
      next.setSelectionRange(end, end);
    }
  }, 180);
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[m]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function ingredientById(id) {
  return state.data.ingredients.find((item) => item.id === id);
}

function categoryById(id) {
  return state.data.categories.find((item) => item.id === id);
}

function tagById(id) {
  return state.data.tags.find((item) => item.id === id);
}

function recipeById(id) {
  return state.data.recipes.find((item) => item.id === id);
}

function recipeNeeds(recipeItem) {
  const totals = {};
  recipeItem.steps.forEach((s) => {
    s.consumes.forEach((c) => {
      totals[c.ingredientId] = (totals[c.ingredientId] || 0) + Number(c.count || 0);
    });
  });
  return Object.entries(totals).map(([ingredientId, count]) => ({ ingredientId, count }));
}

function recipeStatus(recipeItem) {
  const missing = [];
  const expiring = [];
  recipeNeeds(recipeItem).forEach((need) => {
    const ing = ingredientById(need.ingredientId);
    const stock = ing ? Number(ing.stock) || 0 : 0;
    if (!ing || stock < need.count) {
      missing.push({
        ingredientId: need.ingredientId,
        name: ing ? ing.name : "未知食材",
        count: Math.max(need.count - stock, need.count),
        unit: ing ? ing.unit : ""
      });
    }
    if (ing && stock > 0 && expireState(ing) === "soon") expiring.push(ing.name);
  });
  return { canCook: missing.length === 0, missing, expiring };
}

function sortedRecipes(recipes) {
  const recentIds = new Set(state.data.cookHistory.slice(-5).map((h) => h.recipeId));
  return [...recipes].sort((a, b) => {
    const sa = recipeStatus(a);
    const sb = recipeStatus(b);
    const score = (recipeItem, status) => {
      let value = 0;
      if (status.canCook) value += 1000;
      if (status.expiring.length) value += 120;
      value -= status.missing.length * 20;
      if (recentIds.has(recipeItem.id)) value -= 60;
      return value;
    };
    return score(b, sb) - score(a, sa) || a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function totalTime(recipeItem) {
  return recipeItem.steps.reduce((sum, s) => sum + (Number(s.time) || 0), 0);
}

function formatTime(seconds) {
  const value = Number(seconds) || 0;
  if (value <= 0) return "未计时";
  const min = Math.floor(value / 60);
  const sec = value % 60;
  if (!min) return `${sec} 秒`;
  if (!sec) return `${min} 分钟`;
  return `${min} 分 ${sec} 秒`;
}

function expireState(ingredient) {
  if (!ingredient.expireAt) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expire = new Date(`${ingredient.expireAt}T00:00:00`);
  const days = Math.ceil((expire - today) / 86400000);
  if (days < 0) return "expired";
  if (days <= expireWarningDays()) return "soon";
  return "ok";
}

function hasStock(ingredient) {
  return Number(ingredient?.stock) > 0;
}

function expireWarningDays() {
  return Math.max(0, Number(state.data.meta.expireWarningDays) || 0);
}

function daysUntilExpire(ingredient) {
  if (!ingredient.expireAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expire = new Date(`${ingredient.expireAt}T00:00:00`);
  return Math.ceil((expire - today) / 86400000);
}

function expireBadge(ingredient) {
  const status = expireState(ingredient);
  const days = daysUntilExpire(ingredient);
  if (status === "expired") return `<span class="status bad">已过期 ${Math.abs(days)} 天</span>`;
  if (status === "soon") return `<span class="status warn">临期 ${days} 天</span>`;
  return ingredient.expireAt ? `<span class="status ok">新鲜</span>` : `<span class="tag">未设置</span>`;
}

function expireText(ingredient) {
  const status = expireState(ingredient);
  const days = daysUntilExpire(ingredient);
  if (status === "expired") return `过期 ${Math.abs(days)} 天`;
  if (status === "soon") return `临期 ${days} 天`;
  return "新鲜";
}

function imageHtml(recipeItem) {
  if (recipeItem.image?.url) {
    return `<img class="recipe-image" src="${recipeItem.image.url}" alt="${escapeHtml(recipeItem.name)}">`;
  }
  return `<img class="recipe-image recipe-image-default" src="${DEFAULT_RECIPE_IMAGE}" alt="${escapeHtml(recipeItem.name || "recipe image")}">`;
}

function tagsHtml(tags) {
  return `<div class="chip-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function needsHtml(recipeItem) {
  return recipeNeeds(recipeItem).map((need) => {
    const ing = ingredientById(need.ingredientId);
    return `<span class="tag">${escapeHtml(ing?.name || "未知食材")} ${need.count}${escapeHtml(ing?.unit || "")}</span>`;
  }).join("");
}

function missingHtml(missing) {
  if (!missing.length) return `<span class="ok-text">食材充足</span>`;
  return missing.map((m) => `<span class="missing">${escapeHtml(m.name)} 缺 ${m.count}${escapeHtml(m.unit)}</span>`).join(" ");
}

function recipeCard(recipeItem, options = {}) {
  const status = recipeStatus(recipeItem);
  const inToday = state.data.todayDishes.some((item) => item.recipeId === recipeItem.id);
  if (options.compact) {
    return `
      <article class="card compact-card" data-action="view-recipe" data-id="${recipeItem.id}" title="双击查看详情">
        ${imageHtml(recipeItem)}
        <div class="card-body">
          <div class="actions" style="justify-content:space-between">
            <h3>${escapeHtml(recipeItem.name)}</h3>
            <span class="status ${status.canCook ? "ok" : "bad"}">${status.canCook ? "可制作" : `缺 ${status.missing.length} 种`}</span>
          </div>
          <p class="muted">${escapeHtml(recipeItem.desc || "暂无描述")}</p>
          <p><span class="tag">${formatTime(totalTime(recipeItem))}</span>${status.expiring.length ? ` <span class="status warn">有临期</span>` : ""}</p>
          ${status.missing.length ? `<p class="missing">${escapeHtml(status.missing.slice(0, 2).map((m) => m.name).join("、"))}${status.missing.length > 2 ? "等" : ""} 不足</p>` : ""}
          <div class="actions">
            <button data-action="add-today" data-id="${recipeItem.id}" type="button" ${inToday ? "disabled" : ""}>${inToday ? "已加入" : "加入今日菜品"}</button>
            ${status.missing.length ? `<button class="ghost" data-action="add-missing-shopping" data-id="${recipeItem.id}" type="button">加入购物清单</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }
  return `
    <article class="card" data-action="view-recipe" data-id="${recipeItem.id}" title="双击查看详情">
      ${imageHtml(recipeItem)}
      <div class="card-body">
        <div class="actions" style="justify-content:space-between">
          <h3>${escapeHtml(recipeItem.name)}</h3>
        </div>
        <p class="muted">${escapeHtml(recipeItem.desc)}</p>
        ${tagsHtml(recipeItem.tags)}
        <p><span class="status ${status.canCook ? "ok" : "bad"}">${status.canCook ? "可制作" : "缺少食材"}</span> <span class="tag">${recipeItem.difficulty}</span> <span class="tag">${formatTime(totalTime(recipeItem))}</span></p>
        <div class="chip-row">${needsHtml(recipeItem)}</div>
        <p>${missingHtml(status.missing)}</p>
        ${status.expiring.length ? `<p><span class="status warn">使用临期：${escapeHtml(status.expiring.join("、"))}</span></p>` : ""}
        <div class="actions">
          <button data-action="add-today" data-id="${recipeItem.id}" type="button" ${inToday ? "disabled" : ""}>${inToday ? "已加入" : "加入今日菜品"}</button>
          ${status.missing.length ? `<button class="ghost" data-action="add-missing-shopping" data-id="${recipeItem.id}" type="button">缺少食材加入购物清单</button>` : ""}
          ${options.admin ? `<button class="ghost" data-action="edit-recipe" data-id="${recipeItem.id}" type="button">编辑</button><button class="danger" data-action="delete-recipe" data-id="${recipeItem.id}" type="button">删除</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function render() {
  if (isMobileView() && state.mode !== "front") {
    state.mode = "front";
    state.page = "recommend";
  }
  document.querySelectorAll(".mode-tabs button").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === state.mode));
  renderPageTabs();
  document.querySelector("#frontTabs").classList.toggle("hidden", state.mode !== "front");
  document.querySelector("#adminTabs").classList.toggle("hidden", state.mode !== "admin");
  document.querySelectorAll(".page-tabs button").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === state.page));
  const summary = document.querySelector("#summaryText");
  const showSummary = state.mode === "front" && ["recommend", "fridge"].includes(state.page);
  summary.classList.toggle("hidden", !showSummary);
  if (showSummary) summary.innerHTML = summaryText();

  const pages = {
    recommend: renderRecommend,
    today: renderToday,
    recipes: renderRecipes,
    fridge: renderFridge,
    shopping: renderShopping,
    history: renderHistory,
    categories: renderCategories,
    ingredients: renderIngredients,
    tags: renderTags,
    recipeAdmin: renderRecipeAdmin,
    backup: renderBackup
  };
  app.innerHTML = `${pages[state.page] ? pages[state.page]() : renderRecommend()}${renderModal()}`;
  bindFormSaves();
}

function renderPageTabs() {
  const build = (pages) => pages.map((page) => `<button draggable="true" data-page="${page}" type="button" title="拖动调整排序">${pageLabels[page]}</button>`).join("");
  document.querySelector("#frontTabs").innerHTML = build(state.data.meta.frontPageOrder);
  document.querySelector("#adminTabs").innerHTML = build(state.data.meta.adminPageOrder);
  document.querySelector("#mobileFrontTabs").innerHTML = state.data.meta.frontPageOrder
    .map((page) => `<button class="${state.mode === "front" && state.page === page ? "active" : ""}" data-page="${page}" type="button">${pageLabels[page]}</button>`)
    .join("");
}

function isMobileView() {
  return window.matchMedia("(max-width: 820px)").matches;
}

function renderModal() {
  if (!state.modal) return "";
  const modal = state.modal;
  if (modal.type === "meal") {
    const recipeItem = recipeById(modal.recipeId);
    return modalShell(`
          <h2>加入今日菜品</h2>
          <p class="muted">${escapeHtml(recipeItem?.name || "")}</p>
          <div class="option-grid">
            ${Object.entries(mealLabels).map(([value, label]) => `<button class="option-card" data-action="choose-meal" data-id="${modal.recipeId}" data-meal="${value}" type="button"><strong>${label}</strong><span>${mealHint(value)}</span></button>`).join("")}
          </div>
          <div class="actions"><button class="ghost" data-action="close-modal" type="button">取消</button></div>
    `, "选择餐次");
  }
  if (modal.type === "recipeDetail") {
    const r = recipeById(modal.recipeId);
    if (!r) return "";
    return modalShell(`
          <div class="detail-cover">${imageHtml(r)}</div>
          <div class="modal-body">
            <div class="actions" style="justify-content:space-between">
              <div>
                <h2>${escapeHtml(r.name)}</h2>
                <p class="muted">${escapeHtml(r.desc)}</p>
              </div>
            </div>
            ${tagsHtml(r.tags)}
            <h3>所需食材</h3>
            <div class="chip-row">${needsHtml(r)}</div>
            <h3>制作步骤</h3>
            ${r.steps.map((s, i) => `
              <div class="step-box">
                <strong>步骤 ${i + 1}</strong>
                <p>${escapeHtml(s.content)}</p>
                <p class="muted">${formatTime(s.time)}</p>
                <div class="chip-row">${s.consumes.map((c) => {
                  const ing = ingredientById(c.ingredientId);
                  return `<span class="tag">${escapeHtml(ing?.name || "未知食材")} ${c.count}${escapeHtml(ing?.unit || "")}</span>`;
                }).join("") || `<span class="tag">不消耗食材</span>`}</div>
              </div>
            `).join("")}
          </div>
    `, "菜谱详情", "wide");
  }
  if (modal.type === "confirm") {
    return modalShell(`
          <h2>${escapeHtml(modal.title)}</h2>
          <p class="muted">${escapeHtml(modal.message)}</p>
          <div class="actions">
            <button class="danger" data-action="confirm-modal" type="button">${escapeHtml(modal.confirmText || "确认")}</button>
            <button class="ghost" data-action="close-modal" type="button">取消</button>
          </div>
    `, "确认操作", "compact");
  }
  if (modal.type === "adminAuth") {
    return modalShell(`
          <h2>后台管理验证</h2>
          <p class="muted">请输入后台管理密码。</p>
          <form id="adminAuthForm">
            <label>密码<input name="password" type="password" autocomplete="current-password" autofocus></label>
            <div class="actions" style="margin-top:14px">${saveButton("adminAuthForm", "进入后台")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "后台管理验证", "compact");
  }
  if (modal.type === "categoryForm") {
    const item = modal.id ? categoryById(modal.id) : null;
    return modalShell(`
          <h2>${item ? "编辑分类" : "新增分类"}</h2>
          <form id="categoryForm">
            <input name="id" type="hidden" value="${escapeHtml(item?.id || "")}">
            <label>分类名称<input name="name" required value="${escapeHtml(item?.name || "")}"></label>
            <div class="actions" style="margin-top:14px">${saveButton("categoryForm")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "分类表单", "compact");
  }
  if (modal.type === "tagForm") {
    const item = modal.id ? tagById(modal.id) : null;
    return modalShell(`
          <h2>${item ? "编辑标签" : "新增标签"}</h2>
          <form id="tagForm">
            <input name="id" type="hidden" value="${escapeHtml(item?.id || "")}">
            <label>标签名称<input name="name" required value="${escapeHtml(item?.name || "")}"></label>
            <div class="actions" style="margin-top:14px">${saveButton("tagForm")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "标签表单", "compact");
  }
  if (modal.type === "ingredientForm") {
    const item = modal.id ? ingredientById(modal.id) : null;
    return modalShell(`
          <h2>${item ? "编辑食材" : "新增食材"}</h2>
          <form id="ingredientForm">
            <input name="id" type="hidden" value="${escapeHtml(item?.id || "")}">
            <div class="form-grid">
              <label>名称<input name="name" required value="${escapeHtml(item?.name || "")}"></label>
              <label>分类<select name="categoryId">${categoryOptions(item?.categoryId || "")}</select></label>
              <label>库存${stepperInput("stock", item?.stock ?? 0, 1, 0)}</label>
              <label>单位<select name="unit">${units.map((unit) => `<option value="${unit}" ${unit === item?.unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
              <label>保质期<input name="expireAt" type="date" value="${escapeHtml(item?.expireAt || "")}"></label>
            </div>
            <div class="actions" style="margin-top:14px">${saveButton("ingredientForm")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "食材表单");
  }
  if (modal.type === "shoppingForm") {
    const item = modal.id ? state.data.shoppingList.find((s) => s.id === modal.id) : null;
    return modalShell(`
          <h2>${item ? "编辑购物项" : "新增购物项"}</h2>
          <form id="shoppingForm">
            <input name="id" type="hidden" value="${escapeHtml(item?.id || "")}">
            <label>食材<select name="ingredientId">${state.data.ingredients.map((i) => `<option value="${i.id}" ${i.id === item?.ingredientId ? "selected" : ""}>${escapeHtml(i.name)}（${escapeHtml(i.unit)}）</option>`).join("")}</select></label>
            <label>数量${stepperInput("count", item?.count ?? 1, 1, 1)}</label>
            <div class="actions" style="margin-top:14px">${saveButton("shoppingForm")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "购物项表单", "compact");
  }
  if (modal.type === "fridgeEdit") {
    const item = ingredientById(modal.id);
    return modalShell(`
          <h2>调整冰箱</h2>
          <p class="muted">${escapeHtml(item?.name || "")}</p>
          <form id="fridgeForm">
            <input name="id" type="hidden" value="${escapeHtml(item?.id || "")}">
            <label>库存${stepperInput("stock", item?.stock ?? 0, 1, 0)}</label>
            <label>保质期<input name="expireAt" type="date" value="${escapeHtml(item?.expireAt || "")}"></label>
            <div class="actions" style="margin-top:14px">${saveButton("fridgeForm")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "冰箱库存编辑", "compact");
  }
  if (modal.type === "fridgeAdd") {
    return modalShell(`
          <h2>加入食材</h2>
          <p class="muted">从食材管理中选择已有食材，填写本次加入数量。</p>
          <form id="fridgeAddForm">
            <label>食材<select name="ingredientId">${state.data.ingredients.map((ing) => `<option value="${ing.id}">${escapeHtml(ing.name)}（${escapeHtml(ing.unit)}，当前 ${ing.stock}${escapeHtml(ing.unit)}）</option>`).join("")}</select></label>
            <label>加入数量${stepperInput("count", 1, 1, 1)}</label>
            <label>保质期<input name="expireAt" type="date"></label>
            <div class="actions" style="margin-top:14px">${saveButton("fridgeAddForm", "加入冰箱")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "加入食材", "compact");
  }
  if (modal.type === "recipeForm") {
    const item = modal.id ? recipeById(modal.id) : null;
    return modalShell(`
          <div class="modal-body">
            <div class="actions" style="justify-content:space-between"><h2>${item ? "编辑菜谱" : "新增菜谱"}</h2><button class="ghost" data-action="close-modal" type="button">关闭</button></div>
            ${recipeForm(item)}
          </div>
    `, "菜谱表单", "wide");
  }
  if (modal.type === "warningSettings") {
    return modalShell(`
          <h2>临期预警设置</h2>
          <form id="warningForm">
            <label>提前预警天数${stepperInput("expireWarningDays", expireWarningDays(), 1, 0)}</label>
            <p class="muted">设置为 0 表示仅到期当天提示临期。</p>
            <div class="actions" style="margin-top:14px">${saveButton("warningForm")}<button class="ghost" data-action="close-modal" type="button">取消</button></div>
          </form>
    `, "临期预警设置", "compact");
  }
  return "";
}

function modalShell(content, label, size = "") {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card ${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">
        <button class="modal-close" data-action="close-modal" type="button" aria-label="关闭">×</button>
        ${content}
      </section>
    </div>
  `;
}

function saveButton(formId, label = "保存") {
  return `<button id="save_${escapeHtml(formId)}" data-save-form="${escapeHtml(formId)}" type="button">${escapeHtml(label)}</button>`;
}

function bindFormSaves() {
  app.querySelectorAll("[data-save-form]").forEach((button) => {
    button.addEventListener("click", () => runFormSave(button));
  });
}

function runFormSave(button) {
  console.debug("save button clicked", button.dataset.saveForm);
  const formId = button.dataset.saveForm;
  const scopedRoot = button.closest(".modal-card") || app;
  const safeFormId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(formId) : formId.replace(/"/g, "\\\"");
  const form = formId ? scopedRoot.querySelector(`form#${safeFormId}`) || document.getElementById(formId) : button.closest("form");
  const resolvedFormId = form?.getAttribute("id") || "";
  console.debug("save form resolved", form?.tagName || "", resolvedFormId, Boolean(form));
  if (!form || form.tagName !== "FORM") {
    showToast("表单不存在");
    return;
  }
  if (resolvedFormId === "shoppingForm" || formId === "shoppingForm") {
    button.disabled = true;
    try {
      saveShoppingFormDirect(form);
    } catch (err) {
      console.error(err);
      showToast(err.message || "购物项保存失败");
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (form.dataset.saving === "1") return;
  if (typeof form.reportValidity === "function" && !form.reportValidity()) return;
  form.dataset.saving = "1";
  button.disabled = true;
  Promise.resolve(saveFormDirect(form))
    .catch((err) => {
      console.error(err);
      showToast(err.message || "保存失败，请打开控制台查看错误");
    })
    .finally(() => {
      delete form.dataset.saving;
      button.disabled = false;
        });
}

function saveFormDirect(form) {
  if (form.getAttribute("id") === "shoppingForm") return saveShoppingFormDirect(form);
  return handleFormSubmit(form);
}

function saveShoppingFormDirect(form) {
  const id = form.querySelector("[name=id]")?.value || "";
  const ingredientId = form.querySelector("[name=ingredientId]")?.value || "";
  const countValue = form.querySelector("[name=count]")?.value || "";
  console.debug("shopping form values", { id, ingredientId, countValue, ingredients: state.data.ingredients.length });
  if (!state.data.ingredients.length) {
    showToast("请先在食材管理中新增食材");
    return;
  }
  const ing = ingredientById(ingredientId);
  if (!ing) {
    showToast("请选择食材");
    return;
  }
  const count = Math.max(1, Math.floor(Number(countValue) || 0));
  const next = {
    id: id || uid("shop"),
    ingredientId: ing.id,
    name: ing.name,
    count,
    unit: ing.unit,
    checked: false
  };
  if (id) {
    const index = state.data.shoppingList.findIndex((item) => item.id === id);
    if (index >= 0) state.data.shoppingList[index] = next;
    else state.data.shoppingList.push(next);
  } else {
    state.data.shoppingList.push(next);
  }
  console.debug("shopping saved", state.data.shoppingList.length, next);
  state.modal = null;
  state.mode = "front";
  state.page = "shopping";
  persistAndRender(id ? "已更新购物项" : "已加入购物清单");
}

function stepperInput(name, value = 0, stepValue = 1, min = 0) {
  return `
    <div class="stepper" data-step="${stepValue}" data-min="${min}">
      <button class="ghost stepper-btn" data-action="stepper-minus" type="button" aria-label="减少">-</button>
      <input name="${escapeHtml(name)}" type="number" min="${min}" step="${stepValue}" value="${escapeHtml(value)}">
      <button class="ghost stepper-btn" data-action="stepper-plus" type="button" aria-label="增加">+</button>
    </div>
  `;
}

function updateStepper(button, direction) {
  const box = button.closest(".stepper");
  const input = box?.querySelector("input");
  if (!input) return;
  const stepValue = Number(box.dataset.step) || 1;
  const min = Number(box.dataset.min) || 0;
  const current = Number(input.value);
  const base = Number.isFinite(current) ? current : min;
  const next = Math.max(min, base + stepValue * direction);
  input.value = formatStepperValue(next, stepValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function formatStepperValue(value, stepValue) {
  const decimals = String(stepValue).includes(".") ? String(stepValue).split(".")[1].length : 0;
  return decimals ? value.toFixed(decimals).replace(/\.?0+$/, "") : String(Math.round(value));
}

function mealHint(value) {
  return {
    breakfast: "适合清爽快速",
    lunch: "默认安排",
    dinner: "晚餐计划",
    snack: "加餐或夜宵"
  }[value];
}

function summaryText() {
  const canCook = state.data.recipes.filter((item) => recipeStatus(item).canCook).length;
  const expiring = state.data.ingredients.filter((item) => hasStock(item) && expireState(item) === "soon").length;
  const expired = state.data.ingredients.filter((item) => hasStock(item) && expireState(item) === "expired").length;
  const shoppingOpen = state.data.shoppingList.filter((item) => !item.checked).length;
  const lowStock = state.data.ingredients.filter((item) => Number(item.stock) <= 0).length;
  const metrics = [
    { label: "可做", value: `${canCook}/${state.data.recipes.length}`, tone: canCook ? "ok" : "bad" },
    { label: "临期", value: `${expiring}`, tone: expiring ? "warn" : "ok" },
    { label: "过期", value: `${expired}`, tone: expired ? "bad" : "ok" },
    { label: "待购买", value: `${shoppingOpen}`, tone: shoppingOpen ? "warn" : "" },
    { label: "缺库存", value: `${lowStock}`, tone: lowStock ? "bad" : "ok" }
  ];
  return metrics.map((item) => `
    <span class="metric ${item.tone}">
      <strong>${escapeHtml(item.value)}</strong>
      <em>${escapeHtml(item.label)}</em>
    </span>
  `).join("");
}

function renderRecommend() {
  const recipes = sortedRecipes(state.data.recipes.filter((item) => {
    const status = recipeStatus(item);
    if (!status.canCook && status.missing.length > 2) return false;
    if (state.filters.recommendCanCook === "yes") return status.canCook;
    return true;
  }));
  return `
    <section class="toolbar">
      ${canCookFilter("recommendCanCook", state.filters.recommendCanCook)}
    </section>
    <p class="notice">双击菜品卡片查看完整详情。</p>
    <section class="grid">
      ${recipes.map((item) => recipeCard(item, { compact: true })).join("") || `<div class="empty">还没有菜谱</div>`}
    </section>
  `;
}

function renderToday() {
  if (state.cooking) return renderCooking();
  const items = state.data.todayDishes.filter((item) => item.mealType === state.activeMeal);
  const total = state.data.todayDishes.length;
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between">
        <div>
          <h2>今日菜品</h2>
          <p class="muted">共 ${total} 道，当前查看 ${mealLabels[state.activeMeal]}</p>
        </div>
      </div>
      <div class="meal-switch" role="tablist" aria-label="餐次切换">
        ${Object.entries(mealLabels).map(([mealType, label]) => {
          const count = state.data.todayDishes.filter((item) => item.mealType === mealType).length;
          return `<button class="${state.activeMeal === mealType ? "active" : ""}" data-action="switch-meal" data-meal="${mealType}" type="button">${label}<span>${count}</span></button>`;
        }).join("")}
      </div>
    </section>
    <section class="today-grid">
      ${items.map((dish) => todayCard(dish)).join("") || `<div class="empty">这个餐次还没有菜品</div>`}
    </section>
  `;
}

function canCookFilter(filterKey, value) {
  return `
    <div class="segmented" role="radiogroup" aria-label="是否可做">
      <button class="${value ? "" : "active"}" data-action="set-can-cook-filter" data-filter-key="${filterKey}" data-value="" type="button">全部</button>
      <button class="${value === "yes" ? "active" : ""}" data-action="set-can-cook-filter" data-filter-key="${filterKey}" data-value="yes" type="button">可做</button>
    </div>
  `;
}

function todayCard(dish) {
  const recipeItem = recipeById(dish.recipeId);
  if (!recipeItem) return "";
  const status = recipeStatus(recipeItem);
  return `
    <article class="card today-card">
      ${imageHtml(recipeItem)}
      <div class="card-body">
        <h3>${escapeHtml(recipeItem.name)}</h3>
        <p><span class="tag">${mealLabels[dish.mealType]}</span> <span class="tag">${formatTime(totalTime(recipeItem))}</span> <span class="status ${status.canCook ? "ok" : "bad"}">${status.canCook ? "可制作" : "缺少食材"}</span></p>
        <p>${missingHtml(status.missing)}</p>
        <div class="actions">
          <button data-action="start-cooking" data-id="${dish.id}" type="button">开始制作</button>
          ${status.missing.length ? `<button class="ghost" data-action="add-today-missing-shopping" data-id="${dish.id}" type="button">缺食材加购物车</button>` : ""}
          <button class="danger" data-action="remove-today" data-id="${dish.id}" type="button">移除</button>
        </div>
      </div>
    </article>
  `;
}

function renderCooking() {
  const dish = state.data.todayDishes.find((item) => item.id === state.cooking.dishId);
  const recipeItem = dish && recipeById(dish.recipeId);
  if (!recipeItem) {
    state.cooking = null;
    return renderToday();
  }
  const index = state.cooking.stepIndex;
  const current = recipeItem.steps[index];
  const progress = Math.round(((index + 1) / recipeItem.steps.length) * 100);
  const consumes = current.consumes.map((c) => {
    const ing = ingredientById(c.ingredientId);
    return `<span class="tag">${escapeHtml(ing?.name || "未知食材")} ${c.count}${escapeHtml(ing?.unit || "")}</span>`;
  }).join("");
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between">
        <div>
          <h2>${escapeHtml(recipeItem.name)}</h2>
          <p class="muted">第 ${index + 1} / ${recipeItem.steps.length} 步</p>
        </div>
        <button class="ghost" data-action="stop-cooking" type="button">结束制作</button>
      </div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <h3 style="margin-top:16px">${escapeHtml(current.content)}</h3>
      <div class="chip-row">${consumes || `<span class="tag">本步骤不消耗食材</span>`}</div>
      ${current.time ? `<div class="timer">${formatClock(state.cooking.remaining)}</div><p class="muted">本步骤 ${formatTime(current.time)}</p>` : `<p class="muted">本步骤未设置耗时</p>`}
      <div class="actions">
        <button class="ghost" data-action="prev-step" type="button" ${index === 0 ? "disabled" : ""}>上一步</button>
        ${current.time ? `<button data-action="toggle-timer" type="button">${state.cooking.paused ? "继续" : "暂停"}</button>` : ""}
        ${index === recipeItem.steps.length - 1 ? `<button class="success" data-action="finish-cooking" type="button">制作完成</button>` : `<button data-action="next-step" type="button">下一步</button>`}
      </div>
    </section>
  `;
}

function formatClock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const min = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function renderRecipes() {
  const tags = state.data.tags.map((tag) => tag.name);
  const activeTag = state.filters.recipeTag;
  let list = state.data.recipes.filter((r) => {
    const keyword = state.filters.recipeSearch.trim();
    const matchKeyword = !keyword || `${r.name} ${r.desc}`.includes(keyword);
    const matchTag = !state.filters.recipeTag || r.tags.includes(state.filters.recipeTag);
    const matchDifficulty = !state.filters.recipeDifficulty || r.difficulty === state.filters.recipeDifficulty;
    const maxTime = Number(state.filters.recipeTime);
    const matchTime = !maxTime || totalTime(r) <= maxTime * 60;
    const status = recipeStatus(r);
    const matchCanCook = !state.filters.recipeCanCook || status.canCook;
    return matchKeyword && matchTag && matchDifficulty && matchTime && matchCanCook;
  });
  list = sortedRecipes(list);
  return `
    <section class="recipe-shop">
      <div class="recipe-searchbar">
        <input data-filter="recipeSearch" value="${escapeHtml(state.filters.recipeSearch)}" placeholder="搜索菜名或描述">
        <select data-filter="recipeDifficulty"><option value="">全部难度</option>${difficulties.map((d) => `<option ${d === state.filters.recipeDifficulty ? "selected" : ""}>${d}</option>`).join("")}</select>
        <select data-filter="recipeTime"><option value="">不限耗时</option><option value="15" ${state.filters.recipeTime === "15" ? "selected" : ""}>15 分钟内</option><option value="30" ${state.filters.recipeTime === "30" ? "selected" : ""}>30 分钟内</option><option value="60" ${state.filters.recipeTime === "60" ? "selected" : ""}>60 分钟内</option></select>
        ${canCookFilter("recipeCanCook", state.filters.recipeCanCook)}
      </div>
      <div class="recipe-shop-body">
        <aside class="recipe-cats" aria-label="菜谱标签">
          <button class="${activeTag ? "" : "active"}" data-action="set-recipe-tag" data-tag="" type="button">全部<span>${state.data.recipes.length}</span></button>
          ${tags.map((tag) => {
            const count = state.data.recipes.filter((r) => r.tags.includes(tag)).length;
            return `<button class="${activeTag === tag ? "active" : ""}" data-action="set-recipe-tag" data-tag="${escapeHtml(tag)}" type="button">${escapeHtml(tag)}<span>${count}</span></button>`;
          }).join("")}
        </aside>
        <section class="recipe-menu">
          ${list.map((item) => recipeMenuItem(item)).join("") || `<div class="empty">没有匹配的菜谱</div>`}
        </section>
      </div>
    </section>
  `;
}

function recipeMenuItem(recipeItem) {
  const status = recipeStatus(recipeItem);
  const inToday = state.data.todayDishes.some((item) => item.recipeId === recipeItem.id);
  return `
    <article class="recipe-menu-item" data-action="view-recipe" data-id="${recipeItem.id}" title="双击查看详情">
      ${imageHtml(recipeItem)}
      <div class="recipe-menu-main">
        <div class="recipe-menu-head">
          <h3>${escapeHtml(recipeItem.name)}</h3>
          <span class="status ${status.canCook ? "ok" : "bad"}">${status.canCook ? "可做" : `缺 ${status.missing.length}`}</span>
        </div>
        <p>${escapeHtml(recipeItem.desc || "暂无描述")}</p>
        <div class="recipe-menu-meta">
          <span>${escapeHtml(recipeItem.difficulty)}</span>
          <span>${formatTime(totalTime(recipeItem))}</span>
          ${status.expiring.length ? `<span class="warn-text">有临期</span>` : ""}
        </div>
        ${status.missing.length ? `<div class="recipe-menu-missing">${escapeHtml(status.missing.slice(0, 2).map((m) => m.name).join("、"))}${status.missing.length > 2 ? "等" : ""} 不足</div>` : ""}
        <div class="actions recipe-menu-actions">
          <button data-action="add-today" data-id="${recipeItem.id}" type="button" ${inToday ? "disabled" : ""}>${inToday ? "已加入" : "加入今日"}</button>
          ${status.missing.length ? `<button class="ghost" data-action="add-missing-shopping" data-id="${recipeItem.id}" type="button">加购物清单</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderFridge() {
  const keyword = state.filters.fridgeSearch.trim();
  const categories = state.data.categories;
  if (!state.activeFridgeCategoryId || !categories.some((cat) => cat.id === state.activeFridgeCategoryId)) {
    state.activeFridgeCategoryId = categories[0]?.id || "";
  }
  const activeCategory = categoryById(state.activeFridgeCategoryId);
  const visibleFridgeItems = state.data.ingredients.filter((ing) => hasStock(ing));
  const items = visibleFridgeItems.filter((ing) => ing.categoryId === state.activeFridgeCategoryId && (!keyword || ing.name.includes(keyword)));
  const warningItems = state.data.ingredients
    .filter((ing) => hasStock(ing) && ["soon", "expired"].includes(expireState(ing)))
    .sort((a, b) => (daysUntilExpire(a) ?? 9999) - (daysUntilExpire(b) ?? 9999));
  return `
    <section class="fridge-shop">
      <div class="fridge-searchbar">
        <input data-filter="fridgeSearch" value="${escapeHtml(state.filters.fridgeSearch)}" placeholder="搜索食材">
        <button data-action="open-fridge-add-form" type="button">加入食材</button>
        <button class="ghost" data-action="open-warning-settings" type="button">临期预警：${expireWarningDays()} 天</button>
      </div>
      <section class="panel warning-panel">
        <div class="actions" style="justify-content:space-between">
          <div>
            <h2>临期食品预警</h2>
            <p class="muted">提前 ${expireWarningDays()} 天提醒，已过期食材会优先显示。</p>
          </div>
        </div>
        <div class="warning-list">
          ${warningItems.map((ing) => `
            <article class="warning-item ${expireState(ing)}" data-action="edit-fridge" data-id="${ing.id}" title="双击修改库存和保质期">
              <strong>${escapeHtml(ing.name)}</strong>
              <span>${expireText(ing)}</span>
              <em>${ing.stock}${escapeHtml(ing.unit)}</em>
            </article>
          `).join("") || `<div class="empty">暂无临期或过期食材</div>`}
        </div>
      </section>
      <div class="fridge-shop-body">
        <aside class="fridge-cats" aria-label="冰箱分类">
          ${categories.map((cat) => {
            const count = visibleFridgeItems.filter((ing) => ing.categoryId === cat.id).length;
            return `<button class="${state.activeFridgeCategoryId === cat.id ? "active" : ""}" data-action="switch-fridge-category" data-id="${cat.id}" type="button">${escapeHtml(cat.name)}<span>${count}</span></button>`;
          }).join("") || `<span class="muted">暂无分类</span>`}
        </aside>
        <section class="fridge-menu">
          <div class="fridge-menu-head">
            <h2>${escapeHtml(activeCategory?.name || "冰箱")}</h2>
            <span>${items.length} 项</span>
          </div>
          <div class="fridge-grid">${items.map((ing) => `
            <article class="fridge-item" data-action="edit-fridge" data-id="${ing.id}" title="双击修改库存和保质期">
              <div>
                <strong>${escapeHtml(ing.name)}</strong>
                <p class="muted">${ing.stock}${escapeHtml(ing.unit)} · ${ing.expireAt ? `保质期 ${escapeHtml(ing.expireAt)}` : "未设置保质期"}</p>
              </div>
              <div class="fridge-meta">${expireBadge(ing)}</div>
            </article>
          `).join("") || `<div class="empty">这个分类暂无食材</div>`}</div>
        </section>
      </div>
    </section>
  `;
}

function renderShopping() {
  const checkedCount = state.data.shoppingList.filter((item) => item.checked).length;
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between">
        <h2>购物清单</h2>
        <div class="actions"><button data-action="open-shopping-form" type="button">新增购物项</button><button class="success" data-action="apply-shopping" type="button" ${checkedCount ? "" : "disabled"}>已购买入库${checkedCount ? ` ${checkedCount}` : ""}</button></div>
      </div>
      <div class="shopping-list">
        ${state.data.shoppingList.map((item) => `
          <article class="shopping-item ${item.checked ? "checked" : ""}">
            <label class="shopping-toggle">
              <input class="shopping-check" data-id="${item.id}" type="checkbox" ${item.checked ? "checked" : ""}>
              <span aria-hidden="true"></span>
            </label>
            <div class="shopping-main">
              <strong>${escapeHtml(item.name)}</strong>
              <em>${item.count}${escapeHtml(item.unit)}</em>
            </div>
            <div class="actions shopping-actions">
              <button class="ghost" data-action="open-shopping-form" data-id="${item.id}" type="button">编辑</button>
              <button class="danger" data-action="delete-shopping" data-id="${item.id}" type="button">删除</button>
            </div>
          </article>
        `).join("") || `<div class="empty">暂无购物项</div>`}
      </div>
    </section>
  `;
}

function renderHistory() {
  const keyword = state.filters.historySearch.trim();
  const list = state.data.cookHistory.filter((h) => !keyword || h.recipeName.includes(keyword)).slice().reverse();
  const ranking = cookRanking(list);
  const groups = list.reduce((result, item) => {
    const key = formatDateKey(item.cookedAt);
    if (!result[key]) result[key] = [];
    result[key].push(item);
    return result;
  }, {});
  return `
    <section class="toolbar"><input style="max-width:320px" data-filter="historySearch" value="${escapeHtml(state.filters.historySearch)}" placeholder="搜索历史菜名"></section>
    ${renderCookStats(ranking)}
    <section class="history-groups">
      ${Object.entries(groups).map(([date, items]) => `
        <article class="history-day">
          <header>
            <h2>${escapeHtml(date)}</h2>
            <span>${items.length} 道</span>
          </header>
          <div class="history-list">
            ${items.map((h) => `
              <div class="history-item">
                <div>
                  <strong>${escapeHtml(h.recipeName)}</strong>
                  <p class="muted">${formatTimeOfDay(h.cookedAt)}</p>
                </div>
                <button class="ghost" data-action="add-today" data-id="${h.recipeId}" type="button">再次加入</button>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("") || `<div class="empty">暂无历史</div>`}
    </section>
  `;
}

function cookRanking(list) {
  const counts = list.reduce((result, item) => {
    const name = item.recipeName || "未知菜品";
    result[name] = (result[name] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function renderCookStats(ranking) {
  if (!ranking.length) return "";
  const max = ranking[0].count || 1;
  return `
    <section class="panel cook-stats">
      <div class="actions" style="justify-content:space-between">
        <h2>做菜次数排名</h2>
        <span class="muted">共 ${ranking.reduce((sum, item) => sum + item.count, 0)} 次</span>
      </div>
      <div class="rank-list">
        ${ranking.slice(0, 8).map((item, index) => `
          <div class="rank-item">
            <span class="rank-no">${index + 1}</span>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="rank-bar"><span style="width:${Math.max(8, Math.round((item.count / max) * 100))}%"></span></div>
            <em>${item.count} 次</em>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function formatDateKey(value) {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeOfDay(value) {
  const date = new Date(value);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function renderCategories() {
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between"><h2>分类列表</h2><button data-action="open-category-form" type="button">新增分类</button></div>
      <table class="table"><thead><tr><th>名称</th><th>食材数</th><th>操作</th></tr></thead><tbody>${state.data.categories.map((cat) => `
        <tr><td>${escapeHtml(cat.name)}</td><td>${state.data.ingredients.filter((ing) => ing.categoryId === cat.id).length}</td><td><button class="ghost" data-action="open-category-form" data-id="${cat.id}" type="button">编辑</button> <button class="danger" data-action="delete-category" data-id="${cat.id}" type="button">删除</button></td></tr>
      `).join("")}</tbody></table>
    </section>
  `;
}

function renderIngredients() {
  const keyword = state.filters.ingredientAdminSearch.trim();
  const categoryId = state.filters.ingredientAdminCategory;
  const list = state.data.ingredients.filter((ing) => {
    const matchKeyword = !keyword || ing.name.includes(keyword);
    const matchCategory = !categoryId || ing.categoryId === categoryId;
    return matchKeyword && matchCategory;
  });
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between"><h2>食材列表</h2><button data-action="open-ingredient-form" type="button">新增食材</button></div>
      <div class="admin-filters">
        <input data-filter="ingredientAdminSearch" value="${escapeHtml(state.filters.ingredientAdminSearch)}" placeholder="搜索食材名称">
        <select data-filter="ingredientAdminCategory"><option value="">全部分类</option>${state.data.categories.map((cat) => `<option value="${cat.id}" ${cat.id === categoryId ? "selected" : ""}>${escapeHtml(cat.name)}</option>`).join("")}</select>
      </div>
      <table class="table"><thead><tr><th>名称</th><th>分类</th><th>库存</th><th>保质期</th><th>状态</th><th>操作</th></tr></thead><tbody>${list.map((ing) => `
        <tr>
          <td>${escapeHtml(ing.name)}</td>
          <td>${escapeHtml(categoryById(ing.categoryId)?.name || "未分类")}</td>
          <td>${ing.stock}${escapeHtml(ing.unit)}</td>
          <td>${escapeHtml(ing.expireAt || "未设置")}</td>
          <td>${expireBadge(ing)}</td>
          <td><button class="ghost" data-action="open-ingredient-form" data-id="${ing.id}" type="button">编辑</button> <button class="danger" data-action="delete-ingredient" data-id="${ing.id}" type="button">删除</button></td>
        </tr>
      `).join("") || `<tr><td colspan="6" class="muted">没有匹配的食材</td></tr>`}</tbody></table>
    </section>
  `;
}

function renderTags() {
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between"><h2>标签列表</h2><button data-action="open-tag-form" type="button">新增标签</button></div>
      <table class="table"><thead><tr><th>名称</th><th>菜谱数</th><th>操作</th></tr></thead><tbody>${state.data.tags.map((tag) => `
        <tr>
          <td>${escapeHtml(tag.name)}</td>
          <td>${state.data.recipes.filter((recipeItem) => recipeItem.tags.includes(tag.name)).length}</td>
          <td><button class="ghost" data-action="open-tag-form" data-id="${tag.id}" type="button">编辑</button> <button class="danger" data-action="delete-tag" data-id="${tag.id}" type="button">删除</button></td>
        </tr>
      `).join("") || `<tr><td colspan="3" class="muted">暂无标签</td></tr>`}</tbody></table>
    </section>
  `;
}

function categoryOptions(selected = "") {
  return state.data.categories.map((cat) => `<option value="${cat.id}" ${cat.id === selected ? "selected" : ""}>${escapeHtml(cat.name)}</option>`).join("");
}

function renderRecipeAdmin() {
  const tags = state.data.tags.map((tag) => tag.name);
  const keyword = state.filters.recipeAdminSearch.trim();
  const activeTag = state.filters.recipeAdminTag;
  const activeDifficulty = state.filters.recipeAdminDifficulty;
  const list = sortedRecipes(state.data.recipes.filter((recipeItem) => {
    const matchKeyword = !keyword || `${recipeItem.name} ${recipeItem.desc}`.includes(keyword);
    const matchTag = !activeTag || recipeItem.tags.includes(activeTag);
    const matchDifficulty = !activeDifficulty || recipeItem.difficulty === activeDifficulty;
    return matchKeyword && matchTag && matchDifficulty;
  }));
  return `
    <section class="panel">
      <div class="actions" style="justify-content:space-between"><h2>菜谱列表</h2><button data-action="open-recipe-form" type="button">新增菜谱</button></div>
      <div class="admin-filters">
        <input data-filter="recipeAdminSearch" value="${escapeHtml(state.filters.recipeAdminSearch)}" placeholder="搜索菜名或描述">
        <select data-filter="recipeAdminTag"><option value="">全部标签</option>${tags.map((tag) => `<option value="${tag}" ${tag === activeTag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}</select>
        <select data-filter="recipeAdminDifficulty"><option value="">全部难度</option>${difficulties.map((d) => `<option ${d === activeDifficulty ? "selected" : ""}>${d}</option>`).join("")}</select>
      </div>
      <div class="grid" style="margin-top:14px">${list.map((r) => recipeCard(r, { admin: true })).join("") || `<div class="empty">没有匹配的菜谱</div>`}</div>
    </section>
  `;
}

function recipeForm(recipeItem) {
  const data = recipeItem || {
    id: "",
    name: "",
    desc: "",
    image: null,
    coverColor: "#1769e0",
    tags: [],
    difficulty: "简单",
    steps: [step("", 0, [])]
  };
  const tags = state.data.tags.map((tag) => tag.name);
  return `
    <form id="recipeForm">
      <input name="id" type="hidden" value="${escapeHtml(data.id)}">
      <div class="form-grid">
        <label>菜名<input name="name" required value="${escapeHtml(data.name)}"></label>
        <label>难度<select name="difficulty">${difficulties.map((d) => `<option ${d === data.difficulty ? "selected" : ""}>${d}</option>`).join("")}</select></label>
        <label>标识颜色<input name="coverColor" type="color" value="${escapeHtml(data.coverColor)}"></label>
        <label class="full">描述<textarea name="desc">${escapeHtml(data.desc)}</textarea></label>
        <div class="full">
          <label>标签</label>
          <div class="choice-grid">
            ${tags.map((tag) => `<label class="choice-pill"><input name="tags" type="checkbox" value="${tag}" ${data.tags.includes(tag) ? "checked" : ""}>${tag}</label>`).join("") || `<span class="muted">请先在标签管理中新增标签</span>`}
          </div>
        </div>
        <label class="full">菜品图片<input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
      </div>
      <input name="imageData" type="hidden" value="${escapeHtml(JSON.stringify(data.image || null))}">
      <div class="step-box">${data.image?.url ? `<img class="recipe-image" src="${data.image.url}" alt="图片预览"><button class="danger" data-action="remove-image" type="button">删除图片</button>` : `<div class="image-placeholder">暂无图片</div>`}</div>
      <h3 style="margin-top:16px">制作步骤</h3>
      <div id="stepsEditor">
        ${data.steps.map((s, index) => stepEditor(s, index)).join("")}
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="ghost" data-action="add-step" type="button">新增步骤</button>
        ${saveButton("recipeForm", "保存菜谱")}
      </div>
    </form>
  `;
}

function stepEditor(stepItem, index) {
  return `
    <div class="step-box" data-step-index="${index}">
      <div class="actions" style="justify-content:space-between">
        <h3>步骤 ${index + 1}</h3>
        <button class="danger" data-action="remove-step" data-index="${index}" type="button">删除步骤</button>
      </div>
      <label>这个步骤要做什么<textarea name="stepContent_${index}" required>${escapeHtml(stepItem.content)}</textarea></label>
      <div class="form-grid">
        <label>步骤耗时<select name="stepTime_${index}">${timeOptions.map((item) => `<option value="${item.value}" ${Number(stepItem.time || 0) === item.value ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
      </div>
      <h4>消耗食材</h4>
      <div class="consume-list">
        ${stepItem.consumes.map((c, cIndex) => consumeEditor(c, index, cIndex)).join("") || consumeEditor({}, index, 0)}
      </div>
      <button class="ghost" data-action="add-consume" data-index="${index}" type="button">添加消耗食材</button>
    </div>
  `;
}

function consumeEditor(consume, stepIndex, consumeIndex) {
  return `
    <div class="consume-row" data-consume-index="${consumeIndex}">
      <label>食材<select name="consumeIngredient_${stepIndex}_${consumeIndex}"><option value="">不选择</option>${state.data.ingredients.map((ing) => `<option value="${ing.id}" ${ing.id === consume.ingredientId ? "selected" : ""}>${escapeHtml(ing.name)}（${escapeHtml(ing.unit)}）</option>`).join("")}</select></label>
      <label>数量${stepperInput(`consumeCount_${stepIndex}_${consumeIndex}`, consume.count || 1, 1, 1)}</label>
      <button class="danger" data-action="remove-consume" type="button">删</button>
    </div>
  `;
}

function renderBackup() {
  return `
    <section class="panel">
      <h2>数据备份与恢复</h2>
      <p class="muted">当前存储模式：${escapeHtml(state.data.meta.storageMode)}，数据版本：${escapeHtml(state.data.meta.version)}</p>
      <div class="actions">
        <button data-action="download-backup" type="button">导出 JSON</button>
        <button class="ghost" data-action="copy-backup" type="button">复制备份文本</button>
        <label class="ghost" style="padding:9px 14px;border-radius:8px;cursor:pointer">导入 JSON<input id="backupFile" type="file" accept="application/json" hidden></label>
        <button class="danger" data-action="clear-data" type="button">清空本地数据</button>
        <button class="danger" data-action="reset-demo" type="button">重置示例数据</button>
      </div>
      <label style="margin-top:14px">备份文本<textarea id="backupText" placeholder="粘贴备份 JSON"></textarea></label>
      <div class="actions" style="margin-top:12px"><button data-action="import-backup-text" type="button">从文本导入</button></div>
    </section>
  `;
}

async function addToToday(recipeId, mealType = "lunch") {
  if (state.data.todayDishes.some((item) => item.recipeId === recipeId)) {
    showToast("这道菜已经在今日菜品中");
    return;
  }
  state.data.todayDishes.push({ id: uid("today"), recipeId, mealType, status: "pending", createdAt: Date.now() });
  await saveAndRender("已加入今日菜品");
}

function askMealAndAdd(recipeId) {
  state.modal = { type: "meal", recipeId };
  render();
}

function openConfirm(title, message, onConfirm, confirmText = "确认") {
  state.modal = { type: "confirm", title, message, onConfirm, confirmText };
  render();
}

function openAdminAuth(nextPage = "categories", nextModal = null) {
  state.modal = { type: "adminAuth", nextPage, nextModal };
  render();
}

async function addMissingToShopping(recipeId) {
  const recipeItem = recipeById(recipeId);
  recipeStatus(recipeItem).missing.forEach((m) => mergeShopping(m));
  await saveAndRender("缺少食材已加入购物清单");
}

async function addTodayMissingToShopping(dishId) {
  const dish = state.data.todayDishes.find((item) => item.id === dishId);
  if (!dish) return showToast("今日菜品不存在");
  const recipeItem = recipeById(dish.recipeId);
  if (!recipeItem) return showToast("菜谱不存在");
  const missing = recipeStatus(recipeItem).missing;
  if (!missing.length) return showToast("这道菜不缺食材");
  missing.forEach((m) => mergeShopping(m));
  await saveAndRender("缺少食材已加入购物清单");
}

function mergeShopping(item) {
  const existing = state.data.shoppingList.find((s) => s.ingredientId === item.ingredientId);
  if (existing) {
    existing.count = Number(existing.count) + Number(item.count);
    existing.checked = false;
  } else {
    state.data.shoppingList.push({
      id: uid("shop"),
      ingredientId: item.ingredientId,
      name: item.name,
      count: Number(item.count),
      unit: item.unit,
      checked: false
    });
  }
}

async function saveShoppingForm(form) {
  const fd = new FormData(form);
  if (!state.data.ingredients.length) {
    showToast("请先在食材管理中新增食材");
    return;
  }
  const ing = ingredientById(fd.get("ingredientId"));
  if (!ing) {
    showToast("请选择食材");
    return;
  }
  const count = Number(fd.get("count"));
  if (!Number.isFinite(count) || count <= 0) {
    showToast("数量必须大于 0");
    return;
  }
  const id = fd.get("id");
  if (id) {
    const item = state.data.shoppingList.find((s) => s.id === id);
    if (!item) {
      showToast("购物项不存在");
      return;
    }
    item.ingredientId = ing.id;
    item.name = ing.name;
    item.count = count;
    item.unit = ing.unit;
    item.checked = false;
  } else {
    const existing = state.data.shoppingList.find((s) => s.ingredientId === ing.id);
    if (existing) {
      existing.count = Number(existing.count) + count;
      existing.name = ing.name;
      existing.unit = ing.unit;
      existing.checked = false;
    } else {
      state.data.shoppingList.push({
        id: uid("shop"),
        ingredientId: ing.id,
        name: ing.name,
        count,
        unit: ing.unit,
        checked: false
      });
    }
  }
  state.modal = null;
  state.mode = "front";
  state.page = "shopping";
  persistAndRender(id ? "已更新购物项" : "已加入购物清单");
}

async function handleFormSubmit(form) {
  if (!form) return;
  const fd = new FormData(form);
  const formId = form.getAttribute("id");
  if (formId === "adminAuthForm") {
    const password = fd.get("password")?.toString() || "";
    if (password !== String(CONFIG.adminPassword || "")) return showToast("密码错误");
    const nextPage = state.modal?.nextPage || "categories";
    const nextModal = state.modal?.nextModal || null;
    state.adminAuthed = true;
    state.mode = "admin";
    state.page = nextPage;
    state.modal = nextModal;
    render();
    return;
  }
  if (formId === "categoryForm") {
    const name = fd.get("name").toString().trim();
    if (!name) return showToast("分类名称必填");
    const id = fd.get("id");
    if (id) {
      const item = categoryById(id);
      if (!item) return showToast("分类不存在");
      item.name = name;
    } else {
      state.data.categories.push({ id: uid("cat"), name });
    }
    state.modal = null;
    persistAndRender(id ? "已更新分类" : "已新增分类");
    return;
  }
  if (formId === "tagForm") {
    const id = fd.get("id");
    const name = fd.get("name").toString().trim();
    if (!name) return showToast("标签名称必填");
    const duplicate = state.data.tags.some((item) => item.name === name && item.id !== id);
    if (duplicate) return showToast("标签名称已存在");
    if (id) {
      const item = tagById(id);
      if (!item) return showToast("标签不存在");
      const oldName = item.name;
      item.name = name;
      state.data.recipes.forEach((recipeItem) => {
        recipeItem.tags = recipeItem.tags.map((tag) => tag === oldName ? name : tag);
      });
      if (state.filters.recipeTag === oldName) state.filters.recipeTag = name;
    } else {
      state.data.tags.push(tagItem(name));
    }
    state.modal = null;
    persistAndRender(id ? "已更新标签" : "已新增标签");
    return;
  }
  if (formId === "ingredientForm") {
    const id = fd.get("id");
    const name = fd.get("name").toString().trim();
    if (!name) return showToast("食材名称必填");
    if (!fd.get("categoryId")) return showToast("请选择分类");
    const duplicate = state.data.ingredients.some((item) => item.name === name && item.id !== id);
    if (duplicate) return showToast("食材名称已存在");
    const next = {
      id: id || uid("ing"),
      name,
      categoryId: fd.get("categoryId"),
      stock: Math.max(0, Math.floor(Number(fd.get("stock")) || 0)),
      unit: fd.get("unit").toString().trim(),
      expireAt: fd.get("expireAt")
    };
    const index = state.data.ingredients.findIndex((item) => item.id === id);
    if (index >= 0) state.data.ingredients[index] = next;
    else state.data.ingredients.push(next);
    state.modal = null;
    persistAndRender(id ? "已更新食材" : "已新增食材");
    return;
  }
  if (formId === "shoppingForm") {
    await saveShoppingForm(form);
    return;
  }
  if (formId === "fridgeForm") {
    const ing = ingredientById(fd.get("id"));
    if (!ing) return showToast("食材不存在");
    ing.stock = Math.max(0, Math.floor(Number(fd.get("stock")) || 0));
    ing.expireAt = fd.get("expireAt");
    state.modal = null;
    persistAndRender("冰箱已更新");
    return;
  }
  if (formId === "fridgeAddForm") {
    const ing = ingredientById(fd.get("ingredientId"));
    if (!ing) return showToast("请选择食材");
    const count = Math.floor(Number(fd.get("count")));
    if (!Number.isFinite(count) || count <= 0) return showToast("加入数量必须大于 0");
    ing.stock = Math.max(0, Math.floor(Number(ing.stock) || 0)) + count;
    const expireAt = fd.get("expireAt");
    if (expireAt) ing.expireAt = expireAt;
    state.activeFridgeCategoryId = ing.categoryId;
    state.modal = null;
    persistAndRender("食材已加入冰箱");
    return;
  }
  if (formId === "warningForm") {
    state.data.meta.expireWarningDays = Math.max(0, Math.floor(Number(fd.get("expireWarningDays")) || 0));
    state.modal = null;
    persistAndRender("临期预警已更新");
    return;
  }
  if (formId === "recipeForm") {
    try {
      const next = parseRecipeForm(form);
      const index = state.data.recipes.findIndex((r) => r.id === next.id);
      if (index >= 0) state.data.recipes[index] = next;
      else state.data.recipes.push(next);
      state.modal = null;
      persistAndRender("菜谱已保存");
    } catch (err) {
      showToast(err.message || "保存失败");
    }
  }
}

function startCooking(dishId) {
  const dish = state.data.todayDishes.find((item) => item.id === dishId);
  const recipeItem = dish && recipeById(dish.recipeId);
  if (!recipeItem || !recipeItem.steps.length) return;
  state.cooking = { dishId, stepIndex: 0, remaining: Number(recipeItem.steps[0].time) || 0, paused: false };
  startTimer();
  render();
}

function startTimer() {
  window.clearInterval(state.timerId);
  state.timerId = window.setInterval(() => {
    if (!state.cooking || state.cooking.paused || state.cooking.remaining <= 0) return;
    state.cooking.remaining -= 1;
    render();
  }, 1000);
}

function setCookingStep(nextIndex) {
  const dish = state.data.todayDishes.find((item) => item.id === state.cooking.dishId);
  const recipeItem = recipeById(dish.recipeId);
  const bounded = Math.max(0, Math.min(nextIndex, recipeItem.steps.length - 1));
  state.cooking.stepIndex = bounded;
  state.cooking.remaining = Number(recipeItem.steps[bounded].time) || 0;
  state.cooking.paused = false;
  render();
}

async function finishCooking() {
  const dish = state.data.todayDishes.find((item) => item.id === state.cooking.dishId);
  const recipeItem = dish && recipeById(dish.recipeId);
  if (!recipeItem) return;
  const status = recipeStatus(recipeItem);
  if (!status.canCook) {
    showToast(`库存不足：${status.missing.map((m) => `${m.name}缺${m.count}${m.unit}`).join("，")}`);
    return;
  }
  recipeNeeds(recipeItem).forEach((need) => {
    const ing = ingredientById(need.ingredientId);
    ing.stock = Math.max(0, Number(ing.stock) - Number(need.count));
  });
  state.data.todayDishes = state.data.todayDishes.filter((item) => item.id !== dish.id);
  state.data.cookHistory.push({ id: uid("his"), recipeId: recipeItem.id, recipeName: recipeItem.name, cookedAt: Date.now() });
  state.cooking = null;
  window.clearInterval(state.timerId);
  await saveAndRender("制作完成，库存已扣除");
}

function parseRecipeForm(form) {
  const fd = new FormData(form);
  const id = fd.get("id") || uid("rec");
  const steps = [...form.querySelectorAll("[data-step-index]")].map((box, index) => {
    const consumes = [...box.querySelectorAll(".consume-row")].map((row) => {
      const select = row.querySelector("select");
      const input = row.querySelector("input");
      return { ingredientId: select.value, count: Number(input.value) || 0 };
    }).filter((c) => c.ingredientId && c.count > 0);
    return {
      id: uid("step"),
      content: fd.get(`stepContent_${index}`)?.toString().trim(),
      time: Number(fd.get(`stepTime_${index}`)) || 0,
      consumes
    };
  }).filter((s) => s.content);
  if (!fd.get("name")?.toString().trim()) throw new Error("菜名必填");
  if (!steps.length) throw new Error("至少需要一个制作步骤");
  const imageRaw = fd.get("imageData");
  return {
    id,
    name: fd.get("name").toString().trim(),
    desc: fd.get("desc").toString().trim(),
    image: imageRaw ? JSON.parse(imageRaw) : null,
    coverColor: fd.get("coverColor") || "#1769e0",
    tags: fd.getAll("tags").map((t) => t.toString().trim()).filter(Boolean),
    difficulty: fd.get("difficulty"),
    steps
  };
}

async function importText(text) {
  const parsed = JSON.parse(text);
  const saved = await storage.import(parsed);
  render();
  if (saved !== false) showToast("导入成功");
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  if (btn.dataset.saveForm) {
    event.preventDefault();
    event.stopPropagation();
    runFormSave(btn);
    return;
  }
  const { action, id, page, mode, index } = btn.dataset;
  if (action === "close-modal" && btn.classList.contains("modal-backdrop") && event.target !== btn) return;
  if (!action && !page && !mode && btn.id !== "resetDemoBtn") return;
  if (action === "close-modal") {
    state.modal = null;
    render();
    return;
  }
  if (action === "choose-meal") {
    const recipeId = btn.dataset.id;
    const mealType = btn.dataset.meal;
    state.modal = null;
    state.activeMeal = mealType;
    await addToToday(recipeId, mealType);
    return;
  }
  if (action === "switch-meal") {
    state.activeMeal = btn.dataset.meal;
    render();
    return;
  }
  if (action === "switch-fridge-category") {
    state.activeFridgeCategoryId = id;
    render();
    return;
  }
  if (action === "set-recipe-tag") {
    state.filters.recipeTag = btn.dataset.tag || "";
    render();
    return;
  }
  if (action === "set-can-cook-filter") {
    state.filters[btn.dataset.filterKey] = btn.dataset.value || "";
    render();
    return;
  }
  if (action === "confirm-modal") {
    const fn = state.modal?.onConfirm;
    state.modal = null;
    if (typeof fn === "function") await fn();
    return;
  }
  if (mode) {
    if (mode === "admin" && !state.adminAuthed) return openAdminAuth("categories");
    state.mode = mode;
    state.page = mode === "front" ? "recommend" : "categories";
    render();
    return;
  }
  if (page) {
    if (btn.closest("#mobileFrontTabs")) state.mode = "front";
    state.page = page;
    render();
    return;
  }
  if (action === "go-page") state.page = btn.dataset.page;
  if (action === "go-admin-recipe") {
    if (!state.adminAuthed) return openAdminAuth("recipeAdmin", { type: "recipeForm" });
    state.mode = "admin";
    state.page = "recipeAdmin";
    state.modal = { type: "recipeForm" };
  }
  if (action === "add-today") return askMealAndAdd(id);
  if (action === "add-missing-shopping") return addMissingToShopping(id);
  if (action === "add-today-missing-shopping") return addTodayMissingToShopping(id);
  if (action === "view-recipe") {
    state.modal = { type: "recipeDetail", recipeId: id };
    render();
    return;
  }
  if (action === "remove-today") {
    state.data.todayDishes = state.data.todayDishes.filter((item) => item.id !== id);
    await saveAndRender("已移除");
    return;
  }
  if (action === "start-cooking") return startCooking(id);
  if (action === "stop-cooking") {
    state.cooking = null;
    window.clearInterval(state.timerId);
    render();
    return;
  }
  if (action === "prev-step") return setCookingStep(state.cooking.stepIndex - 1);
  if (action === "next-step") return setCookingStep(state.cooking.stepIndex + 1);
  if (action === "toggle-timer") {
    state.cooking.paused = !state.cooking.paused;
    render();
    return;
  }
  if (action === "finish-cooking") return finishCooking();
  if (action === "stepper-minus" || action === "stepper-plus") return updateStepper(btn, action === "stepper-plus" ? 1 : -1);
  if (action === "edit-fridge") {
    state.modal = { type: "fridgeEdit", id };
    render();
    return;
  }
  if (action === "open-warning-settings") {
    state.modal = { type: "warningSettings" };
    render();
    return;
  }
  if (action === "open-fridge-add-form") {
    if (!state.data.ingredients.length) return showToast("请先在食材管理中新增食材");
    state.modal = { type: "fridgeAdd" };
    render();
    return;
  }
  if (action === "open-category-form") {
    state.modal = { type: "categoryForm", id: id || "" };
    render();
    return;
  }
  if (action === "open-tag-form") {
    state.modal = { type: "tagForm", id: id || "" };
    render();
    return;
  }
  if (action === "open-ingredient-form") {
    state.modal = { type: "ingredientForm", id: id || "" };
    render();
    return;
  }
  if (action === "open-shopping-form") {
    if (!state.data.ingredients.length) return showToast("请先在食材管理中新增食材");
    state.modal = { type: "shoppingForm", id: id || "" };
    render();
    return;
  }
  if (action === "open-recipe-form") {
    state.modal = { type: "recipeForm", id: id || "" };
    render();
    return;
  }
  if (action === "delete-shopping") {
    state.data.shoppingList = state.data.shoppingList.filter((item) => item.id !== id);
    await saveAndRender("已删除购物项");
    return;
  }
  if (action === "apply-shopping") {
    state.data.shoppingList.filter((item) => item.checked).forEach((item) => {
      const ing = ingredientById(item.ingredientId);
      if (ing) ing.stock = Number(ing.stock) + Number(item.count);
    });
    state.data.shoppingList = state.data.shoppingList.filter((item) => !item.checked);
    await saveAndRender("已购买食材已入库");
    return;
  }
  if (action === "delete-category") {
    if (state.data.ingredients.some((ing) => ing.categoryId === id)) return showToast("分类下还有食材，不能删除");
    state.data.categories = state.data.categories.filter((cat) => cat.id !== id);
    await saveAndRender("已删除分类");
    return;
  }
  if (action === "delete-tag") {
    const tag = tagById(id);
    if (!tag) return;
    openConfirm("删除标签", "删除后会同步从已有菜谱中移除该标签。", async () => {
      state.data.tags = state.data.tags.filter((item) => item.id !== id);
      state.data.recipes.forEach((recipeItem) => {
        recipeItem.tags = recipeItem.tags.filter((name) => name !== tag.name);
      });
      if (state.filters.recipeTag === tag.name) state.filters.recipeTag = "";
      await saveAndRender("已删除标签");
    }, "删除");
    return;
  }
  if (action === "delete-ingredient") {
    openConfirm("删除食材", "删除后会同步移除菜谱步骤中的相关消耗。", async () => {
      state.data.ingredients = state.data.ingredients.filter((ing) => ing.id !== id);
      state.data.recipes.forEach((r) => r.steps.forEach((s) => {
        s.consumes = s.consumes.filter((c) => c.ingredientId !== id);
      }));
      await saveAndRender("已删除食材");
    }, "删除");
    return;
  }
  if (action === "edit-recipe") {
    state.modal = { type: "recipeForm", id };
    render();
    return;
  }
  if (action === "new-recipe") {
    state.modal = { type: "recipeForm" };
    render();
    return;
  }
  if (action === "delete-recipe") {
    openConfirm("删除菜谱", "删除后今日菜品中的同名菜也会移除。", async () => {
      state.data.recipes = state.data.recipes.filter((r) => r.id !== id);
      state.data.todayDishes = state.data.todayDishes.filter((d) => d.recipeId !== id);
      await saveAndRender("已删除菜谱");
    }, "删除");
    return;
  }
  if (action === "add-step") {
    const editor = document.querySelector("#stepsEditor");
    const count = editor.querySelectorAll("[data-step-index]").length;
    editor.insertAdjacentHTML("beforeend", stepEditor(step("", 0, []), count));
    return;
  }
  if (action === "remove-step") {
    btn.closest(".step-box").remove();
    renumberSteps();
    return;
  }
  if (action === "add-consume") {
    const box = btn.closest(".step-box");
    const stepIndex = box.dataset.stepIndex;
    const list = box.querySelector(".consume-list");
    const count = list.querySelectorAll(".consume-row").length;
    list.insertAdjacentHTML("beforeend", consumeEditor({}, stepIndex, count));
    return;
  }
  if (action === "remove-consume") {
    btn.closest(".consume-row").remove();
    return;
  }
  if (action === "remove-image") {
    document.querySelector("[name=imageData]").value = "null";
    btn.closest(".step-box").innerHTML = `<div class="image-placeholder">暂无图片</div>`;
    return;
  }
  if (action === "download-backup") {
    const blob = new Blob([storage.export()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `做菜备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (action === "copy-backup") {
    navigator.clipboard.writeText(storage.export()).then(() => showToast("备份文本已复制"));
    return;
  }
  if (action === "import-backup-text") {
    try {
      await importText(document.querySelector("#backupText").value);
    } catch (err) {
      showToast(err.message || "导入失败");
    }
    return;
  }
  if (action === "clear-data") {
    openConfirm("清空本地数据", "清空后当前分类、食材、菜谱、历史都会移除。", async () => {
      storage.clear();
      state.data = createEmptyData();
      const saved = await storage.save(state.data);
      render();
      if (saved !== false) showToast("本地数据已清空");
    }, "清空");
    return;
  }
  if (action === "reset-demo" || btn.id === "resetDemoBtn") {
    openConfirm("重置示例数据", "当前数据会被示例数据覆盖。", async () => {
      const saved = await storage.reset();
      render();
      if (saved !== false) showToast("示例数据已重置");
    }, "重置");
    return;
  }
}, true);

document.addEventListener("dblclick", (event) => {
  const recipe = event.target.closest(".card[data-action='view-recipe'], .recipe-menu-item[data-action='view-recipe']");
  if (recipe && !event.target.closest("button")) {
    state.modal = { type: "recipeDetail", recipeId: recipe.dataset.id };
    render();
    return;
  }
  const item = event.target.closest(".fridge-item[data-action='edit-fridge'], .warning-item[data-action='edit-fridge']");
  if (!item) return;
  state.modal = { type: "fridgeEdit", id: item.dataset.id };
  render();
});

let draggedPage = null;

document.addEventListener("dragstart", (event) => {
  const btn = event.target.closest(".page-tabs button[data-page]");
  if (!btn) return;
  draggedPage = btn.dataset.page;
  btn.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedPage);
});

document.addEventListener("dragend", (event) => {
  const btn = event.target.closest(".page-tabs button[data-page]");
  if (btn) btn.classList.remove("dragging");
  draggedPage = null;
});

document.addEventListener("dragover", (event) => {
  const btn = event.target.closest(".page-tabs button[data-page]");
  if (!btn || !draggedPage || btn.dataset.page === draggedPage) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});

document.addEventListener("drop", async (event) => {
  const btn = event.target.closest(".page-tabs button[data-page]");
  if (!btn || !draggedPage || btn.dataset.page === draggedPage) return;
  event.preventDefault();
  const key = btn.closest("#adminTabs") ? "adminPageOrder" : "frontPageOrder";
  const order = [...state.data.meta[key]];
  const from = order.indexOf(draggedPage);
  const to = order.indexOf(btn.dataset.page);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedPage);
  state.data.meta[key] = order;
  const saved = await storage.save(state.data);
  render();
  if (saved !== false) showToast("页面排序已保存");
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.dataset.filter) {
    const key = target.dataset.filter;
    state.filters[key] = target.type === "checkbox" ? target.checked : target.value;
    scheduleFilterRender(target);
    return;
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.classList.contains("shopping-check")) {
    const item = state.data.shoppingList.find((s) => s.id === target.dataset.id);
    if (!item) return;
    item.checked = target.checked;
    await saveAndRender();
    return;
  }
  if (target.name === "imageFile" && target.files[0]) {
    const file = target.files[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return showToast("只支持 JPG、PNG、WebP");
    if (file.size > MAX_IMAGE_SIZE) return showToast("图片不能超过 2MB");
    const reader = new FileReader();
    reader.onload = async () => {
      const image = { id: uid("img"), name: file.name, mimeType: file.type, storageType: "local", url: reader.result };
      document.querySelector("[name=imageData]").value = JSON.stringify(image);
      target.closest("form").querySelector(".step-box").innerHTML = `<img class="recipe-image" src="${reader.result}" alt="图片预览"><button class="danger" data-action="remove-image" type="button">删除图片</button>`;
    };
    reader.readAsDataURL(file);
  }
  if (target.id === "backupFile" && target.files[0]) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await importText(reader.result);
      } catch (err) {
        showToast(err.message || "导入失败");
      }
    };
    reader.readAsText(target.files[0]);
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form || form.dataset.saving === "1") return;
  if (typeof form.reportValidity === "function" && !form.reportValidity()) return;
  form.dataset.saving = "1";
  try {
    await saveFormDirect(form);
  } catch (err) {
    console.error(err);
    showToast(err.message || "保存失败，请打开控制台查看错误");
  } finally {
    delete form.dataset.saving;
  }
});

function renumberSteps() {
  document.querySelectorAll("#stepsEditor > .step-box").forEach((box, index) => {
    box.dataset.stepIndex = index;
    box.querySelector("h3").textContent = `步骤 ${index + 1}`;
    box.querySelector("textarea").name = `stepContent_${index}`;
    box.querySelector("select[name^=stepTime_]").name = `stepTime_${index}`;
    box.querySelectorAll(".consume-row").forEach((row, cIndex) => {
      row.querySelector("select").name = `consumeIngredient_${index}_${cIndex}`;
      row.querySelector("input").name = `consumeCount_${index}_${cIndex}`;
    });
    const add = box.querySelector("[data-action=add-consume]");
    if (add) add.dataset.index = index;
  });
}

async function bootstrap() {
  state.data = await storage.load();
  render();
}

bootstrap();
