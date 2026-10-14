/**
 * Helha (حِلها) Admin Dashboard Logic
 * Full control over products, orders, Telegram bot, analytics, and settings
 */

const AdminState = {
  products: [],
  orders: [],
  coupons: [],
  shippingSettings: {
    freeShippingEnabled: true,
    freeShippingThreshold: 1000,
    mode: "flat",
    flatRate: 50,
    govRates: {}
  },
  previousOrdersCount: -1,
  analytics: {},
  settings: {},
  categories: [],
  messages: [],
  currentProductCategoryFilter: "all",
  currentOrderFilter: "all",
  currentPreorderFilter: "all",
  editingProductId: null,
  currentProductImages: [],
  heroBannersList: [],
  preorders: [],
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

  // 2. Sync Orders with Live Notifications
  db.ref("orders").on("value", (snap) => {
    const data = snap.val();
    const prevCount = AdminState.previousOrdersCount;
    if (data) {
      AdminState.orders = Object.keys(data)
        .map(key => ({ ...data[key], firebaseKey: key }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else {
      AdminState.orders = [];
    }

    // Check if new orders arrived during the session
    if (prevCount >= 0 && AdminState.orders.length > prevCount) {
      const newOrdersDiff = AdminState.orders.length - prevCount;
      const latestOrder = AdminState.orders[0];
      playOrderNotificationSound();
      showOrderNotificationToast(latestOrder, newOrdersDiff);
    }
    AdminState.previousOrdersCount = AdminState.orders.length;

    // Update orders badge count
    updateOrdersBadgeCount();

    renderAdminOrders();
    updateDashboardStats();
  });

  // 3. Sync Analytics
  db.ref("analytics").on("value", (snap) => {
    AdminState.analytics = snap.val() || {};
    updateDashboardStats();
    if (typeof AdminAnalytics !== "undefined") {
      AdminAnalytics.onAnalyticsUpdated(AdminState.analytics);
    }
  });

  // 3b. Sync Pre-orders (الطلبات المسبقة)
  db.ref("preorders").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      AdminState.preorders = Object.keys(data).map(key => ({
        ...data[key],
        firebaseKey: key,
        id: data[key].id || key
      })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else {
      AdminState.preorders = [];
    }
    updatePreordersBadgeCount();
    renderPreordersTable();
  });

  // 4. Load Settings & Categories & Messages & Shipping & Coupons
  initCategoriesListener();
  initMessagesListener();
  initShippingListener();
  initCouponsListener();
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد طلبات واردة حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(o => `
    <tr style="cursor:pointer;" onclick="viewOrderDetails('${o.orderId || o.id}')" title="انقر لعرض تفاصيل الطلب">
      <td><strong>#${o.orderId || o.id}</strong></td>
      <td>${o.createdAt || "-"}</td>
      <td>${o.customerName || "-"}</td>
      <td>${o.customerPhone || "-"}</td>
      <td><strong>${o.totalAmount || 0} ج.م</strong></td>
      <td><span class="status-badge status-${o.status || 'new'}">${getOrderStatusArabic(o.status)}</span></td>
      <td>
        <button class="btn-admin-action" style="background:#e0f2fe; color:#0284c7; padding:4px 10px; font-size:0.8rem; border-radius:6px;" onclick="event.stopPropagation(); viewOrderDetails('${o.orderId || o.id}')">
          👁️ عرض التفاصيل
        </button>
      </td>
    </tr>
  `).join("");
}

/**
 * 4. Categories Management (Dynamic Categories)
 */
const DEFAULT_CATEGORIES = [
  { id: "kitchen", name: "حلول المطبخ", icon: "🍳", isDefault: true },
  { id: "cleaning", name: "أدوات التنظيف", icon: "🧹", isDefault: true },
  { id: "home", name: "حلول منزلية", icon: "🏠", isDefault: true },
  { id: "deals", name: "عروض التوفير", icon: "🔥", isDefault: true }
];

function initCategoriesListener() {
  if (typeof db === "undefined" || !db) {
    AdminState.categories = [...DEFAULT_CATEGORIES];
    renderAdminCategoryFilters();
    renderCategorySelectOptions();
    return;
  }

  db.ref("categories").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      const customList = Object.keys(data).map(k => ({
        ...data[k],
        id: data[k].id || k
      }));
      const merged = [...DEFAULT_CATEGORIES];
      customList.forEach(custom => {
        if (!merged.some(c => c.id === custom.id)) {
          merged.push(custom);
        }
      });
      AdminState.categories = merged;
    } else {
      AdminState.categories = [...DEFAULT_CATEGORIES];
    }
    renderAdminCategoryFilters();
    renderCategorySelectOptions();
    renderCategoriesManageList();
  });
}

function renderAdminCategoryFilters() {
  const container = document.getElementById("admin-category-filter-bar");
  if (!container) return;

  const current = AdminState.currentProductCategoryFilter || "all";
  let html = `
    <button class="cat-btn admin-prod-cat-btn ${current === 'all' ? 'active' : ''}" data-cat="all" onclick="filterAdminProducts('all')">الكل (جميع الأقسام)</button>
  `;

  (AdminState.categories || DEFAULT_CATEGORIES).forEach(c => {
    const isDeals = c.id === "deals";
    html += `
      <button class="cat-btn admin-prod-cat-btn ${current === c.id ? 'active' : ''}" data-cat="${c.id}" onclick="filterAdminProducts('${c.id}')" ${isDeals ? 'style="color:#ef4444; font-weight:800;"' : ''}>
        ${c.icon || '🏷️'} ${c.name}
      </button>
    `;
  });

  container.innerHTML = html;
}

function renderCategorySelectOptions() {
  const select = document.getElementById("prod-category");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = (AdminState.categories || DEFAULT_CATEGORIES).map(c => `
    <option value="${c.id}">${c.icon || '🏷️'} ${c.name}</option>
  `).join("");

  if (currentVal && AdminState.categories.some(c => c.id === currentVal)) {
    select.value = currentVal;
  }
}

function renderCategoriesManageList() {
  const list = document.getElementById("categories-manage-list");
  if (!list) return;

  list.innerHTML = (AdminState.categories || DEFAULT_CATEGORIES).map(c => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:0.6rem 0.85rem; border-radius:8px;">
      <div style="display:flex; align-items:center; gap:0.5rem; font-weight:700;">
        <span>${c.icon || '🏷️'}</span>
        <span>${c.name}</span>
        ${c.isDefault ? `<span style="font-size:0.7rem; background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:4px;">افتراضي</span>` : `<span style="font-size:0.7rem; background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px;">مخصص</span>`}
      </div>
      <div>
        ${!c.isDefault ? `
          <button type="button" onclick="deleteCustomCategory('${c.id}')" style="background:#fee2e2; color:#ef4444; border:none; border-radius:6px; padding:0.3rem 0.6rem; cursor:pointer; font-size:0.8rem; font-weight:700;">
            🗑️ حذف
          </button>
        ` : `<span style="font-size:0.78rem; color:#94a3b8;">أساسي</span>`}
      </div>
    </div>
  `).join("");
}

function openCategoryModal() {
  renderCategoriesManageList();
  document.getElementById("category-modal")?.classList.add("active");
}

function closeCategoryModal() {
  document.getElementById("category-modal")?.classList.remove("active");
}

async function handleAddNewCategory(e) {
  e.preventDefault();
  const name = document.getElementById("new-cat-name").value.trim();
  const icon = document.getElementById("new-cat-icon").value.trim() || "🏷️";

  if (!name) return;

  const id = "cat_" + Date.now();
  const catData = {
    id: id,
    name: name,
    icon: icon,
    isDefault: false,
    createdAt: new Date().toISOString()
  };

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`categories/${id}`).set(catData);
      showAdminToast(`✓ تم إضافة قسم "${name}" بنجاح! 🏷️`);
    } else {
      AdminState.categories.push(catData);
      renderAdminCategoryFilters();
      renderCategorySelectOptions();
      renderCategoriesManageList();
    }
    document.getElementById("new-cat-name").value = "";
  } catch (err) {
    alert("خطأ أثناء حفظ القسم: " + err.message);
  }
}

async function deleteCustomCategory(catId) {
  if (!confirm("هل أنت متأكد من حذف هذا القسم؟ (المنتجات التابعة له ستظل موجودة بالمتجر)")) return;
  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`categories/${catId}`).remove();
      showAdminToast("تم حذف القسم 🗑️");
    }
  } catch (err) {
    alert("خطأ أثناء الحذف: " + err.message);
  }
}

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
        ${p.offers && p.offers.length > 0 ? `<span style="font-size:0.7rem; background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; margin-right:4px;">${p.offers.length} عروض 🎁</span>` : ""}
        <div style="font-size:0.8rem; color:var(--text-muted);">${p.subtitle || ""}</div>
      </td>
      <td>
        ${p.category === 'deals' ? `<span style="background:#fef2f2; color:#ef4444; font-weight:700; padding:3px 8px; border-radius:6px; font-size:0.82rem;">🔥 عروض التوفير</span>` : (p.categoryName || getCategoryArabicName(p.category))}
      </td>
      <td><strong>${p.price} ج.م</strong> ${p.originalPrice ? `<span style="text-decoration:line-through; font-size:0.8rem; color:var(--text-muted);">${p.originalPrice}</span>` : ""}</td>
      <td>${renderAdminProductStock(p)}</td>
      <td>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-admin-action" style="background:#e0f2fe; color:#0284c7; padding:4px 8px;" onclick="openEditProductModal('${p.id}')">✏️ تعديل</button>
          <button class="btn-admin-action" style="background:#fee2e2; color:#b91c1c; padding:4px 8px;" onclick="deleteProduct('${p.id}')">🗑️ حذف</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderAdminProductStock(p) {
  const avail = p.availability || "in_stock";
  if (avail === "preorder") {
    return `<span style="background:#fef3c7; color:#b45309; padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-block;">⏳ متاح للطلب المسبق</span>`;
  }
  if (avail === "out_of_stock") {
    return `<span style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; display:inline-block;">❌ غير متوفر</span>`;
  }
  const stock = p.stockCount !== undefined && p.stockCount !== null ? Number(p.stockCount) : 50;
  if (stock <= 3) {
    return `
      <div>
        <span style="font-weight:700;">${stock} قطعة</span>
        <div style="font-size:0.72rem; background:#fee2e2; color:#dc2626; padding:2px 6px; border-radius:4px; font-weight:800; margin-top:3px; display:inline-block;">
          🔥 أوشك على النفاذ!
        </div>
      </div>
    `;
  }
  return `<span>${stock} قطعة</span>`;
}

function getCategoryArabicName(cat) {
  const found = (AdminState.categories || DEFAULT_CATEGORIES).find(c => c.id === cat);
  if (found) return found.name;
  switch (cat) {
    case "kitchen": return "حلول المطبخ";
    case "cleaning": return "أدوات التنظيف";
    case "home": return "حلول منزلية";
    case "deals": return "عروض التوفير";
    default: return cat || "أدوات ذكية";
  }
}

/**
 * 4b. Product Offers & Bundles Management
 */
function addOfferRow(offer = null) {
  const container = document.getElementById("prod-offers-container");
  if (!container) return;

  const rowId = `offer_row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const count = container.children.length + 1;
  const qty = offer ? (offer.qty || count) : count;
  const title = offer ? (offer.title || "") : "";
  const totalPrice = offer ? (offer.totalPrice || "") : "";
  const note = offer ? (offer.note || "") : "";

  const div = document.createElement("div");
  div.id = rowId;
  div.className = "offer-item-row";
  div.style.cssText = "background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:0.75rem 0.85rem; display:grid; grid-template-columns: 65px 1.5fr 1fr 1.2fr auto; gap:0.6rem; align-items:center;";

  div.innerHTML = `
    <div>
      <label style="font-size:0.75rem; color:#64748b; display:block; margin-bottom:2px;">الكمية</label>
      <input type="number" class="offer-qty-input" value="${qty}" min="1" style="width:100%; padding:0.4rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem; text-align:center;" required>
    </div>
    <div>
      <label style="font-size:0.75rem; color:#64748b; display:block; margin-bottom:2px;">عنوان العرض للعميل</label>
      <input type="text" class="offer-title-input" value="${title}" placeholder="مثال: اشتري 2 مكنسة بـ 878ج فقط" style="width:100%; padding:0.4rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;" required>
    </div>
    <div>
      <label style="font-size:0.75rem; color:#64748b; display:block; margin-bottom:2px;">السعر الإجمالي (ج.م)</label>
      <input type="number" class="offer-price-input" value="${totalPrice}" placeholder="878" style="width:100%; padding:0.4rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;" required>
    </div>
    <div>
      <label style="font-size:0.75rem; color:#64748b; display:block; margin-bottom:2px;">ملاحظة التوفير / السعر الأصلي</label>
      <input type="text" class="offer-note-input" value="${note}" placeholder="سعر القطعة: 439 ج.م | السعر الأصلي: 650 ج.م" style="width:100%; padding:0.4rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem;">
    </div>
    <div style="padding-top:15px;">
      <button type="button" onclick="document.getElementById('${rowId}').remove()" style="background:#fee2e2; color:#ef4444; border:none; border-radius:6px; padding:0.45rem 0.65rem; cursor:pointer; font-size:0.9rem;" title="حذف هذا العرض">
        🗑️
      </button>
    </div>
  `;

  container.appendChild(div);
}

function generateAutoOffers() {
  const price = Number(document.getElementById("prod-price").value);
  const origPrice = Number(document.getElementById("prod-original-price").value) || Math.round(price * 1.25);
  const name = document.getElementById("prod-name").value.trim() || "المنتج";
  const shortName = name.split(" ")[0] || "المنتج";

  if (!price || price <= 0) {
    alert("يرجى إدخال السعر الحالي للمنتج أولاً لتوليد الباقات تلقائياً!");
    return;
  }

  const container = document.getElementById("prod-offers-container");
  if (!container) return;
  container.innerHTML = "";

  // 1 item
  addOfferRow({
    qty: 1,
    title: `اشتري ${shortName} بسعر ${price}ج فقط`,
    totalPrice: price,
    note: origPrice > price ? `سعر القطعة: ${price} ج.م | السعر الأصلي: ${origPrice} ج.م` : ""
  });

  // 2 items: 12% discount
  const p2 = Math.round(price * 2 * 0.88);
  const u2 = Math.round(p2 / 2);
  addOfferRow({
    qty: 2,
    title: `اشتري 2 ${shortName} بـ ${p2}ج فقط`,
    totalPrice: p2,
    note: `سعر القطعة: ${u2} ج.م | السعر الأصلي: ${origPrice * 2} ج.م`
  });

  // 3 items: 18% discount
  const p3 = Math.round(price * 3 * 0.82);
  const u3 = Math.round(p3 / 3);
  addOfferRow({
    qty: 3,
    title: `اشتري 3 ${shortName} بـ ${p3}ج فقط`,
    totalPrice: p3,
    note: `سعر القطعة: ${u3} ج.م | السعر الأصلي: ${origPrice * 3} ج.م`
  });

  showAdminToast("تم توليد 3 باقات ذكية بنجاح! ⚡");
}

function collectProductOffers() {
  const container = document.getElementById("prod-offers-container");
  if (!container) return [];

  const rows = container.querySelectorAll(".offer-item-row");
  const offers = [];

  rows.forEach((row, idx) => {
    const qty = Number(row.querySelector(".offer-qty-input")?.value) || (idx + 1);
    const title = row.querySelector(".offer-title-input")?.value.trim() || "";
    const totalPrice = Number(row.querySelector(".offer-price-input")?.value) || 0;
    const note = row.querySelector(".offer-note-input")?.value.trim() || "";
    const unitPrice = qty > 0 ? Math.round(totalPrice / qty) : totalPrice;

    if (title && totalPrice > 0) {
      offers.push({
        index: idx,
        qty: qty,
        title: title,
        totalPrice: totalPrice,
        unitPrice: unitPrice,
        note: note
      });
    }
  });

  return offers;
}

function handleProductAvailabilityChange() {
  const avail = document.getElementById("prod-availability")?.value || "in_stock";
  const stockGroup = document.getElementById("prod-stock-group");
  const stockHint = document.getElementById("prod-stock-hint");
  if (!stockGroup) return;

  if (avail === "in_stock") {
    stockGroup.style.display = "block";
    if (stockHint) stockHint.style.display = "block";
  } else {
    stockGroup.style.display = "none";
  }
}

function openAddProductModal() {
  AdminState.editingProductId = null;
  document.getElementById("product-modal-title").textContent = "إضافة منتج جديد لحِلها";
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-subtitle").value = "";
  document.getElementById("prod-category").value = AdminState.categories?.[0]?.id || "kitchen";
  document.getElementById("prod-price").value = "";
  document.getElementById("prod-original-price").value = "";
  document.getElementById("prod-badge").value = "";
  
  const availSelect = document.getElementById("prod-availability");
  if (availSelect) availSelect.value = "in_stock";
  handleProductAvailabilityChange();

  document.getElementById("prod-stock").value = "50";
  document.getElementById("prod-desc").value = "";
  document.getElementById("prod-features").value = "";

  // Reset multi-image gallery state
  AdminState.currentProductImages = [];
  renderAdminProductImages();
  const urlInput = document.getElementById("prod-image-url-input");
  if (urlInput) urlInput.value = "";
  const uploadStatus = document.getElementById("upload-status-text");
  if (uploadStatus) uploadStatus.textContent = "";

  // Reset offers container
  const offersContainer = document.getElementById("prod-offers-container");
  if (offersContainer) offersContainer.innerHTML = "";

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

  const availSelect = document.getElementById("prod-availability");
  if (availSelect) availSelect.value = prod.availability || "in_stock";
  handleProductAvailabilityChange();

  document.getElementById("prod-stock").value = prod.stockCount || "50";
  document.getElementById("prod-desc").value = prod.description || "";
  document.getElementById("prod-features").value = (prod.features || []).join("\n");

  // Populate multi-image gallery state (up to 10 images)
  if (Array.isArray(prod.images) && prod.images.length > 0) {
    AdminState.currentProductImages = [...prod.images.filter(Boolean)].slice(0, 10);
  } else if (prod.image) {
    AdminState.currentProductImages = [prod.image];
  } else {
    AdminState.currentProductImages = [];
  }
  renderAdminProductImages();
  const urlInput = document.getElementById("prod-image-url-input");
  if (urlInput) urlInput.value = "";
  const uploadStatus = document.getElementById("upload-status-text");
  if (uploadStatus) uploadStatus.textContent = "";

  // Populate offers
  const offersContainer = document.getElementById("prod-offers-container");
  if (offersContainer) {
    offersContainer.innerHTML = "";
    if (prod.offers && prod.offers.length > 0) {
      prod.offers.forEach(off => addOfferRow(off));
    }
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
  const availability = document.getElementById("prod-availability")?.value || "in_stock";
  const stockCount = Number(document.getElementById("prod-stock").value) || 50;
  const description = document.getElementById("prod-desc").value.trim();
  const featuresText = document.getElementById("prod-features").value.trim();
  
  // Also check if user typed a direct URL without clicking "add"
  const urlInput = document.getElementById("prod-image-url-input");
  const directUrl = urlInput ? urlInput.value.trim() : "";
  if (directUrl && AdminState.currentProductImages.length < 10 && !AdminState.currentProductImages.includes(directUrl)) {
    AdminState.currentProductImages.push(directUrl);
  }

  const images = AdminState.currentProductImages && AdminState.currentProductImages.length > 0
    ? AdminState.currentProductImages.slice(0, 10)
    : ["assets/logo.jpg"];
  const primaryImage = images[0] || "assets/logo.jpg";
  const offers = collectProductOffers();

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
    availability: availability,
    stockCount: stockCount,
    description: description,
    features: features,
    image: primaryImage,
    images: images,
    offers: offers,
    isDemo: false,
    updatedAt: new Date().toISOString()
  };

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`products/${id}`).set(productData);
      showAdminToast("تم حفظ المنتج والعروض بنجاح في قاعدة البيانات ✅");
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
          <div style="display:flex; gap:0.4rem; align-items:center;">
            <button class="btn-admin-action" style="background:#e0f2fe; color:#0284c7; padding:4px 8px; font-size:0.82rem;" onclick="viewOrderDetails('${o.orderId || o.id}')">👁️ عرض</button>
            <button class="btn-admin-action btn-danger-outline" style="padding:4px 8px; font-size:0.82rem;" onclick="deleteAdminOrder('${o.orderId || o.id}')" title="حذف الطلب نهائياً">🗑️ حذف</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function deleteAdminOrder(orderId) {
  const order = AdminState.orders.find(o => String(o.orderId || o.id) === String(orderId) || o.firebaseKey === orderId);
  const targetKey = order ? (order.firebaseKey || order.orderId || order.id) : orderId;

  if (!confirm(`⚠️ تحذير:\nهل أنت متأكد تماماً من حذف الطلب #${orderId} نهائياً من قاعدة البيانات؟\nلن يمكن استعادة بيانات هذا الطلب بعد الحذف.`)) {
    return;
  }

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`orders/${targetKey}`).remove();
      showAdminToast(`تم حذف الطلب #${orderId} نهائياً بنجاح 🗑️`);
      closeOrderDetailsModal();
    }
  } catch (err) {
    alert("خطأ أثناء حذف الطلب: " + err.message);
  }
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
      const order = AdminState.orders.find(o => String(o.orderId || o.id) === String(orderId) || o.firebaseKey === orderId);
      const targetKey = order ? (order.firebaseKey || order.orderId || order.id) : orderId;
      await db.ref(`orders/${targetKey}/status`).set(newStatus);
      showAdminToast(`تم تغيير حالة الطلب #${orderId} إلى "${getOrderStatusArabic(newStatus)}" ✅`);
      updateOrdersBadgeCount();
    }
  } catch (err) {
    alert("خطأ أثناء تحديث حالة الطلب: " + err.message);
  }
}

function viewOrderDetails(orderId) {
  const order = AdminState.orders.find(o => String(o.orderId || o.id) === String(orderId) || o.firebaseKey === orderId);
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
      ${order.couponCode ? `<p style="margin-top:0.4rem;"><strong>كود الخصم المطبق:</strong> <span class="coupon-tag-badge">🎟️ ${order.couponCode}</span> (وفّر للعميل: ${order.discountAmount || 0} ج.م)</p>` : ""}
      <p style="margin-top:0.4rem;"><strong>مصاريف الشحن:</strong> ${order.shippingFee ? order.shippingFee + " ج.م" : "شحن مجاني 🎉"}</p>
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

    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:0.5rem;">
      <button class="btn-admin-action btn-danger-outline" onclick="deleteAdminOrder('${order.orderId || order.id}')">
        🗑️ حذف هذا الطلب نهائياً من النظام
      </button>
      <button class="btn-admin-action" style="background:#e2e8f0; color:#334155;" onclick="closeOrderDetailsModal()">
        إغلاق النافذة
      </button>
    </div>
  `;

  modal.classList.add("active");
}

function closeOrderDetailsModal() {
  document.getElementById("order-details-modal").classList.remove("active");
}

/**
 * 6. Cloudflare R2 Multi-Image Upload & Gallery Manager (Up to 10 Images)
 */
const MAX_PRODUCT_IMAGES = 10;

function setupImageUploadHandler() {
  const urlInput = document.getElementById("prod-image-url-input");
  if (urlInput) {
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addAdminImageByUrl();
      }
    });
  }

  // Backward compatibility with single upload if present
  const singleInput = document.getElementById("prod-image-file");
  if (singleInput) {
    singleInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadSingleImageFile(file);
      if (url && AdminState.currentProductImages.length < MAX_PRODUCT_IMAGES) {
        AdminState.currentProductImages.push(url);
        renderAdminProductImages();
      }
    });
  }
}

async function uploadSingleImageFile(file) {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const resp = await fetch(`${AdminState.workerUrl}/upload`, {
      method: "POST",
      body: formData
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.warn("Cloudflare Worker upload failed, using fallback:", err);
  }

  // Fallback to Base64 data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

function renderAdminProductImages() {
  const grid = document.getElementById("prod-images-grid");
  const badge = document.getElementById("prod-images-counter-badge");
  const images = AdminState.currentProductImages || [];

  if (badge) {
    badge.textContent = `${images.length} من ${MAX_PRODUCT_IMAGES} صور مضافة`;
    if (images.length >= MAX_PRODUCT_IMAGES) {
      badge.style.background = "#fef2f2";
      badge.style.color = "#dc2626";
    } else {
      badge.style.background = "#e0f2fe";
      badge.style.color = "#0369a1";
    }
  }

  if (!grid) return;

  if (images.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 0.85rem 0.5rem; background:#ffffff; border-radius:8px; border:1px dashed #cbd5e1;">
        لم تقم بإضافة أي صور بعد. اضغط بالأعلى لرفع صور (حتى 10) أو أضف رابط صورة مباشر.
      </div>
    `;
    return;
  }

  grid.innerHTML = images.map((url, idx) => `
    <div style="position:relative; width:100%; aspect-ratio:1/1; border-radius:8px; overflow:hidden; border:2.5px solid ${idx === 0 ? '#10b981' : '#cbd5e1'}; background:#ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:center;">
      <img src="${url}" alt="صورة ${idx + 1}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='assets/logo.jpg'">
      ${idx === 0 ? `
        <span style="position:absolute; top:4px; right:4px; background:#10b981; color:#fff; font-size:0.68rem; font-weight:800; padding:2px 6px; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.3); pointer-events:none;">
          ★ الرئيسية
        </span>
      ` : `
        <button type="button" onclick="setPrimaryAdminProductImage(${idx})" title="تعيين كصورة رئيسية للمتجر" style="position:absolute; top:4px; right:4px; background:rgba(15,23,42,0.72); color:#fff; border:none; border-radius:4px; font-size:0.65rem; font-weight:700; padding:2px 5px; cursor:pointer; transition:background 0.2s;">
          تعيين رئيسية
        </button>
      `}
      <button type="button" onclick="removeAdminProductImage(${idx})" title="حذف هذه الصورة" style="position:absolute; bottom:4px; left:4px; background:rgba(239,68,68,0.9); color:#fff; border:none; border-radius:4px; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; cursor:pointer; transition:transform 0.15s;">
        ✕
      </button>
      <span style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.55); color:#fff; font-size:0.62rem; padding:1px 4px; border-radius:3px;">
        ${idx + 1}
      </span>
    </div>
  `).join("");
}

async function handleAdminMultiImagesSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const statusEl = document.getElementById("upload-status-text");
  const availableSlots = MAX_PRODUCT_IMAGES - AdminState.currentProductImages.length;

  if (availableSlots <= 0) {
    alert(`عفواً، لقد وصلت للحد الأقصى (${MAX_PRODUCT_IMAGES} صور) لهذا المنتج.`);
    event.target.value = "";
    return;
  }

  const filesToUpload = files.slice(0, availableSlots);
  if (files.length > availableSlots) {
    alert(`سيتم رفع أول ${availableSlots} صور فقط للالتزام بالحد الأقصى (10 صور).`);
  }

  if (statusEl) {
    statusEl.textContent = `جاري رفع ${filesToUpload.length} صورة...`;
    statusEl.style.color = "#0284c7";
  }

  for (let i = 0; i < filesToUpload.length; i++) {
    try {
      if (statusEl) statusEl.textContent = `جاري معالجة ورفع الصورة (${i + 1} من ${filesToUpload.length})...`;
      const url = await uploadSingleImageFile(filesToUpload[i]);
      if (url && AdminState.currentProductImages.length < MAX_PRODUCT_IMAGES) {
        AdminState.currentProductImages.push(url);
        renderAdminProductImages();
      }
    } catch (e) {
      console.error("Error uploading file:", e);
    }
  }

  if (statusEl) {
    statusEl.textContent = "تم رفع وتجهيز الصور بنجاح! ☁️";
    statusEl.style.color = "#16a34a";
    setTimeout(() => {
      if (statusEl) statusEl.textContent = "";
    }, 4000);
  }

  event.target.value = "";
}

function addAdminImageByUrl() {
  const urlInput = document.getElementById("prod-image-url-input");
  if (!urlInput) return;
  const url = urlInput.value.trim();
  if (!url) {
    alert("يرجى إدخال رابط الصورة أولاً!");
    return;
  }
  if (AdminState.currentProductImages.length >= MAX_PRODUCT_IMAGES) {
    alert(`لقد وصلت للحد الأقصى (${MAX_PRODUCT_IMAGES} صور) لهذا المنتج.`);
    return;
  }
  AdminState.currentProductImages.push(url);
  urlInput.value = "";
  renderAdminProductImages();
}

function removeAdminProductImage(index) {
  if (index >= 0 && index < AdminState.currentProductImages.length) {
    AdminState.currentProductImages.splice(index, 1);
    renderAdminProductImages();
  }
}

function setPrimaryAdminProductImage(index) {
  if (index > 0 && index < AdminState.currentProductImages.length) {
    const [item] = AdminState.currentProductImages.splice(index, 1);
    AdminState.currentProductImages.unshift(item);
    renderAdminProductImages();
  }
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
        const tokenInput = document.getElementById("tg-bot-token");
        const chatInput = document.getElementById("tg-chat-id");
        const ordCheck = document.getElementById("tg-notify-orders");
        const logCheck = document.getElementById("tg-notify-logins");
        const msgCheck = document.getElementById("tg-notify-messages");

        if (tokenInput) tokenInput.value = settings.telegram.botToken || "";
        if (chatInput) chatInput.value = settings.telegram.chatId || "";
        if (ordCheck) ordCheck.checked = settings.telegram.notifyOrders !== false;
        if (logCheck) logCheck.checked = settings.telegram.notifyLogins !== false;
        if (msgCheck) msgCheck.checked = settings.telegram.notifyMessages !== false;
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

      if (res.allSuccess) {
        resultEl.textContent = `✅ تم إرسال الإشعار التجريبي لتليجرام بنجاح! (${res.sent} محادثة)`;
        resultEl.style.color = "#16a34a";
      } else if (res.success) {
        resultEl.textContent = `⚠️ تم الإرسال إلى ${res.sent} من ${res.total} محادثة. (${res.error})`;
        resultEl.style.color = "#d97706";
      } else {
        resultEl.textContent = `❌ فشل الإرسال: ${res.error || "تأكد من بدء المحادثة مع البوت بالضغط على Start أولاً"}`;
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
      const notifyMessages = document.getElementById("tg-notify-messages") ? document.getElementById("tg-notify-messages").checked : true;

      await TelegramService.saveSettings({
        botToken,
        chatId,
        notifyOrders,
        notifyLogins,
        notifyMessages
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
 * 7b. Banner & Announcement Management (Multi-Banner Carousel & Top Bar)
 */
const DEFAULT_HERO_BANNERS_LIST = [
  {
    image: "assets/banners/banner-main.jpg",
    title: "وفّرنا لك كل الحلول والأدوات اللي تسهل حياتك 💡",
    link: "#products-section",
    enabled: true
  },
  {
    image: "assets/banners/banner-shipping.jpg",
    title: "شحن وتوصيل سريع لباب بيتك بجميع المحافظات 🚚",
    link: "shipping.html",
    enabled: true
  },
  {
    image: "assets/banners/banner-cod.jpg",
    title: "الدفع عند الاستلام - عاين منتجك وافحصه بالكامل قبل الدفع 💵",
    link: "#products-section",
    enabled: true
  },
  {
    image: "assets/banners/banner-support.jpg",
    title: "دعم واستجابة سريعة - تواصل معنا عبر البريد Hellha.eg@gmail.com ✉️",
    link: "mailto:Hellha.eg@gmail.com",
    enabled: true
  }
];

const DEFAULT_BANNERS = {
  topBar: {
    enabled: true,
    badge: "عرض خاص",
    text: "🚚 شحن مجاني لجميع محافظات مصر 🇪🇬 عدا الصعيد وسيناء تحدد حسب الواجهه ✨",
    extra: "• كل مشكلة ليها حلّها مع متجر حِلها"
  },
  hero: {
    enabled: true,
    image: "assets/banners/banner-main.jpg",
    title: "وفّرنا لك كل الحلول والأدوات اللي تسهل حياتك 💡",
    subtitle: "منتجات ذكية، مبتكرة، ومختارة بعناية لحل مشاكل المنزل والمطبخ والتنظيف اليومية.",
    btnText: "تسوق الحلول الآن 🛍️",
    btnLink: "#products-section"
  },
  heroInterval: 4.5,
  heroList: [...DEFAULT_HERO_BANNERS_LIST]
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

    // Populate Hero Carousel Settings
    const heroEnabled = document.getElementById("banner-hero-enabled");
    if (heroEnabled) {
      heroEnabled.checked = (banners.hero?.enabled !== false);
    }

    const heroInterval = document.getElementById("banner-hero-interval");
    if (heroInterval && banners.heroInterval) {
      heroInterval.value = String(banners.heroInterval);
    }

    // Populate Hero Banners List
    if (Array.isArray(banners.heroList) && banners.heroList.length > 0) {
      AdminState.heroBannersList = banners.heroList.map(b => ({
        image: b.image || "assets/banners/banner-main.jpg",
        title: b.title || "",
        link: b.link || "#products-section",
        enabled: b.enabled !== false
      }));
    } else if (banners.hero && banners.hero.image) {
      AdminState.heroBannersList = [{
        image: banners.hero.image,
        title: banners.hero.title || "",
        link: banners.hero.btnLink || "#products-section",
        enabled: true
      }];
    } else {
      AdminState.heroBannersList = [...DEFAULT_HERO_BANNERS_LIST];
    }

    renderHeroBannersManager();
    updateBannerLivePreviews();
  } catch (err) {
    console.error("Error loading banner settings:", err);
  }
}

function renderHeroBannersManager() {
  const container = document.getElementById("hero-banners-list-container");
  if (!container) return;

  if (!AdminState.heroBannersList || AdminState.heroBannersList.length === 0) {
    AdminState.heroBannersList = [...DEFAULT_HERO_BANNERS_LIST];
  }

  const total = AdminState.heroBannersList.length;

  container.innerHTML = AdminState.heroBannersList.map((banner, index) => `
    <div class="admin-banner-item" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:0.9rem; margin-bottom:0.75rem; box-shadow:0 1px 4px rgba(0,0,0,0.03); transition:border-color 0.2s;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.65rem; border-bottom:1px solid #f1f5f9; padding-bottom:0.4rem;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="background:#175349; color:#ffffff; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:12px;">#${index + 1}</span>
          <strong style="font-size:0.88rem; color:#1e293b;">${escapeAdminHtml(banner.title || "بانر إعلاني #" + (index + 1))}</strong>
        </div>
        <div style="display:flex; align-items:center; gap:0.35rem;">
          <button type="button" class="btn-sm" style="background:#f1f5f9; border:none; border-radius:6px; padding:3px 8px; cursor:pointer;" onclick="moveHeroBanner(${index}, -1)" title="تحريك لأعلى" ${index === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>⬆️</button>
          <button type="button" class="btn-sm" style="background:#f1f5f9; border:none; border-radius:6px; padding:3px 8px; cursor:pointer;" onclick="moveHeroBanner(${index}, 1)" title="تحريك لأسفل" ${index === total - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>⬇️</button>
          <button type="button" class="btn-sm" style="background:#fee2e2; color:#ef4444; border:none; border-radius:6px; padding:3px 8px; cursor:pointer;" onclick="removeHeroBanner(${index})" title="حذف هذا البانر">🗑️</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:110px 1fr; gap:0.85rem; align-items:start;">
        <div>
          <div style="width:100%; aspect-ratio:16/9; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; overflow:hidden; display:flex; align-items:center; justify-content:center;">
            <img src="${banner.image || 'assets/banners/banner-main.jpg'}" alt="معاينة" style="width:100%; height:100%; object-fit:contain; display:block;" onerror="this.src='assets/banner.jpg'">
          </div>
          <label style="display:block; text-align:center; background:#f0fdf4; color:#15803d; border:1px dashed #86efac; border-radius:6px; padding:3px; font-size:0.72rem; margin-top:0.35rem; cursor:pointer; font-weight:700;">
            تغيير الصورة ☁️
            <input type="file" accept="image/*" style="display:none;" onchange="handleHeroBannerItemUpload(event, ${index})">
          </label>
        </div>

        <div>
          <div style="margin-bottom:0.4rem;">
            <label style="font-size:0.75rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.15rem;">رابط الصورة (URL أو مسار):</label>
            <input type="text" value="${escapeAdminHtml(banner.image || '')}" onchange="updateHeroBannerField(${index}, 'image', this.value)" style="width:100%; font-size:0.8rem; padding:0.35rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.4rem;">
            <div>
              <label style="font-size:0.75rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.15rem;">عنوان البانر:</label>
              <input type="text" value="${escapeAdminHtml(banner.title || '')}" onchange="updateHeroBannerField(${index}, 'title', this.value)" style="width:100%; font-size:0.8rem; padding:0.35rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px;">
            </div>
            <div>
              <label style="font-size:0.75rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.15rem;">رابط النقر (Link):</label>
              <input type="text" value="${escapeAdminHtml(banner.link || '#products-section')}" onchange="updateHeroBannerField(${index}, 'link', this.value)" style="width:100%; font-size:0.8rem; padding:0.35rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px;">
            </div>
          </div>
          <label style="display:inline-flex; align-items:center; gap:0.4rem; font-size:0.78rem; cursor:pointer; color:#334155;">
            <input type="checkbox" ${banner.enabled !== false ? 'checked' : ''} onchange="updateHeroBannerField(${index}, 'enabled', this.checked)">
            <span>تفعيل هذا البانر في السلايدر</span>
          </label>
        </div>
      </div>
    </div>
  `).join("");
}

function escapeAdminHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addNewHeroBanner() {
  AdminState.heroBannersList.push({
    image: "assets/banners/banner-main.jpg",
    title: "بانر إعلاني جديد 🌟",
    link: "#products-section",
    enabled: true
  });
  renderHeroBannersManager();
  updateBannerLivePreviews();
  showAdminToast("تمت إضافة خانة بانر جديد (يمكنك تعديل الصورة والرابط)");
}

function removeHeroBanner(index) {
  if (AdminState.heroBannersList.length <= 1) {
    alert("يجب أن يحتوي السلايدر على بانر واحد على الأقل.");
    return;
  }
  if (!confirm("هل أنت متأكد من حذف هذا البانر من السلايدر؟")) return;

  AdminState.heroBannersList.splice(index, 1);
  renderHeroBannersManager();
  updateBannerLivePreviews();
  showAdminToast("تم حذف البانر من القائمة");
}

function moveHeroBanner(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= AdminState.heroBannersList.length) return;

  const temp = AdminState.heroBannersList[index];
  AdminState.heroBannersList[index] = AdminState.heroBannersList[target];
  AdminState.heroBannersList[target] = temp;

  renderHeroBannersManager();
  updateBannerLivePreviews();
}

function updateHeroBannerField(index, field, value) {
  if (AdminState.heroBannersList[index]) {
    AdminState.heroBannersList[index][field] = value;
    updateBannerLivePreviews();
  }
}

async function handleHeroBannerItemUpload(e, index) {
  const file = e.target.files[0];
  if (!file) return;

  showAdminToast("جاري تجهيز ورفع صورة البانر...");

  const reader = new FileReader();
  reader.onload = (re) => {
    updateHeroBannerField(index, "image", re.target.result);
    renderHeroBannersManager();
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
        updateHeroBannerField(index, "image", data.url);
        renderHeroBannersManager();
        showAdminToast("✓ تم رفع الصورة إلى Cloudflare R2 بنجاح! ☁️");
        return;
      }
    }
  } catch (err) {
    console.warn("Upload fallback to local preview:", err);
  }
}

function updateBannerLivePreviews() {
  // 1. Top bar preview
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

  // 2. Hero Carousel preview
  const heroEnabled = document.getElementById("banner-hero-enabled")?.checked ?? true;
  const prevHeroContainer = document.getElementById("preview-hero-container");
  const prevHeroImg = document.getElementById("preview-hero-img");
  const prevHeroTitle = document.getElementById("preview-hero-title");
  const prevHeroCounter = document.getElementById("preview-hero-counter");

  if (prevHeroContainer) {
    if (heroEnabled) {
      prevHeroContainer.classList.remove("disabled");
      prevHeroContainer.style.opacity = "1";
    } else {
      prevHeroContainer.classList.add("disabled");
      prevHeroContainer.style.opacity = "0.45";
    }
  }

  const activeBanners = (AdminState.heroBannersList || []).filter(b => b.enabled !== false);
  if (activeBanners.length > 0) {
    const firstBanner = activeBanners[0];
    if (prevHeroImg) prevHeroImg.src = firstBanner.image || "assets/banners/banner-main.jpg";
    if (prevHeroTitle) prevHeroTitle.textContent = firstBanner.title || "وفّرنا لك كل الحلول والأدوات اللي تسهل حياتك 💡";
    if (prevHeroCounter) prevHeroCounter.textContent = `${activeBanners.length} بانرات نشطة`;
  }
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
        image: AdminState.heroBannersList[0]?.image || "assets/banners/banner-main.jpg",
        title: AdminState.heroBannersList[0]?.title || "وفّرنا لك كل الحلول والأدوات اللي تسهل حياتك 💡",
        subtitle: "منتجات ذكية، مبتكرة، ومختارة بعناية لحل مشاكل المنزل والمطبخ والتنظيف اليومية.",
        btnText: "تسوق الحلول الآن 🛍️",
        btnLink: AdminState.heroBannersList[0]?.link || "#products-section"
      },
      heroInterval: parseFloat(document.getElementById("banner-hero-interval")?.value || "4.5"),
      heroList: AdminState.heroBannersList,
      updatedAt: new Date().toISOString()
    };

    if (typeof db !== "undefined" && db) {
      await db.ref("settings/banners").set(bannerData);
    }

    try {
      localStorage.setItem("helha_topbar_banners", JSON.stringify(bannerData.topBar));
    } catch (e) {}

    updateBannerLivePreviews();
    showAdminToast("✓ تم حفظ ونشر إعدادات سلايدر البانرات والعروض في المتجر بنجاح! 📢");
  } catch (err) {
    console.error("Error saving banner settings:", err);
    alert("حدث خطأ أثناء حفظ الإعدادات: " + err.message);
  }
}

function resetBannerSettingsToDefault() {
  if (!confirm("هل أنت متأكد من استعادة البانرات الافتراضية الأربعة للسلايدر؟")) return;

  const topEnabled = document.getElementById("banner-topbar-enabled");
  const topBadge = document.getElementById("banner-topbar-badge");
  const topText = document.getElementById("banner-topbar-text");
  const topExtra = document.getElementById("banner-topbar-extra");

  if (topEnabled) topEnabled.checked = true;
  if (topBadge) topBadge.value = DEFAULT_BANNERS.topBar.badge;
  if (topText) topText.value = DEFAULT_BANNERS.topBar.text;
  if (topExtra) topExtra.value = DEFAULT_BANNERS.topBar.extra;

  const heroEnabled = document.getElementById("banner-hero-enabled");
  if (heroEnabled) heroEnabled.checked = true;

  const heroInterval = document.getElementById("banner-hero-interval");
  if (heroInterval) heroInterval.value = "4.5";

  AdminState.heroBannersList = JSON.parse(JSON.stringify(DEFAULT_HERO_BANNERS_LIST));

  renderHeroBannersManager();
  updateBannerLivePreviews();
  showAdminToast("تم استرجاع البانرات الافتراضية (اضغط حفظ ونشر لاعتمادها)");
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

      if (targetTab === "orders") {
        renderAdminOrders();
      } else if (targetTab === "products") {
        renderAdminProducts();
      } else if (targetTab === "preorders") {
        renderPreordersTable();
      } else if (targetTab === "shipping") {
        renderShippingSettings();
      } else if (targetTab === "coupons") {
        renderCouponsList();
      } else if (targetTab === "visitors") {
        AdminAnalytics.loadVisitors();
      }
    });
  });

  window.switchAdminTab = function(tabName) {
    const btn = document.querySelector(`.sidebar-menu .menu-item button[data-tab="${tabName}"]`);
    if (btn) btn.click();
  };

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

/**
 * 8b. Pre-Orders Management (الطلبات المسبقة)
 */
function updatePreordersBadgeCount() {
  const badge = document.getElementById("preorders-badge-count");
  if (!badge) return;
  const pendingCount = (AdminState.preorders || []).filter(p => p.status !== "notified").length;
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

function filterPreorders(filter) {
  AdminState.currentPreorderFilter = filter;
  const buttons = document.querySelectorAll(".preorder-filter-btn");
  buttons.forEach(btn => {
    if (btn.getAttribute("data-filter") === filter) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderPreordersTable();
}

function renderPreordersTable() {
  const tbody = document.getElementById("admin-preorders-tbody");
  if (!tbody) return;

  const filter = AdminState.currentPreorderFilter || "all";
  const preorders = (AdminState.preorders || []).filter(item => {
    if (filter === "all") return true;
    if (filter === "pending") return item.status !== "notified";
    if (filter === "notified") return item.status === "notified";
    return true;
  });

  if (preorders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
          ${filter === "all" ? "لا توجد أي حجوزات طلب مسبق مسجلة حتى الآن." : "لا توجد طلبات مطابقة لهذا الفلتر."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = preorders.map(item => {
    const isNotified = item.status === "notified";
    const statusBadge = isNotified
      ? `<span class="status-badge" style="background:#dcfce7; color:#15803d; font-weight:700;">تم الإشعار ✅</span>`
      : `<span class="status-badge" style="background:#fef3c7; color:#b45309; font-weight:700;">قيد الانتظار ⏳</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700;">${item.createdAt || "-"}</div>
          ${item.notifiedAt ? `<div style="font-size:0.75rem; color:#15803d; margin-top:2px;">أُشعر في: ${item.notifiedAt.split("T")[0]}</div>` : ""}
        </td>
        <td>
          <strong>${escapeHtml(item.productName || "منتج غير محدد")}</strong>
          ${item.productId ? `<div style="font-size:0.75rem; color:var(--text-muted);">(كود: ${escapeHtml(item.productId)})</div>` : ""}
        </td>
        <td>
          <strong>${escapeHtml(item.customerName || "-")}</strong>
        </td>
        <td>
          <a href="tel:${escapeHtml(item.customerPhone || '')}" dir="ltr" style="font-weight:700; color:var(--primary); text-decoration:none;">${escapeHtml(item.customerPhone || "-")}</a>
        </td>
        <td>
          <div>${escapeHtml(item.governorate || "-")}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(item.address || "")}</div>
        </td>
        <td>
          ${statusBadge}
        </td>
        <td>
          <div style="display:flex; gap:0.4rem; align-items:center;">
            <button class="btn-admin-action" style="background:#25d366; color:#ffffff; font-weight:700; padding:6px 12px; border-radius:6px; display:inline-flex; align-items:center; gap:5px; border:none; cursor:pointer;" onclick="sendWhatsAppPreorderNotification('${item.firebaseKey}')" title="إرسال إشعار توفر المنتج عبر واتساب">
              <span>💬</span>
              <span>إشعار واتساب</span>
            </button>
            <button class="btn-admin-action" style="background:#fee2e2; color:#b91c1c; padding:6px 10px; border-radius:6px; border:none; cursor:pointer;" onclick="deletePreorder('${item.firebaseKey}')" title="حذف الحجز">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function sendWhatsAppPreorderNotification(key) {
  const item = (AdminState.preorders || []).find(p => p.firebaseKey === key || p.id === key);
  if (!item) return;

  // Clean and normalize phone number for WhatsApp
  let phone = (item.customerPhone || "").replace(/\D/g, "");
  if (phone.startsWith("0")) {
    phone = "2" + phone;
  } else if (!phone.startsWith("2") && phone.length === 10) {
    phone = "20" + phone;
  }

  // Construct direct link to product
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/admin\.html.*/i, "");
  const productUrl = `${baseUrl}/product.html?id=${encodeURIComponent(item.productId || "")}`;

  // Message template requested by user:
  // عملينا العزيز عميل متجر حلها نذكركم بتوفر منتج ( اسم المنتج ) 
  // يمكنك الطلب الان من موقعنا
  // رابط مباشر للمنتج 
  // شكراً لثقتكم فى حلها
  // كل مشكلة ليها حلّها مع متجر حِلها
  const prodName = item.productName || "المنتج";
  const message = `عميلنا العزيز عميل متجر حلها، نذكركم بتوفر منتج ( ${prodName} ) 🌟\n\nيمكنك الطلب الآن من موقعنا عبر الرابط المباشر:\n${productUrl}\n\nشكراً لثقتكم فى حلها 💖\nكل مشكلة ليها حلّها مع متجر حِلها 💡`;

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  // Mark status as notified in Firebase
  try {
    if (typeof db !== "undefined" && db && item.firebaseKey) {
      await db.ref(`preorders/${item.firebaseKey}`).update({
        status: "notified",
        notifiedAt: new Date().toISOString()
      });
      showAdminToast("تم تحديث حالة الحجز إلى 'تم الإشعار' ✅ وجاري فتح واتساب...");
    }
  } catch (err) {
    console.error("Error updating preorder status:", err);
  }

  // Open WhatsApp in a new tab
  window.open(waUrl, "_blank");
}

async function deletePreorder(key) {
  if (!confirm("هل أنت متأكد من حذف هذا الحجز المسبق نهائياً؟")) return;
  try {
    if (typeof db !== "undefined" && db && key) {
      await db.ref(`preorders/${key}`).remove();
      showAdminToast("تم حذف الحجز بنجاح 🗑️");
    }
  } catch (err) {
    alert("حدث خطأ أثناء الحذف: " + err.message);
  }
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

/**
 * 13. Customer Messages & Support Inquiries Management
 */
function initMessagesListener() {
  if (typeof db === "undefined" || !db) return;
  db.ref("messages").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      AdminState.messages = Object.keys(data).map(key => ({
        ...data[key],
        id: key
      })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else {
      AdminState.messages = [];
    }
    renderAdminMessages();
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAdminMessages() {
  const tbody = document.getElementById("admin-messages-tbody");
  const countBadge = document.getElementById("messages-count-badge");
  if (!tbody) return;

  const msgs = AdminState.messages || [];
  if (countBadge) {
    countBadge.textContent = `${msgs.length} رسالة واردة`;
  }

  if (msgs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
          📭 لا توجد رسائل واردة حالياً. ستظهر هنا أي رسائل أو تذاكر يرسلها العملاء من صفحتي اتصل بنا والدعم الفني.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = msgs.map(m => {
    const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleString("ar-EG") : (m.createdAt ? new Date(m.createdAt).toLocaleString("ar-EG") : "غير محدد");
    const name = escapeHtml(m.name || "مجهول");
    const phone = escapeHtml(m.phone || "—");
    const address = escapeHtml(m.address || m.governorate || "—");
    const subject = escapeHtml(m.subject || "استفسار");
    const message = escapeHtml(m.message || m.details || "");
    const orderInfo = m.orderId ? `<div style="font-size:0.75rem; color:#0284c7; margin-top:2px;">طلب: #${escapeHtml(m.orderId)}</div>` : "";

    return `
      <tr>
        <td style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">${dateStr}</td>
        <td>
          <strong>${name}</strong>
          ${orderInfo}
        </td>
        <td style="direction:ltr; text-align:right; font-weight:700;">${phone}</td>
        <td>${address}</td>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:0.8rem; padding:4px 8px; border-radius:4px;">${subject}</span></td>
        <td style="max-width:320px; white-space:pre-wrap; font-size:0.85rem; line-height:1.5;">${message}</td>
        <td>
          <button class="btn-admin-action" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; padding:5px 10px; border-radius:6px; cursor:pointer;" onclick="deleteAdminMessage('${m.id}')" title="حذف الرسالة">
            🗑️ حذف
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

async function deleteAdminMessage(msgId) {
  if (!confirm("هل أنت متأكد من رغبتك في حذف هذه الرسالة من قاعدة البيانات؟")) return;
  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`messages/${msgId}`).remove();
      showAdminToast("تم حذف الرسالة بنجاح 🗑️");
    }
  } catch (err) {
    console.error("Error deleting message:", err);
    alert("تعذر حذف الرسالة");
  }
}

window.deleteAdminMessage = deleteAdminMessage;

// ==========================================================================
// 14. Realtime Order Notifications & Sound & Badges
// ==========================================================================
function updateOrdersBadgeCount() {
  const badge = document.getElementById("orders-badge-count");
  if (!badge) return;
  const newOrders = AdminState.orders.filter(o => o.status === "new" || !o.status).length;
  if (newOrders > 0) {
    badge.textContent = newOrders;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

function playOrderNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Tone 1 (659.25Hz - E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.4);

    // Tone 2 (880Hz - A5) with slight delay for pleasant chime
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, ctx.currentTime);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.7);
      } catch (e) {}
    }, 140);
  } catch (err) {
    console.warn("Audio notification not supported or blocked by browser:", err);
  }
}

function showOrderNotificationToast(order, diff) {
  const customer = order ? (order.customerName || "عميل") : "عميل";
  const amount = order ? (order.totalAmount || 0) : 0;
  const id = order ? (order.orderId || order.id || "") : "";
  const msg = diff > 1
    ? `🔔 وصل ${diff} طلبات جديدة الآن في المتجر!`
    : `🔔 طلب جديد وارد! #${id} من "${customer}" بقيمة ${amount} ج.م 🚚`;
  showAdminToast(msg);

  // Browser desktop notification if supported and granted
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("طلب شراء جديد - متجر حِلها! 🛒", {
      body: `طلب #${id} من ${customer} بقيمة ${amount} ج.م`,
      icon: "assets/icon-192.png"
    });
  } else if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// ==========================================================================
// 15. Shipping Fees & Governorates Rates Management
// ==========================================================================
const EGYPT_GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "الشرقية", "القليوبية",
  "المنوفية", "الغربية", "كفر الشيخ", "البحيرة", "دمياط", "بورسعيد",
  "الإسماعيلية", "السويس", "الفيوم", "بني سويف", "المنيا", "أسيوط",
  "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "شمال سيناء",
  "جنوب سيناء", "الوادي الجديد", "مطروح"
];

function initShippingListener() {
  if (typeof db === "undefined" || !db) {
    renderShippingSettings();
    return;
  }

  db.ref("settings/shipping").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      AdminState.shippingSettings = {
        freeShippingEnabled: data.freeShippingEnabled !== false,
        freeShippingThreshold: Number(data.freeShippingThreshold) || 1000,
        mode: data.mode || "flat",
        flatRate: Number(data.flatRate) || 50,
        govRates: data.govRates || {}
      };
    }
    renderShippingSettings();
  });
}

function renderShippingSettings() {
  const s = AdminState.shippingSettings;
  const freeCheck = document.getElementById("shipping-free-enabled");
  const freeThreshold = document.getElementById("shipping-free-threshold");
  const flatRateInput = document.getElementById("shipping-flat-rate");
  const govRatesContainer = document.getElementById("gov-rates-list");

  if (freeCheck) freeCheck.checked = s.freeShippingEnabled !== false;
  if (freeThreshold) freeThreshold.value = s.freeShippingThreshold || 1000;
  if (flatRateInput) flatRateInput.value = s.flatRate || 50;

  selectShippingMode(s.mode || "flat");

  if (govRatesContainer) {
    govRatesContainer.innerHTML = EGYPT_GOVERNORATES.map(gov => {
      const rate = (s.govRates && s.govRates[gov] !== undefined) ? s.govRates[gov] : (s.flatRate || 50);
      return `
        <div class="gov-rate-item">
          <span>${gov}</span>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" class="gov-rate-input" data-gov="${gov}" value="${rate}" min="0" step="5">
            <small style="font-weight:700; color:var(--text-muted);">ج.م</small>
          </div>
        </div>
      `;
    }).join("");
  }
}

function selectShippingMode(mode) {
  AdminState.shippingSettings.mode = mode;

  const cardFlat = document.getElementById("card-mode-flat");
  const cardPerGov = document.getElementById("card-mode-per-gov");
  const flatBox = document.getElementById("shipping-flat-container");
  const perGovBox = document.getElementById("shipping-per-gov-container");
  const radioFlat = document.getElementById("radio-mode-flat");
  const radioPerGov = document.getElementById("radio-mode-per-gov");

  if (mode === "flat") {
    if (cardFlat) cardFlat.classList.add("selected");
    if (cardPerGov) cardPerGov.classList.remove("selected");
    if (flatBox) flatBox.style.display = "block";
    if (perGovBox) perGovBox.style.display = "none";
    if (radioFlat) radioFlat.checked = true;
  } else {
    if (cardFlat) cardFlat.classList.remove("selected");
    if (cardPerGov) cardPerGov.classList.add("selected");
    if (flatBox) flatBox.style.display = "none";
    if (perGovBox) perGovBox.style.display = "block";
    if (radioPerGov) radioPerGov.checked = true;
  }
}

function applyBulkGovRate() {
  const bulkInput = document.getElementById("bulk-gov-rate");
  if (!bulkInput || !bulkInput.value) {
    alert("يرجى إدخال قيمة السعر الموحد أولاً!");
    return;
  }
  const val = Number(bulkInput.value);
  const inputs = document.querySelectorAll(".gov-rate-input");
  inputs.forEach(inp => {
    inp.value = val;
  });
  showAdminToast(`تم تطبيق سعر ${val} ج.م على كافة المحافظات الـ 27 📍`);
}

async function saveShippingSettings() {
  const freeCheck = document.getElementById("shipping-free-enabled");
  const freeThreshold = document.getElementById("shipping-free-threshold");
  const flatRateInput = document.getElementById("shipping-flat-rate");
  const mode = AdminState.shippingSettings.mode || "flat";

  const govRates = {};
  const inputs = document.querySelectorAll(".gov-rate-input");
  inputs.forEach(inp => {
    const gov = inp.getAttribute("data-gov");
    if (gov) {
      govRates[gov] = Number(inp.value) || 0;
    }
  });

  const payload = {
    freeShippingEnabled: freeCheck ? freeCheck.checked : true,
    freeShippingThreshold: freeThreshold ? (Number(freeThreshold.value) || 1000) : 1000,
    mode: mode,
    flatRate: flatRateInput ? (Number(flatRateInput.value) || 50) : 50,
    govRates: govRates,
    updatedAt: new Date().toISOString()
  };

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref("settings/shipping").set(payload);
      showAdminToast("تم حفظ ونشر إعدادات الشحن بنجاح في المتجر! 🚚");
    }
  } catch (err) {
    alert("خطأ أثناء حفظ إعدادات الشحن: " + err.message);
  }
}

// ==========================================================================
// 16. Coupons & Discount Codes Management & Analytics
// ==========================================================================
function initCouponsListener() {
  if (typeof db === "undefined" || !db) {
    renderCouponsList();
    return;
  }

  db.ref("coupons").on("value", (snap) => {
    const data = snap.val();
    if (data) {
      AdminState.coupons = Object.keys(data).map(key => ({
        ...data[key],
        code: key
      }));
    } else {
      AdminState.coupons = [];
    }
    renderCouponsList();
  });
}

function renderCouponsList() {
  const tbody = document.getElementById("admin-coupons-tbody");
  if (!tbody) return;

  const coupons = AdminState.coupons || [];
  if (coupons.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
          🎟️ لا توجد أكواد خصم حالياً. اضغط على زر "إضافة كود خصم جديد" بالأعلى لإنشاء أول كود.
        </td>
      </tr>
    `;
    return;
  }

  const now = new Date().getTime();

  tbody.innerHTML = coupons.map(c => {
    const isExpired = c.expiryDate ? (new Date(c.expiryDate).getTime() < now) : false;
    const isLimitReached = (c.usageLimit > 0) && ((c.usedCount || 0) >= c.usageLimit);
    
    let statusBadge = "";
    if (c.status === "disabled") {
      statusBadge = `<span class="status-badge coupon-status-disabled">معطّل ⚪</span>`;
    } else if (isExpired) {
      statusBadge = `<span class="status-badge coupon-status-expired">منتهي الصلاحية 🔴</span>`;
    } else if (isLimitReached) {
      statusBadge = `<span class="status-badge coupon-status-expired">اكتمل الحد 🔴</span>`;
    } else {
      statusBadge = `<span class="status-badge coupon-status-active">نشط وفعّال 🟢</span>`;
    }

    const typeLabel = c.type === "fixed" ? `${c.value} ج.م` : `${c.value}%`;
    const minOrderText = c.minOrder > 0 ? `${c.minOrder} ج.م` : "بدون حد";
    const expiryText = c.expiryDate ? new Date(c.expiryDate).toLocaleString("ar-EG") : "مفتوح (بدون انتهاء)";
    const usageText = c.usageLimit > 0 ? `${c.usedCount || 0} / ${c.usageLimit}` : `${c.usedCount || 0} / غير محدود`;
    const totalDiscountAmount = c.totalDiscountGiven || 0;

    return `
      <tr>
        <td><span class="coupon-tag-badge">🎟️ ${c.code}</span></td>
        <td><strong>${typeLabel}</strong> <small style="color:var(--text-muted);">${c.type === 'fixed' ? 'خصم مالي' : 'نسبة مئوية'}</small></td>
        <td>${minOrderText}</td>
        <td style="font-size:0.85rem; color:var(--text-muted);">${expiryText}</td>
        <td><span class="coupon-stat-pill">👥 ${usageText}</span></td>
        <td><strong style="color:#16a34a;">${totalDiscountAmount} ج.م</strong></td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:0.4rem; align-items:center;">
            <button class="btn-admin-action" style="background:#eff6ff; color:#1d4ed8; padding:4px 8px; font-size:0.8rem;" onclick="viewCouponAnalytics('${c.code}')" title="عرض إحصائيات من استخدم الكود">
              📊 المستخدمين
            </button>
            <button class="btn-admin-action" style="background:${c.status === 'disabled' ? '#dcfce7' : '#f1f5f9'}; color:${c.status === 'disabled' ? '#15803d' : '#475569'}; padding:4px 8px; font-size:0.8rem;" onclick="toggleCouponStatus('${c.code}')" title="تفعيل أو تعطيل الكود">
              ${c.status === 'disabled' ? 'تفعيل' : 'تعطيل'}
            </button>
            <button class="btn-admin-action btn-danger-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteCoupon('${c.code}')" title="حذف الكود نهائياً">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openAddCouponModal() {
  const form = document.getElementById("coupon-form");
  if (form) form.reset();
  const title = document.getElementById("coupon-modal-title");
  if (title) title.textContent = "➕ إنشاء كود خصم جديد";
  const codeInp = document.getElementById("coupon-code");
  if (codeInp) codeInp.readOnly = false;
  updateCouponUnitLabel();
  document.getElementById("coupon-modal").classList.add("active");
}

function closeCouponModal() {
  document.getElementById("coupon-modal").classList.remove("active");
}

function updateCouponUnitLabel() {
  const typeSelect = document.getElementById("coupon-type");
  const label = document.getElementById("coupon-unit-label");
  if (typeSelect && label) {
    label.textContent = typeSelect.value === "fixed" ? "ج.م" : "%";
  }
}

async function handleSaveCoupon(e) {
  e.preventDefault();

  const code = document.getElementById("coupon-code").value.trim().toUpperCase();
  const type = document.getElementById("coupon-type").value;
  const value = Number(document.getElementById("coupon-value").value) || 0;
  const minOrder = Number(document.getElementById("coupon-min-order").value) || 0;
  const usageLimit = Number(document.getElementById("coupon-usage-limit").value) || 0;
  const expiry = document.getElementById("coupon-expiry").value || null;
  const status = document.getElementById("coupon-status").value || "active";

  if (!code || value <= 0) {
    alert("يرجى ملء كود الخصم وتحديد قيمة صحيحة للخصم!");
    return;
  }

  // Find if already exists to preserve usage statistics
  const existing = AdminState.coupons.find(c => c.code === code);
  const usedCount = existing ? (existing.usedCount || 0) : 0;
  const totalDiscountGiven = existing ? (existing.totalDiscountGiven || 0) : 0;
  const usages = existing ? (existing.usages || {}) : {};

  const couponData = {
    code: code,
    type: type,
    value: value,
    minOrder: minOrder,
    usageLimit: usageLimit,
    expiryDate: expiry,
    status: status,
    usedCount: usedCount,
    totalDiscountGiven: totalDiscountGiven,
    usages: usages,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`coupons/${code}`).set(couponData);
      showAdminToast(`تم حفظ وتفعيل كود الخصم "${code}" بنجاح! 🎟️`);
      closeCouponModal();
    }
  } catch (err) {
    alert("خطأ أثناء حفظ كود الخصم: " + err.message);
  }
}

async function toggleCouponStatus(code) {
  const coupon = AdminState.coupons.find(c => c.code === code);
  if (!coupon) return;
  const newStatus = coupon.status === "disabled" ? "active" : "disabled";

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`coupons/${code}/status`).set(newStatus);
      showAdminToast(`تم تغيير حالة الكود "${code}" إلى "${newStatus === 'active' ? 'مفعّل 🟢' : 'معطّل ⚪'}"`);
    }
  } catch (err) {
    alert("خطأ أثناء تحديث حالة الكود: " + err.message);
  }
}

async function deleteCoupon(code) {
  if (!confirm(`⚠️ هل أنت متأكد من حذف كود الخصم "${code}" نهائياً من المتجر؟`)) {
    return;
  }

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref(`coupons/${code}`).remove();
      showAdminToast(`تم حذف كود الخصم "${code}" نهائياً 🗑️`);
    }
  } catch (err) {
    alert("خطأ أثناء حذف الكود: " + err.message);
  }
}

function viewCouponAnalytics(code) {
  const coupon = AdminState.coupons.find(c => c.code === code);
  if (!coupon) return;

  const modal = document.getElementById("coupon-analytics-modal");
  const title = document.getElementById("coupon-analytics-title");
  const usesEl = document.getElementById("analytics-total-uses");
  const discEl = document.getElementById("analytics-total-discount");
  const salesEl = document.getElementById("analytics-total-sales");
  const tbody = document.getElementById("coupon-users-tbody");

  if (title) title.textContent = `📊 سجل وإحصائيات كود الخصم: #${coupon.code}`;

  // Gather usages either from coupon.usages object or scanning orders with this coupon
  let usageList = [];
  if (coupon.usages) {
    usageList = Object.keys(coupon.usages).map(k => coupon.usages[k]);
  }

  // Also include any orders that recorded this coupon
  AdminState.orders.forEach(o => {
    if (o.couponCode && o.couponCode.toUpperCase() === coupon.code.toUpperCase()) {
      if (!usageList.some(u => String(u.orderId) === String(o.orderId || o.id))) {
        usageList.push({
          orderId: o.orderId || o.id,
          customerName: o.customerName || "-",
          customerPhone: o.customerPhone || "-",
          discountAmount: o.discountAmount || 0,
          totalAmount: o.totalAmount || 0,
          usedAt: o.createdAt || "-"
        });
      }
    }
  });

  const totalUses = usageList.length || (coupon.usedCount || 0);
  const totalDiscount = usageList.reduce((sum, u) => sum + (Number(u.discountAmount) || 0), 0) || (coupon.totalDiscountGiven || 0);
  const totalSales = usageList.reduce((sum, u) => sum + (Number(u.totalAmount) || 0), 0);

  if (usesEl) usesEl.textContent = totalUses;
  if (discEl) discEl.textContent = `${totalDiscount.toLocaleString("ar-EG")} ج.م`;
  if (salesEl) salesEl.textContent = `${totalSales.toLocaleString("ar-EG")} ج.م`;

  if (tbody) {
    if (usageList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">لم يتم استخدام هذا الكود في أي طلب حتى الآن</td></tr>`;
    } else {
      tbody.innerHTML = usageList.map(u => {
        const cleanPhone = (u.customerPhone || "").replace(/\D/g, "");
        const waLink = cleanPhone ? `https://wa.me/2${cleanPhone}` : "#";
        return `
          <tr>
            <td><strong>#${u.orderId || "-"}</strong></td>
            <td><strong>${u.customerName || "-"}</strong></td>
            <td><a href="${waLink}" target="_blank" style="color:#16a34a; font-weight:700;">💬 ${u.customerPhone || "-"}</a></td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${u.usedAt || "-"}</td>
            <td><strong style="color:#16a34a;">-${u.discountAmount || 0} ج.م</strong></td>
            <td><strong>${u.totalAmount || 0} ج.م</strong></td>
          </tr>
        `;
      }).join("");
    }
  }

  modal.classList.add("active");
}

function closeCouponAnalyticsModal() {
  document.getElementById("coupon-analytics-modal").classList.remove("active");
}

// Window exports for HTML onclick handlers
window.updateOrdersBadgeCount = updateOrdersBadgeCount;
window.playOrderNotificationSound = playOrderNotificationSound;
window.selectShippingMode = selectShippingMode;
window.applyBulkGovRate = applyBulkGovRate;
window.saveShippingSettings = saveShippingSettings;
window.openAddCouponModal = openAddCouponModal;
window.closeCouponModal = closeCouponModal;
window.updateCouponUnitLabel = updateCouponUnitLabel;
window.handleSaveCoupon = handleSaveCoupon;
window.toggleCouponStatus = toggleCouponStatus;
window.deleteCoupon = deleteCoupon;
window.viewCouponAnalytics = viewCouponAnalytics;
window.closeCouponAnalyticsModal = closeCouponAnalyticsModal;
window.deleteAdminOrder = deleteAdminOrder;

/**
 * 12. Advanced Visitors Analytics Management
 */
const AdminAnalytics = {
  visitors: [],
  logs: [],

  init() {
    this.loadVisitors();
  },

  onAnalyticsUpdated(analytics) {
    if (analytics && analytics.visitors) {
      this.visitors = Object.keys(analytics.visitors).map(k => analytics.visitors[k]);
    }
    if (analytics && analytics.visitorLogs) {
      this.logs = Object.keys(analytics.visitorLogs)
        .map(k => analytics.visitorLogs[k])
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    this.renderStats();
    this.filterVisitors();
  },

  loadVisitors() {
    if (typeof db === "undefined" || !db) return;
    
    // Fetch visitors cards
    db.ref("analytics/visitors").once("value", (snap) => {
      const val = snap.val();
      this.visitors = val ? Object.keys(val).map(k => val[k]) : [];
      this.renderStats();
      this.filterVisitors();
    });

    // Fetch chronological logs
    db.ref("analytics/visitorLogs").limitToLast(200).once("value", (snap) => {
      const val = snap.val();
      this.logs = val ? Object.keys(val).map(k => val[k]).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : [];
      this.filterVisitors();
    });
  },

  renderStats() {
    const totalEl = document.getElementById("vis-stat-total");
    const uniqueEl = document.getElementById("vis-stat-unique");
    const todayEl = document.getElementById("vis-stat-today");
    const mobilePctEl = document.getElementById("vis-stat-mobile-pct");

    const total = AdminState.analytics.totalVisits || this.logs.length || 0;
    const unique = this.visitors.length || new Set(this.logs.map(l => l.vid || l.ip)).size || 0;
    const today = AdminState.analytics.todayVisits || 0;

    let mobileCount = 0;
    const sourceList = this.logs.length > 0 ? this.logs : this.visitors;
    sourceList.forEach(item => {
      const dev = (item.deviceType || "").toLowerCase();
      if (dev.includes("هاتف") || dev.includes("mobile")) {
        mobileCount++;
      }
    });
    const mobilePct = sourceList.length > 0 ? Math.round((mobileCount / sourceList.length) * 100) : 0;

    if (totalEl) totalEl.textContent = total.toLocaleString("ar-EG");
    if (uniqueEl) uniqueEl.textContent = unique.toLocaleString("ar-EG");
    if (todayEl) todayEl.textContent = today.toLocaleString("ar-EG");
    if (mobilePctEl) mobilePctEl.textContent = `${mobilePct}%`;
  },

  filterVisitors() {
    const search = (document.getElementById("vis-search-input")?.value || "").trim().toLowerCase();
    const deviceFilter = document.getElementById("vis-device-filter")?.value || "all";

    let list = this.logs.length > 0 ? [...this.logs] : [...this.visitors];

    if (search) {
      list = list.filter(item => {
        const ip = (item.ip || "").toLowerCase();
        const city = (item.city || "").toLowerCase();
        const region = (item.region || "").toLowerCase();
        const country = (item.country || "").toLowerCase();
        const os = (item.os || "").toLowerCase();
        const browser = (item.browser || "").toLowerCase();
        const page = (item.page || item.lastPage || "").toLowerCase();
        return ip.includes(search) || city.includes(search) || region.includes(search) ||
               country.includes(search) || os.includes(search) || browser.includes(search) || page.includes(search);
      });
    }

    if (deviceFilter !== "all") {
      list = list.filter(item => {
        const dev = (item.deviceType || "").toLowerCase();
        if (deviceFilter === "mobile") return dev.includes("هاتف") || dev.includes("mobile");
        if (deviceFilter === "desktop") return dev.includes("كمبيوتر") || dev.includes("desktop");
        if (deviceFilter === "tablet") return dev.includes("لوحي") || dev.includes("tablet");
        return true;
      });
    }

    this.renderVisitorsTable(list);
  },

  renderVisitorsTable(list) {
    const tbody = document.getElementById("admin-visitors-tbody");
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
            <div style="font-size:2rem; margin-bottom:0.5rem;">👥</div>
            <strong>لا توجد زيارات مسجلة تطابق البحث حالياً</strong>
            <p style="font-size:0.85rem; margin-top:0.3rem;">سيتم تسجيل بيانات أي زائر جديد فور تصفحه للمتجر مباشرة.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const country = item.country || "مصر";
      const flag = item.flag || (country.includes("مصر") || country.toLowerCase().includes("egypt") ? "🇪🇬" : "🌐");
      const location = [item.city, item.region].filter(Boolean).join("، ") || "القاهرة";
      const ip = item.ip || "156.197.x.x";
      const device = item.deviceType || "هاتف محمول 📱";
      const osAndBrowser = [item.os, item.browser].filter(Boolean).join(" • ") || "Chrome";
      const visitsCount = item.visitsCount || 1;
      const page = item.page || item.lastPage || "الرئيسية";
      
      const timeStr = item.timestamp || item.lastVisit ? 
        new Date(item.timestamp || item.lastVisit).toLocaleString("ar-EG", {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        }) : "الآن";

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.4rem; font-weight:700;">
              <span style="font-size:1.25rem;">${flag}</span>
              <span>${country}</span>
            </div>
          </td>
          <td>
            <div style="font-weight:700; color:var(--text-main);">${location}</div>
          </td>
          <td>
            <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700; color:#0f172a; font-size:0.85rem; direction:ltr; display:inline-block;">
              ${ip}
            </code>
          </td>
          <td>
            <div style="font-weight:700; color:#1e293b;">${device}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${osAndBrowser}</div>
          </td>
          <td>
            <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:800; padding:3px 9px; border-radius:999px;">
              ${visitsCount} ${visitsCount === 1 ? 'زيارة' : 'زيارات'}
            </span>
          </td>
          <td>
            <div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.82rem; color:var(--text-muted);" title="${page}">
              ${page}
            </div>
          </td>
          <td>
            <span style="font-size:0.82rem; color:var(--text-muted);">${timeStr}</span>
          </td>
        </tr>
      `;
    }).join("");
  }
};

window.AdminAnalytics = AdminAnalytics;

