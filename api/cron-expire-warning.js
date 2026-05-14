const { query } = require("./_lib/db");
const { handleError, methodNotAllowed, sendJson } = require("./_lib/http");

const MS_PER_DAY = 86400000;

function settingValue(settings, key, fallback) {
  const row = settings.rows.find((item) => item.key === key);
  return row ? row.value : fallback;
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function dateText(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function daysUntilExpire(expireAt) {
  if (!expireAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expire = new Date(expireAt);
  expire.setHours(0, 0, 0, 0);
  return Math.ceil((expire - today) / MS_PER_DAY);
}

function expireText(days) {
  if (days === null) return "未设置";
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  return `临期 ${days} 天`;
}

function emailBody(items) {
  return items.map((item) => (
    `${item.name}：${expireText(item.days)}，库存 ${item.stock}${item.unit || ""}，保质期 ${item.expireAt}`
  )).join("\n");
}

function parseEmailRecipients(value) {
  return String(value || "")
    .split(/[\s,;，；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emailConfig() {
  return {
    serviceId: process.env.EMAILJS_SERVICE_ID || "service_vqns7od",
    templateId: process.env.EMAILJS_TEMPLATE_ID || "template_6l87u93",
    publicKey: process.env.EMAILJS_PUBLIC_KEY || "TwCRrKD7ZF6bNrHuE"
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

async function sendEmail(items, recipient, warningDays) {
  const cfg = emailConfig();
  if (!cfg.serviceId || !cfg.templateId || !cfg.publicKey) {
    throw new Error("EmailJS server config is incomplete");
  }
  const body = emailBody(items);
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: cfg.serviceId,
      template_id: cfg.templateId,
      user_id: cfg.publicKey,
      template_params: {
        to_email: recipient,
        email: recipient,
        recipient,
        to_name: "做菜助手用户",
        reply_to: recipient,
        title: `做菜助手预警邮件：${items.length} 个食材需要关注`,
        subject: `做菜助手食材到期预警（${items.length} 项）`,
        warning_days: warningDays,
        item_count: items.length,
        items_text: body,
        message: body,
        sent_at: new Date().toLocaleString("zh-CN", { hour12: false })
      }
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `EmailJS status ${response.status}`);
  }
}

module.exports = async function handler(req, res) {
  try {
    if (!["GET", "POST"].includes(req.method)) {
      methodNotAllowed(res, ["GET", "POST"]);
      return;
    }

    const settings = await query("select key, value from app_settings");
    const warningDays = Math.max(0, Number(settingValue(settings, "expireWarningDays", 3)) || 0);
    const emailWarning = {
      enabled: false,
      recipient: "",
      autoSend: false,
      lastSentDate: "",
      lastError: "",
      lastTestAt: "",
      ...settingValue(settings, "emailWarning", {})
    };

    const recipients = parseEmailRecipients(emailWarning.recipient);
    if (!emailWarning.enabled || !emailWarning.autoSend || !recipients.length) {
      sendJson(res, 200, { ok: true, skipped: "email warning is not enabled" });
      return;
    }

    const today = todayText();
    if (emailWarning.lastSentDate === today) {
      sendJson(res, 200, { ok: true, skipped: "already sent today" });
      return;
    }

    const ingredients = await query(
      "select name, stock, unit, expire_at from app_ingredients where stock > 0 and expire_at is not null"
    );
    const items = ingredients.rows
      .map((row) => {
        const days = daysUntilExpire(row.expire_at);
        return {
          name: row.name,
          stock: Number(row.stock) || 0,
          unit: row.unit || "",
          expireAt: dateText(row.expire_at),
          days
        };
      })
      .filter((item) => item.days !== null && item.days <= warningDays)
      .sort((a, b) => a.days - b.days);

    if (!items.length) {
      sendJson(res, 200, { ok: true, skipped: "no warning items" });
      return;
    }

    for (const recipient of recipients) {
      await sendEmail(items, recipient, warningDays);
    }
    await upsertSetting("emailWarning", {
      ...emailWarning,
      lastError: "",
      lastSentDate: today
    });
    sendJson(res, 200, { ok: true, sent: items.length, recipients: recipients.length });
  } catch (error) {
    try {
      const settings = await query("select key, value from app_settings");
      const emailWarning = {
        ...settingValue(settings, "emailWarning", {}),
        lastError: error.message || "cron email failed"
      };
      await upsertSetting("emailWarning", emailWarning);
    } catch (innerError) {
      console.error(innerError);
    }
    handleError(res, error);
  }
};
