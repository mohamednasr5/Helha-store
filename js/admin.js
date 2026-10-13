/**
 * Helha (حِلها) Admin Dashboard Logic
 * Full control over products, orders, Telegram bot, analytics, and settings
 */

const AdminState = {
  products: [],
  orders: [],
  analytics: {},
  settings: {},
  categories: [],
  messages: [],
  currentProductCategoryFilter: "all",
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

  // 4. Load Settings & Categories & Messages
  initCategoriesListener();
  initMessagesListener();
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

function openAddProductModal() {
  AdminState.editingProductId = null;
  document.getElementById("product-modal-title").textContent = "إضافة منتج جديد لحِلها";
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-subtitle").value = "";
  document.getElementById("prod-category").value = AdminState.categories?.[0]?.id || "kitchen";
  document.getElementById("prod-price").value = "";
  document.getElementById("prod-original-price").value = "";
  document.getElementById("prod-badge").value = "";
  document.getElementById("prod-stock").value = "50";
  document.getElementById("prod-desc").value = "";
  document.getElementById("prod-features").value = "";
  document.getElementById("prod-image-url").value = "";

  // Reset offers container
  const offersContainer = document.getElementById("prod-offers-container");
  if (offersContainer) offersContainer.innerHTML = "";
  
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

  // Populate offers
  const offersContainer = document.getElementById("prod-offers-container");
  if (offersContainer) {
    offersContainer.innerHTML = "";
    if (prod.offers && prod.offers.length > 0) {
      prod.offers.forEach(off => addOfferRow(off));
    }
  }

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
    stockCount: stockCount,
    description: description,
    features: features,
    image: imageUrl || "assets/logo.jpg",
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
