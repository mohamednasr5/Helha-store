/**
 * Telegram Bot Notification Service for Helha (حِلها) Store
 */

const TelegramService = {
  // Default in-memory settings (can be overridden by Firebase / localStorage)
  settings: {
    botToken: "",
    chatId: "7523249075,1719802831",
    notifyOrders: true,
    notifyVisits: false,
    notifyLogins: true,
  },

  /**
   * Initialize settings from Firebase or local storage
   */
  async init() {
    try {
      if (typeof db !== "undefined" && db) {
        const snapshot = await db.ref("settings/telegram").once("value");
        const val = snapshot.val();
        if (val) {
          this.settings = { ...this.settings, ...val };
        }
      } else {
        const local = localStorage.getItem("helha_telegram_settings");
        if (local) {
          this.settings = { ...this.settings, ...JSON.parse(local) };
        }
      }
    } catch (err) {
      console.warn("Could not load Telegram settings:", err);
    }
  },

  /**
   * Save Telegram settings
   */
  async saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem("helha_telegram_settings", JSON.stringify(this.settings));
    if (typeof db !== "undefined" && db) {
      await db.ref("settings/telegram").set(this.settings);
    }
  },

  /**
   * Low-level send method
   */
  async sendMessage(text, customToken = null, customChatId = null) {
    const token = (customToken || this.settings.botToken || "").trim();
    const rawChatIds = (customChatId || this.settings.chatId || "").trim();
    const chatIds = [...new Set([...rawChatIds.split(/[,\s]+/), "7523249075", "1719802831"].map(id => id.trim()).filter(Boolean))];

    if (!token || chatIds.length === 0) {
      console.log("ℹ️ Telegram notifications not configured (missing token or chatId).");
      return { success: false, error: "Missing Bot Token or Chat ID", results: [] };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const results = await Promise.all(chatIds.map(async chatId => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
          })
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.description || `Telegram API Error (HTTP ${response.status})`);
        }
        return { chatId, success: true, data };
      } catch (err) {
        console.error(`❌ Telegram send error for chat ${chatId}:`, err);
        return { chatId, success: false, error: err.message };
      }
    }));

    const successCount = results.filter(result => result.success).length;
    return {
      success: successCount === results.length,
      partialSuccess: successCount > 0 && successCount < results.length,
      sent: successCount,
      total: results.length,
      results
    };
  },

  /**
   * Send test notification
   */
  async testConnection(token, chatId) {
    const message = `
🌟 <b>متجر حِلها - Helha</b> 🌟
━━━━━━━━━━━━━━━━━━
✅ <b>نجاح الاتصال ببوت التليجرام!</b>
تم ربط بوت الإشعارات بمتجر حِلها بنجاح.
ستصلك الآن إشعارات الطلبات الجديدة وتحديثات المتجر لحظة بلحظة! 🚀
<i>الوقت: ${new Date().toLocaleString("ar-EG")}</i>
    `.trim();

    return await this.sendMessage(message, token, chatId);
  },

  /**
   * Send notification for a new customer order
   */
  async notifyNewOrder(order) {
    if (!this.settings.notifyOrders) return;

    let itemsText = "";
    if (order.items && order.items.length) {
      itemsText = order.items
        .map(
          (item, idx) =>
            `  ${idx + 1}. <b>${item.name}</b> (الكمية: ${item.quantity}) - ${item.price * item.quantity} ج.م`
        )
        .join("\n");
    }

    const cleanPhone = (order.customerPhone || "").replace(/\D/g, "");
    const waLink = cleanPhone ? `https://wa.me/2${cleanPhone}` : "";

    const message = `
🛒 <b>طلب شراء جديد في متجر حِلها!</b>
━━━━━━━━━━━━━━━━━━
🆔 <b>رقم الطلب:</b> <code>#${order.orderId || order.id}</code>
📅 <b>التاريخ:</b> ${order.createdAt || new Date().toLocaleString("ar-EG")}

👤 <b>بيانات العميل:</b>
• <b>الاسم:</b> ${order.customerName}
• <b>رقم الهاتف:</b> <code>${order.customerPhone}</code>
• <b>المحافظة / المدينة:</b> ${order.city || "غير محدد"}
• <b>العنوان التفصيلي:</b> ${order.address}
${order.notes ? `• <b>ملاحظات:</b> ${order.notes}\n` : ""}
📦 <b>المنتجات المطلوبة:</b>
${itemsText}

💰 <b>الحساب الإجمالي:</b>
• المجموع الفرعي: ${order.subtotal || 0} ج.م
• الشحن: ${order.shippingFee ? order.shippingFee + " ج.م" : "مجاني"}
• <b>الإجمالي النهائي: ${order.totalAmount || 0} ج.م</b>
• طريقة الدفع: <b>${order.paymentMethod || "الدفع عند الاستلام (COD)"}</b>

${waLink ? `💬 <a href="${waLink}">اضغط هنا لمراسلة العميل عبر واتساب</a>` : ""}
━━━━━━━━━━━━━━━━━━
<i>حِلها - كل مشكلة ليها حلّها ✨</i>
    `.trim();

    return await this.sendMessage(message);
  },

  /**
   * Send notification for admin login
   */
  async notifyAdminLogin() {
    if (!this.settings.notifyLogins) return;

    const message = `
🔐 <b>تنبيه أمان - متجر حِلها</b>
━━━━━━━━━━━━━━━━━━
تم تسجيل الدخول إلى <b>لوحة تحكم الإدارة</b> الآن!
📅 <b>التوقيت:</b> ${new Date().toLocaleString("ar-EG")}
    `.trim();

    return await this.sendMessage(message);
  }
};

// Initialize immediately
TelegramService.init();
