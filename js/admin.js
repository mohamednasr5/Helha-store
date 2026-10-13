/**
 * Helha (حِلها) Admin Dashboard Logic
 * Full control over products, orders, Telegram bot, analytics, and settings
 */

const AdminState = {
  products: [],
  orders: [],
  analytics: {},
  settings: {},
  currentOrderFilter: "all",
  editingProductId: null,
  workerUrl: "https://spyone.nonm1724.workers.dev",
  r2PublicUrl: "https://pub-a9759aa27af1490f9ac3ee12ed967379.r2.dev"
};

// Default admin password SHA-256 hash
const DEFAULT_PASS_HASH = "64533647a5d1df6de07cdc1a3a51f4c0fcbb35fffd51b5c38f32c949e24a210c";

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth();
  setupAdminNavigation();
  setupImageUploadHandler();
  setupSettingsHandlers();
});

/**
 * 1. Admin Authentication & Session Security
 */
async function checkAdminAuth() {
  const isAuth = sessionStorage.getItem("helha_admin_auth");
  const loginScreen = document.getElementById("login-screen");

  if (isAuth === "true") {
    if (loginScreen) loginScreen.style.display = "none";
    initDashboard();
  } else {
    if (loginScreen) loginScreen.style.display = "flex";
  }

  // Bind login form
  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleAdminLogin);
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const passInput = document.getElementById("admin-pass-input");
  const errorMsg = document.getElementById("login-error-msg");
  const submitBtn = document.getElementById("btn-login-submit");

  const enteredPass = passInput.value.trim();
  if (!enteredPass) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "جاري التحقق...";

  try {
    const enteredHash = await hashPassword(enteredPass);
    let storedHash = null;

    if (typeof db !== "undefined" && db) {
      const snap = await db.ref("settings/adminPassword").once("value");
      storedHash = snap.val();
      if (!storedHash) {
        // If not set yet in Firebase, set default hash
        storedHash = DEFAULT_PASS_HASH;
        await db.ref("settings/adminPassword").set(storedHash);
      }
    } else {
      // Offline fallback
      storedHash = DEFAULT_PASS_HASH;
    }

    if (enteredHash === storedHash) {
      sessionStorage.setItem("helha_admin_auth", "true");
      document.getElementById("login-screen").style.display = "none";
      if (errorMsg) errorMsg.style.display = "none";
      
      // Notify Telegram of successful login
      TelegramService.notifyAdminLogin();
      
      initDashboard();
    } else {
      if (errorMsg) {
        errorMsg.textContent = "كلمة المرور غير صحيحة، يرجى المحاولة ثانية.";
        errorMsg.style.display = "block";
      }
    }
  } catch (err) {
    console.error("Login verification error:", err);
    if (errorMsg) {
      errorMsg.textContent = "حدث خطأ أثناء التحقق: " + err.message;
      errorMsg.style.display = "block";
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "تسجيل الدخول إلى لوحة التحكم";
  }
}

function adminLogout() {
  sessionStorage.removeItem("helha_admin_auth");
  window.location.reload();
}

/**
 * 2. Initialize Dashboard Data Listeners
 */
function initDashboard() {
  if (typeof db === "undefined" || !db) {
    console.warn("Firebase not active in admin");
    return;
  }

  // 1. Sync Products
  db.ref("products").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      AdminState.products = Object.keys(data).map(key => ({
        ...data[key],
        firebaseKey: key,
        id: data[key].id || key
      }));
    } else {
      AdminState.products = [];
    }
    renderAdminProducts();
    updateDashboardStats();
  });

  // 2. Sync Orders
  db.ref("orders").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      AdminState.orders = Object.keys(data)
        .map(key => ({ ...data[key], firebaseKey: key }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else {
      AdminState.orders = [];
    }
    renderAdminOrders();
    updateDashboardStats();
  });

  // 3. Sync Analytics
  db.ref("analytics").on("value", (snap) => {
    AdminState.analytics = snap.val() || {};
    updateDashboardStats();
  });

  // 4. Load Settings
  loadAdminSettings();
  loadBannerSettings();
}

/**
 * 3. Update Top Stats Cards
 */
function updateDashboardStats() {
  const totalOrdersEl = document.getElementById("stat-total-orders");
  const totalRevenueEl = document.getElementById("stat-total-revenue");
  const totalVisitsEl = document.getElementById("stat-total-visits");
  const totalProductsEl = document.getElementById("stat-total-products");

  const totalOrders = AdminState.orders.length;
  const activeOrdersRevenue = AdminState.orders
    .filter(o => o.status !== "cancelled")
    .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
  const visits = AdminState.analytics.totalVisits || 0;
  const prodsCount = AdminState.products.length;

  if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
  if (totalRevenueEl) totalRevenueEl.textContent = `${activeOrdersRevenue.toLocaleString("ar-EG")} ج.م`;
  if (totalVisitsEl) totalVisitsEl.textContent = visits.toLocaleString("ar-EG");
  if (totalProductsEl) totalProductsEl.textContent = prodsCount;

  // Render recent orders on overview tab
  renderOverviewRecentOrders();
}

function renderOverviewRecentOrders() {
  const tbody = document.getElementById("overview-recent-orders-tbody");
  if (!tbody) return;

  const recent = AdminState.orders.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد طلبات واردة حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(o => `
    <tr>
      <td><strong>#${o.orderId || o.id}</strong></td>
      <td>${o.createdAt || "-"}</td>
      <td>${o.customerName || "-"}</td>
      <td>${o.customerPhone || "-"}</td>
      <td><strong>${o.totalAmount || 0} ج.م</strong></td>
      <td><span class="status-badge status-${o.status || 'new'}">${getOrderStatusArabic(o.status)}</span></td>
    </tr>
  `).join("");
}

/**
 * 4. Products Management (CRUD)
 */
function filterAdminProducts(cat) {
  AdminState.currentProductCategoryFilter = cat;
  document.querySelectorAll(".admin-prod-cat-btn").forEach(btn => {
    if (btn.getAttribute("data-cat") === cat) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderAdminProducts();
}

function renderAdminProducts() {
  const tbody = document.getElementById("admin-products-tbody");
  if (!tbody) return;

  const filter = AdminState.currentProductCategoryFilter || "all";
  const prods = AdminState.products.filter(p => {
    if (filter === "all") return true;
    return p.category === filter;
  });

  if (prods.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
          ${filter === "all" ? "لا يوجد منتجات حالياً. أضف منتجك الأول أو قم باستعادة المنتجات التجريبية." : "لا توجد منتجات مسجلة في هذا القسم حالياً."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = prods.map(p => `
    <tr>
      <td>
        <img src="${p.image || 'assets/logo.jpg'}" alt="${p.name}" class="prod-thumb-sm" onerror="this.src='assets/logo.jpg'">
      </td>
      <td>
        <strong>${p.name}</strong>
        ${p.isDemo ? `<span style="font-size:0.7rem; background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; margin-right:4px;">تجريبي</span>` : ""}
        ${p.badge ? `<span style="font-size:0.7rem; background:#eff6ff; color:#2563eb; padding:2px 6px; border-radius:4px; margin-right:4px;">${p.badge}</span>` : ""}
        <div style="font-size:0.8rem; color:var(--text-muted);">${p.subtitle || ""}</div>
      </td>
      <td>
        ${p.category === 'deals' ? `<span style="background:#fef2f2; color:#ef4444; font-weight:700; padding:3px 8px; border-radius:6px; font-size:0.82rem;">🔥 عروض التوفير</span>` : (p.categoryName || getCategoryArabicName(p.category))}
      </td>
      <td><strong>${p.price} ج.م</strong> ${p.originalPrice ? `<span style="text-decoration:line-through; font-size:0.8rem; color:var(--text-muted);">${p.originalPrice}</span>` : ""}</td>
      <td>${p.stockCount || 50} قطعة</td>
      <td>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-admin-action" style="background:#e0f2fe; color:#0284c7; padding:4px 8px;" onclick="openEditProductModal('${p.id}')">✏️ تعديل</button>
          <button class="btn-admin-action" style="background:#fee2e2; color:#b91c1c; padding:4px 8px;" onclick="deleteProduct('${p.id}')">🗑️ حذف</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function getCategoryArabicName(cat) {
  switch (cat) {
    case "kitchen": return "حلول المطبخ";
    case "cleaning": return "أدوات التنظيف";
    case "home": return "حلول منزلية";
    case "deals": return "عروض التوفير";
    default: return "أدوات ذكية";
  }
}

function openAddProductModal() {
  AdminState.editingProductId = null;
  document.getElementById("product-modal-title").textContent = "إضافة منتج جديد لحِلها";
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-subtitle").value = "";
  document.getElementById("prod-category").value = "kitchen";
  document.getElementById("prod-price").value = "";
  document.getElementById("prod-original-price").value = "";
  document.getElementById("prod-badge").value = "";
  document.getElementById("prod-stock").value = "50";
  document.getElementById("prod-desc").value = "";
  document.getElementById("prod-features").value = "";
  document.getElementById("prod-image-url").value = "";
  
  const preview = document.getElementById("prod-upload-preview");
  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }

  document.getElementById("product-modal").classList.add("active");
}

function openEditProductModal(productId) {
  const prod = AdminState.products.find(p => String(p.id) === String(productId));
  if (!prod) return;

  AdminState.editingProductId = prod.id;
  document.getElementById("product-modal-title").textContent = "تعديل المنتج: " + prod.name;
  document.getElementById("prod-name").value = prod.name || "";
  document.getElementById("prod-subtitle").value = prod.subtitle || "";
  document.getElementById("prod-category").value = prod.category || "kitchen";
  document.getElementById("prod-price").value = prod.price || "";
  document.getElementById("prod-original-price").value = prod.originalPrice || "";
  document.getElementById("prod-badge").value = prod.badge || "";
  document.getElementById("prod-stock").value = prod.stockCount || "50";
  document.getElementById("prod-desc").value = prod.description || "";
  document.getElementById("prod-features").value = (prod.features || []).join("\n");
  document.getElementById("prod-image-url").value = prod.image || "";

  const preview = document.getElementById("prod-upload-preview");
  if (preview && prod.image) {
    preview.src = prod.image;
    preview.style.display = "inline-block";
  }

  document.getElementById("product-modal").classList.add("active");
}

function closeProductModal() {
  document.getElementById("product-modal").classList.remove("active");
}

async function handleSaveProduct(e) {
  e.preventDefault();

  const name = document.getElementById("prod-name").value.trim();
  const subtitle = document.getElementById("prod-subtitle").value.trim();
  const category = document.getElementById("prod-category").value;
  const price = Number(document.getElementById("prod-price").value);
  const originalPrice = Number(document.getElementById("prod-original-price").value) || null;
  const badge = document.getElementById("prod-badge").value.trim();
  const stockCount = Number(document.getElementById("prod-stock").value) || 50;
  const description = document.getElementById("prod-desc").value.trim();
  const featuresText = document.getElementById("prod-features").value.trim();
  const imageUrl = document.getElementById("prod-image-url").value.trim();

  if (!name || isNaN(price)) {
    alert("يرجى إدخال اسم المنتج والسعر على الأقل!");
    return;
  }

  const features = featuresText
    ? featuresText.split("\n").map(f => f.trim()).filter(Boolean)
    : [];

  const id = AdminState.editingProductId || `prod_${Date.now()}`;

  const productData = {
    id: id,
    name: name,
    subtitle: subtitle,
    category: category,
    categoryName: getCategoryArabicName(category),
    price: price,
    originalPrice: originalPrice,
    badge: badge,
    stockCount: stockCount,
    description: description,
    features: features,
    image: imageUrl || "assets/logo.jpg",
    isDemo: false,
    updatedAt: new Date().toISOString()
  };

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`products/${id}`).set(productData);
      showAdminToast("تم حفظ المنتج بنجاح في قاعدة البيانات ✅");
    }
    closeProductModal();
  } catch (err) {
    console.error("Save product error:", err);
    alert("خطأ أثناء حفظ المنتج: " + err.message);
  }
}

async function deleteProduct(productId) {
  if (!confirm("هل أنت متأكد من حذف هذا المنتج نهائياً؟")) return;

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`products/${productId}`).remove();
      showAdminToast("تم حذف المنتج بنجاح 🗑️");
    }
  } catch (err) {
    alert("خطأ أثناء الحذف: " + err.message);
  }
}

/**
 * Delete All Demo Products
 */
async function deleteAllDemoProducts() {
  const demoProds = AdminState.products.filter(p => p.isDemo === true);
  if (demoProds.length === 0) {
    alert("لا توجد منتجات تجريبية حالياً لحذفها.");
    return;
  }

  if (!confirm(`سيتم حذف جميع المنتجات التجريبية (${demoProds.length} منتجات). هل أنت متأكد؟`)) {
    return;
  }

  try {
    const updates = {};
    demoProds.forEach(p => {
      updates[`products/${p.id}`] = null;
    });
    if (typeof db !== "undefined" && db) {
      await db.ref().update(updates);
      showAdminToast(`تم مسح ${demoProds.length} منتجات تجريبية بنجاح 🗑️`);
    }
  } catch (err) {
    alert("خطأ أثناء مسح المنتجات التجريبية: " + err.message);
  }
}

/**
 * Restore Demo Products
 */
async function restoreDemoProducts() {
  if (!confirm("هل تريد استعادة المنتجات التجريبية الافتراضية؟")) return;

  try {
    const updates = {};
    DEMO_PRODUCTS.forEach(p => {
      updates[`products/${p.id}`] = p;
    });
    if (typeof db !== "undefined" && db) {
      await db.ref().update(updates);
      showAdminToast("تمت استعادة المنتجات التجريبية بنجاح 🌟");
    }
  } catch (err) {
    alert("خطأ أثناء الاستعادة: " + err.message);
  }
}

/**
 * 5. Orders Management
 */
function renderAdminOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  if (!tbody) return;

  const filtered = AdminState.orders.filter(o => {
    if (AdminState.currentOrderFilter === "all") return true;
    return o.status === AdminState.currentOrderFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">لا توجد طلبات مطابقة</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const cleanPhone = (o.customerPhone || "").replace(/\D/g, "");
    const waLink = cleanPhone ? `https://wa.me/2${cleanPhone}` : "#";

    return `
      <tr>
        <td><strong>#${o.orderId || o.id}</strong></td>
        <td>${o.createdAt || "-"}</td>
        <td>
          <strong>${o.customerName || "-"}</strong>
          <div style="font-size:0.8rem; color:var(--text-muted);">${o.city || ""}</div>
        </td>
        <td>
          <a href="${waLink}" target="_blank" style="color:#16a34a; font-weight:700;" title="مراسلة عبر واتساب">
            💬 ${o.customerPhone || "-"}
          </a>
        </td>
        <td><strong>${o.totalAmount || 0} ج.م</strong></td>
        <td>
          <select onchange="updateOrderStatus('${o.orderId || o.id}', this.value)" style="padding:4px 8px; border-radius:6px; font-weight:700; border:1px solid var(--border-color);">
            <option value="new" ${o.status === "new" ? "selected" : ""}>جديد 🔵</option>
            <option value="processing" ${o.status === "processing" ? "selected" : ""}>قيد التجهيز 🟡</option>
            <option value="shipped" ${o.status === "shipped" ? "selected" : ""}>تم الشحن 🚚</option>
            <option value="completed" ${o.status === "completed" ? "selected" : ""}>مكتمل ومستلم 🟢</option>
            <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>ملغي 🔴</option>
          </select>
        </td>
        <td>
          <button class="btn-admin-action" style="background:#e0f2fe; color:#0284c7; padding:4px 8px;" onclick="viewOrderDetails('${o.orderId || o.id}')">👁️ عرض التفاصيل</button>
        </td>
      </tr>
    `;
  }).join("");
}

function getOrderStatusArabic(status) {
  switch (status) {
    case "new": return "جديد";
    case "processing": return "قيد التجهيز";
    case "shipped": return "تم الشحن";
    case "completed": return "مكتمل";
    case "cancelled": return "ملغي";
    default: return status || "جديد";
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`orders/${orderId}/status`).set(newStatus);
      showAdminToast(`تم تغيير حالة الطلب #${orderId} إلى "${getOrderStatusArabic(newStatus)}" ✅`);
    }
  } catch (err) {
    alert("خطأ أثناء تحديث حالة الطلب: " + err.message);
  }
}

function viewOrderDetails(orderId) {
  const order = AdminState.orders.find(o => String(o.orderId || o.id) === String(orderId));
  if (!order) return;

  const modal = document.getElementById("order-details-modal");
  const body = document.getElementById("order-details-modal-body");

  const cleanPhone = (order.customerPhone || "").replace(/\D/g, "");
  const waLink = cleanPhone ? `https://wa.me/2${cleanPhone}` : "#";

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
      <h3 style="color:var(--admin-primary);">تفاصيل الطلب: #${order.orderId || order.id}</h3>
      <span class="status-badge status-${order.status || 'new'}">${getOrderStatusArabic(order.status)}</span>
    </div>

    <div style="background:#f8fafc; padding:1rem; border-radius:8px; margin-bottom:1rem; font-size:0.9rem;">
      <p><strong>اسم العميل:</strong> ${order.customerName}</p>
      <p><strong>رقم الهاتف:</strong> <a href="${waLink}" target="_blank" style="color:#16a34a; font-weight:700;">💬 ${order.customerPhone} (مراسلة واتساب)</a></p>
      <p><strong>المحافظة / المدينة:</strong> ${order.city || "غير محدد"}</p>
      <p><strong>العنوان التفصيلي:</strong> ${order.address}</p>
      ${order.notes ? `<p><strong>ملاحظات:</strong> ${order.notes}</p>` : ""}
      <p><strong>تاريخ وتوقيت الطلب:</strong> ${order.createdAt || "-"}</p>
    </div>

    <h4 style="margin-bottom:0.5rem; color:var(--admin-primary);">المنتجات المطلوبة:</h4>
    <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
      ${(order.items || []).map(i => `
        <div style="display:flex; justify-content:space-between; background:#ffffff; border:1px solid var(--border-color); padding:0.6rem 0.8rem; border-radius:6px;">
          <span>${i.name} (×${i.quantity})</span>
          <strong>${i.price * i.quantity} ج.م</strong>
        </div>
      `).join("")}
    </div>

    <div style="border-top:1px dashed var(--border-color); padding-top:0.75rem; font-size:1.1rem; font-weight:800; display:flex; justify-content:space-between; color:var(--admin-primary);">
      <span>الإجمالي المستحق:</span>
      <span>${order.totalAmount || 0} ج.م (${order.paymentMethod || "الدفع عند الاستلام"})</span>
    </div>
  `;

  modal.classList.add("active");
}

function closeOrderDetailsModal() {
  document.getElementById("order-details-modal").classList.remove("active");
}

/**
 * 6. Cloudflare R2 Image Upload Handler via Worker
 */
function setupImageUploadHandler() {
  const fileInput = document.getElementById("prod-image-file");
  const preview = document.getElementById("prod-upload-preview");
  const statusEl = document.getElementById("upload-status-text");
  const urlInput = document.getElementById("prod-image-url");

  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (re) => {
      preview.src = re.target.result;
      preview.style.display = "inline-block";
    };
    reader.readAsDataURL(file);

    statusEl.textContent = "جاري رفع الصورة إلى Cloudflare R2...";
    statusEl.style.color = "#0284c7";

    try {
      // 1. Try upload to Worker endpoint
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(`${AdminState.workerUrl}/upload`, {
        method: "POST",
        body: formData
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.url) {
          urlInput.value = data.url;
          statusEl.textContent = "تم الرفع بنجاح إلى R2! ☁️";
          statusEl.style.color = "#16a34a";
          return;
        }
      }
      throw new Error("Worker responded with error");
    } catch (err) {
      console.warn("Worker upload error (fallback active):", err);
      // Fallback: If worker is not yet deployed with upload script, use base64 preview or inform user
      reader.onload = (re) => {
        urlInput.value = re.target.result;
        statusEl.textContent = "تم تجهيز الصورة بنجاح (سيتم الرفع المباشر أو يمكنك استخدام الرابط العام لـ R2)";
        statusEl.style.color = "#16a34a";
      };
    }
  });
}

/**
 * 7. Telegram Bot Settings & Testing
 */
async function loadAdminSettings() {
  try {
    if (typeof db !== "undefined" && db) {
      const snap = await db.ref("settings").once("value");
      const settings = snap.val() || {};
      AdminState.settings = settings;

      if (settings.telegram) {
        document.getElementById("tg-bot-token").value = settings.telegram.botToken || "";
        document.getElementById("tg-chat-id").value = settings.telegram.chatId || "";
        document.getElementById("tg-notify-orders").checked = settings.telegram.notifyOrders !== false;
        document.getElementById("tg-notify-logins").checked = settings.telegram.notifyLogins !== false;
      }
    }
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

function setupSettingsHandlers() {
  // Telegram test button
  const testTgBtn = document.getElementById("btn-test-telegram");
  if (testTgBtn) {
    testTgBtn.addEventListener("click", async () => {
      const token = document.getElementById("tg-bot-token").value.trim();
      const chatId = document.getElementById("tg-chat-id").value.trim();
      const resultEl = document.getElementById("telegram-test-result");

      if (!token || !chatId) {
        alert("يرجى إدخال كل من Bot Token و Chat ID أولاً!");
        return;
      }

      testTgBtn.disabled = true;
      testTgBtn.textContent = "جاري إرسال التجربة...";
      resultEl.textContent = "";

      const res = await TelegramService.testConnection(token, chatId);
      testTgBtn.disabled = false;
      testTgBtn.textContent = "إرسال إشعار تجريبي 🔔";

      if (res.success) {
        resultEl.textContent = "✅ تم إرسال الإشعار التجريبي لتليجرام بنجاح!";
        resultEl.style.color = "#16a34a";
      } else {
        resultEl.textContent = `❌ فشل الإرسال: ${res.error}`;
        resultEl.style.color = "#dc2626";
      }
    });
  }

  // Telegram save button
  const saveTgBtn = document.getElementById("btn-save-telegram");
  if (saveTgBtn) {
    saveTgBtn.addEventListener("click", async () => {
      const botToken = document.getElementById("tg-bot-token").value.trim();
      const chatId = document.getElementById("tg-chat-id").value.trim();
      const notifyOrders = document.getElementById("tg-notify-orders").checked;
      const notifyLogins = document.getElementById("tg-notify-logins").checked;

      await TelegramService.saveSettings({
        botToken,
        chatId,
        notifyOrders,
        notifyLogins
      });

      showAdminToast("تم حفظ إعدادات تليجرام في Firebase بنجاح ✅");
    });
  }

  // Password change
  const changePassForm = document.getElementById("change-pass-form");
  if (changePassForm) {
    changePassForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPass = document.getElementById("new-admin-pass").value.trim();
      const confirmPass = document.getElementById("confirm-admin-pass").value.trim();

      if (!newPass || newPass.length < 4) {
        alert("كلمة المرور يجب أن تكون 4 خانات على الأقل");
        return;
      }
      if (newPass !== confirmPass) {
        alert("كلمتا المرور غير متطابقتين!");
        return;
      }

      const hash = await hashPassword(newPass);
      if (typeof db !== "undefined" && db) {
        await db.ref("settings/adminPassword").set(hash);
        showAdminToast("تم تغيير كلمة المرور المشفرة بنجاح 🔒");
        document.getElementById("new-admin-pass").value = "";
        document.getElementById("confirm-admin-pass").value = "";
      }
    });
  }

  // Bind product form submit
  const prodForm = document.getElementById("admin-product-form");
  if (prodForm) {
    prodForm.addEventListener("submit", handleSaveProduct);
  }
}

/**
 * 7b. Banner & Announcement Management
 */
const DEFAULT_BANNERS = {
  topBar: {
    enabled: true,
    badge: "عرض خاص",
    text: "🎉 شحن مجاني للطلبات فوق 500 ج.م في جميع المحافظات!",
    extra: "• كل مشكلة ليها حلّها مع متجر حِلها"
  },
  hero: {
    enabled: true,
    image: "assets/banner.jpg",
    title: "وفّرنا لك كل الحلول والأدوات اللي تسهل حياتك 💡",
    subtitle: "منتجات ذكية، مبتكرة، ومختارة بعناية لحل مشاكل المنزل والمطبخ والتنظيف اليومية.",
    btnText: "تسوق الحلول الآن 🛍️",
    btnLink: "#products-section"
  }
};

async function loadBannerSettings() {
  try {
    let banners = DEFAULT_BANNERS;
    if (typeof db !== "undefined" && db) {
      const snap = await db.ref("settings/banners").once("value");
      if (snap.exists() && snap.val()) {
        banners = snap.val();
      }
    }

    // Populate Top Bar
    const topBar = banners.topBar || DEFAULT_BANNERS.topBar;
    const topEnabled = document.getElementById("banner-topbar-enabled");
    const topBadge = document.getElementById("banner-topbar-badge");
    const topText = document.getElementById("banner-topbar-text");
    const topExtra = document.getElementById("banner-topbar-extra");

    if (topEnabled) topEnabled.checked = topBar.enabled !== false;
    if (topBadge) topBadge.value = topBar.badge !== undefined ? topBar.badge : DEFAULT_BANNERS.topBar.badge;
    if (topText) topText.value = topBar.text !== undefined ? topBar.text : DEFAULT_BANNERS.topBar.text;
    if (topExtra) topExtra.value = topBar.extra !== undefined ? topBar.extra : DEFAULT_BANNERS.topBar.extra;

    // Populate Hero Banner
    const hero = banners.hero || DEFAULT_BANNERS.hero;
    const heroEnabled = document.getElementById("banner-hero-enabled");
    const heroImgUrl = document.getElementById("banner-hero-img-url");
    const heroTitle = document.getElementById("banner-hero-title");
    const heroSub = document.getElementById("banner-hero-subtitle");
    const heroBtnText = document.getElementById("banner-hero-btn-text");
    const heroBtnLink = document.getElementById("banner-hero-btn-link");

    if (heroEnabled) heroEnabled.checked = hero.enabled !== false;
    if (heroImgUrl) heroImgUrl.value = hero.image || DEFAULT_BANNERS.hero.image;
    if (heroTitle) heroTitle.value = hero.title !== undefined ? hero.title : DEFAULT_BANNERS.hero.title;
    if (heroSub) heroSub.value = hero.subtitle !== undefined ? hero.subtitle : DEFAULT_BANNERS.hero.subtitle;
    if (heroBtnText) heroBtnText.value = hero.btnText !== undefined ? hero.btnText : DEFAULT_BANNERS.hero.btnText;
    if (heroBtnLink) heroBtnLink.value = hero.btnLink !== undefined ? hero.btnLink : DEFAULT_BANNERS.hero.btnLink;

    updateBannerLivePreviews();
  } catch (err) {
    console.error("Error loading banner settings:", err);
  }
}

function updateBannerLivePreviews() {
  // Top bar preview
  const topEnabled = document.getElementById("banner-topbar-enabled")?.checked ?? true;
  const topBadge = document.getElementById("banner-topbar-badge")?.value || "";
  const topText = document.getElementById("banner-topbar-text")?.value || "";
  const topExtra = document.getElementById("banner-topbar-extra")?.value || "";

  const prevBox = document.getElementById("preview-topbar-box");
  const prevBadge = document.getElementById("preview-topbar-badge");
  const prevText = document.getElementById("preview-topbar-text");
  const prevExtra = document.getElementById("preview-topbar-extra");

  if (prevBox) {
    if (topEnabled) {
      prevBox.classList.remove("disabled");
      prevBox.style.opacity = "1";
    } else {
      prevBox.classList.add("disabled");
      prevBox.style.opacity = "0.45";
    }
  }
  if (prevBadge) prevBadge.textContent = topBadge || "عرض خاص";
  if (prevText) prevText.textContent = topText || "";
  if (prevExtra) {
    prevExtra.textContent = topExtra || "";
    prevExtra.style.display = topExtra ? "" : "none";
  }

  // Hero preview
  const heroEnabled = document.getElementById("banner-hero-enabled")?.checked ?? true;
  const heroImg = document.getElementById("banner-hero-img-url")?.value || "assets/banner.jpg";
  const heroTitle = document.getElementById("banner-hero-title")?.value || "";
  const heroSub = document.getElementById("banner-hero-subtitle")?.value || "";
  const heroBtnText = document.getElementById("banner-hero-btn-text")?.value || "";

  const prevHeroContainer = document.getElementById("preview-hero-container");
  const prevHeroImg = document.getElementById("preview-hero-img");
  const prevHeroTitle = document.getElementById("preview-hero-title");
  const prevHeroSub = document.getElementById("preview-hero-subtitle");
  const prevHeroBtn = document.getElementById("preview-hero-btn");

  if (prevHeroContainer) {
    if (heroEnabled) {
      prevHeroContainer.classList.remove("disabled");
      prevHeroContainer.style.opacity = "1";
    } else {
      prevHeroContainer.classList.add("disabled");
      prevHeroContainer.style.opacity = "0.45";
    }
  }
  if (prevHeroImg) prevHeroImg.src = heroImg;
  if (prevHeroTitle) prevHeroTitle.textContent = heroTitle;
  if (prevHeroSub) prevHeroSub.textContent = heroSub;
  if (prevHeroBtn) prevHeroBtn.textContent = heroBtnText;
}

async function saveBannerSettings() {
  try {
    const bannerData = {
      topBar: {
        enabled: document.getElementById("banner-topbar-enabled")?.checked ?? true,
        badge: document.getElementById("banner-topbar-badge")?.value.trim() || "",
        text: document.getElementById("banner-topbar-text")?.value.trim() || "",
        extra: document.getElementById("banner-topbar-extra")?.value.trim() || ""
      },
      hero: {
        enabled: document.getElementById("banner-hero-enabled")?.checked ?? true,
        image: document.getElementById("banner-hero-img-url")?.value.trim() || "assets/banner.jpg",
        title: document.getElementById("banner-hero-title")?.value.trim() || "",
        subtitle: document.getElementById("banner-hero-subtitle")?.value.trim() || "",
        btnText: document.getElementById("banner-hero-btn-text")?.value.trim() || "",
        btnLink: document.getElementById("banner-hero-btn-link")?.value.trim() || "#products-section"
      },
      updatedAt: new Date().toISOString()
    };

    if (typeof db !== "undefined" && db) {
      await db.ref("settings/banners").set(bannerData);
    }

    updateBannerLivePreviews();
    showAdminToast("✓ تم حفظ ونشر إعدادات البانرات والعروض في المتجر بنجاح! 📢");
  } catch (err) {
    console.error("Error saving banner settings:", err);
    alert("حدث خطأ أثناء حفظ الإعدادات: " + err.message);
  }
}

function resetBannerSettingsToDefault() {
  if (!confirm("هل أنت متأكد من استعادة النصوص والصور الافتراضية للبانرات؟")) return;

  const topEnabled = document.getElementById("banner-topbar-enabled");
  const topBadge = document.getElementById("banner-topbar-badge");
  const topText = document.getElementById("banner-topbar-text");
  const topExtra = document.getElementById("banner-topbar-extra");

  if (topEnabled) topEnabled.checked = true;
  if (topBadge) topBadge.value = DEFAULT_BANNERS.topBar.badge;
  if (topText) topText.value = DEFAULT_BANNERS.topBar.text;
  if (topExtra) topExtra.value = DEFAULT_BANNERS.topBar.extra;

  const heroEnabled = document.getElementById("banner-hero-enabled");
  const heroImgUrl = document.getElementById("banner-hero-img-url");
  const heroTitle = document.getElementById("banner-hero-title");
  const heroSub = document.getElementById("banner-hero-subtitle");
  const heroBtnText = document.getElementById("banner-hero-btn-text");
  const heroBtnLink = document.getElementById("banner-hero-btn-link");

  if (heroEnabled) heroEnabled.checked = true;
  if (heroImgUrl) heroImgUrl.value = DEFAULT_BANNERS.hero.image;
  if (heroTitle) heroTitle.value = DEFAULT_BANNERS.hero.title;
  if (heroSub) heroSub.value = DEFAULT_BANNERS.hero.subtitle;
  if (heroBtnText) heroBtnText.value = DEFAULT_BANNERS.hero.btnText;
  if (heroBtnLink) heroBtnLink.value = DEFAULT_BANNERS.hero.btnLink;

  updateBannerLivePreviews();
  showAdminToast("تم استرجاع الإعدادات الافتراضية (اضغط حفظ لنشرها)");
}

async function handleHeroBannerUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("banner-upload-status");
  const urlInput = document.getElementById("banner-hero-img-url");

  statusEl.textContent = "جاري رفع صورة البانر إلى Cloudflare R2...";
  statusEl.style.color = "#0284c7";

  const reader = new FileReader();
  reader.onload = (re) => {
    urlInput.value = re.target.result;
    updateBannerLivePreviews();
  };
  reader.readAsDataURL(file);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const resp = await fetch(`${AdminState.workerUrl}/upload`, {
      method: "POST",
      body: formData
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.url) {
        urlInput.value = data.url;
        statusEl.textContent = "تم الرفع بنجاح إلى Cloudflare R2! ☁️";
        statusEl.style.color = "#16a34a";
        updateBannerLivePreviews();
        return;
      }
    }
    throw new Error("Worker upload failed");
  } catch (err) {
    console.warn("Hero banner upload fallback:", err);
    statusEl.textContent = "تم تجهيز الصورة بنجاح (جاهزة للحفظ)";
    statusEl.style.color = "#16a34a";
  }
}

/**
 * 8. UI Navigation & Tabs
 */
function setupAdminNavigation() {
  const menuButtons = document.querySelectorAll(".sidebar-menu .menu-item button");
  const panes = document.querySelectorAll(".tab-pane");

  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      menuButtons.forEach(b => b.parentElement.classList.remove("active"));
      btn.parentElement.classList.add("active");

      const targetTab = btn.getAttribute("data-tab");
      panes.forEach(pane => {
        pane.classList.remove("active");
        if (pane.id === `tab-${targetTab}`) {
          pane.classList.add("active");
        }
      });
    });
  });

  // Filter orders tabs
  const orderFilters = document.querySelectorAll(".order-filter-btn");
  orderFilters.forEach(btn => {
    btn.addEventListener("click", () => {
      orderFilters.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      AdminState.currentOrderFilter = btn.getAttribute("data-filter") || "all";
      renderAdminOrders();
    });
  });
}

function showAdminToast(msg) {
  let toast = document.getElementById("admin-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "admin-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      left: 2rem;
      background: #113832;
      color: #ffffff;
      padding: 0.85rem 1.5rem;
      border-radius: 8px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      z-index: 10000;
      border-right: 4px solid #f3a824;
      animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}
