/**
 * Helha (حِلها) E-Commerce Store - Frontend Application Logic
 */

// Application State
const AppState = {
  products: [],
  cart: [],
  currentCategory: "all",
  searchQuery: "",
  shippingFee: 35,
  freeShippingThreshold: 500,
  activeProductModal: null,
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  initFirebaseProducts();
  trackVisitor();
  setupEventListeners();
  updateCartUI();
  initBannersListener();
  initStoreCategories();
});

/**
 * 1. Initialize and Sync Products from Firebase Realtime Database
 */
function initFirebaseProducts() {
  const grid = document.getElementById("products-grid");
  if (!grid) return;

  grid.innerHTML = `
    <div class="empty-state" style="grid-column: 1/-1;">
      <div class="empty-state-icon">⏳</div>
      <h3>جاري تحميل المنتجات...</h3>
      <p>لحظات ويتم تجهيز أحدث الحلول والأدوات من متجر حِلها</p>
    </div>
  `;

  if (typeof db !== "undefined" && db) {
    const productsRef = db.ref("products");

    // Real-time listener for products
    productsRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object of objects or array to array
        AppState.products = Object.keys(data).map((key) => ({
          ...data[key],
          firebaseKey: key,
          id: data[key].id || key
        }));
      } else {
        // First-time setup: Seed Firebase with demo products so user has instant data
        seedInitialDemoProducts();
        AppState.products = [...DEMO_PRODUCTS];
      }
      renderProducts();
    }, (error) => {
      console.warn("Firebase read error, falling back to local demo products:", error);
      AppState.products = [...DEMO_PRODUCTS];
      renderProducts();
    });
  } else {
    // Fallback if offline or Firebase not yet connected
    AppState.products = [...DEMO_PRODUCTS];
    renderProducts();
  }
}

/**
 * Seed initial demo products into Firebase
 */
async function seedInitialDemoProducts() {
  if (typeof db !== "undefined" && db) {
    try {
      const updates = {};
      DEMO_PRODUCTS.forEach((prod) => {
        updates[`products/${prod.id}`] = prod;
      });
      // Also seed default admin password if not set
      const pwdSnap = await db.ref("settings/adminPassword").once("value");
      if (!pwdSnap.exists()) {
        const defaultHash = typeof DEFAULT_ADMIN_PASSWORD_HASH !== "undefined" ? DEFAULT_ADMIN_PASSWORD_HASH : "64533647a5d1df6de07cdc1a3a51f4c0fcbb35fffd51b5c38f32c949e24a210c";
        updates["settings/adminPassword"] = defaultHash;
      }
      await db.ref().update(updates);
      console.log("🌱 Initial demo products seeded into Firebase.");
    } catch (e) {
      console.error("Error seeding demo products:", e);
    }
  }
}

/**
 * 2. Render Products Grid based on Category & Search
 */
function renderProducts() {
  const grid = document.getElementById("products-grid");
  if (!grid) return;

  const q = normalizeArabic(AppState.searchQuery);

  const filtered = AppState.products.filter((p) => {
    // Category match
    const matchCat =
      AppState.currentCategory === "all" ||
      p.category === AppState.currentCategory ||
      (AppState.currentCategory === "deals" && p.originalPrice > p.price);

    // Search query match with Arabic normalization
    const matchSearch =
      !q ||
      normalizeArabic(p.name).includes(q) ||
      normalizeArabic(p.subtitle).includes(q) ||
      normalizeArabic(p.description).includes(q) ||
      normalizeArabic(p.categoryName || getCategoryArabicName(p.category)).includes(q);

    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>لم نجد أي منتجات تطابق بحثك</h3>
        <p>جرب البحث بكلمات أخرى أو تصفح باقي الأقسام</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((prod) => createProductCardHTML(prod)).join("");
}

/**
 * Create Single Product Card HTML
 */
function createProductCardHTML(prod) {
  const discountPercent =
    prod.originalPrice && prod.originalPrice > prod.price
      ? Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100)
      : null;

  return `
    <article class="product-card" data-id="${prod.id}">
      <div class="product-thumb" onclick="window.location.href='product.html?id=${prod.id}'">
        ${prod.badge ? `<span class="product-badge">${prod.badge}</span>` : ""}
        ${discountPercent && !prod.badge ? `<span class="product-badge">خصم ${discountPercent}%</span>` : ""}
        ${prod.isDemo ? `<span class="badge-demo">تجريبي</span>` : ""}
        <img src="${prod.image || 'assets/logo.jpg'}" alt="${prod.name}" loading="lazy" onerror="this.src='assets/logo.jpg'">
      </div>

      <div class="product-details">
        <div class="product-category-tag">${prod.categoryName || getCategoryArabicName(prod.category)}</div>
        <h4 class="product-title" onclick="window.location.href='product.html?id=${prod.id}'" title="${prod.name}">${prod.name}</h4>
        <p class="product-subtitle">${prod.subtitle || ""}</p>
        
        <div class="product-meta">
          <span class="product-rating">★ ${prod.rating || "4.8"}</span>
          <span>(${prod.reviewsCount || 45} تقييم)</span>
        </div>

        <div class="product-price-row">
          <div class="price-box">
            <span class="current-price">${prod.price} <small>ج.م</small></span>
            ${prod.originalPrice ? `<span class="old-price">${prod.originalPrice} ج.م</span>` : ""}
          </div>
          <span class="stock-tag">متوفر بالمخزن</span>
        </div>

        <div class="product-actions" style="grid-template-columns: 1fr;">
          <a href="product.html?id=${prod.id}" class="btn-buy-now" style="text-decoration:none; padding:0.65rem 1rem; font-size:0.95rem; border-radius:8px;">
            <span>اضغط هنا للشراء 🚚</span>
          </a>
        </div>
      </div>
    </article>
  `;
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

/**
 * 3. Shopping Cart Logic
 */
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem("helha_cart");
    if (saved) {
      AppState.cart = JSON.parse(saved);
    }
  } catch (e) {
    AppState.cart = [];
  }
}

function saveCartToStorage() {
  localStorage.setItem("helha_cart", JSON.stringify(AppState.cart));
  updateCartUI();
}

function addToCart(productId, qty = 1) {
  const product = AppState.products.find((p) => String(p.id) === String(productId));
  if (!product) return;

  const existing = AppState.cart.find((item) => String(item.id) === String(productId));
  if (existing) {
    existing.quantity += qty;
  } else {
    AppState.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || "assets/logo.jpg",
      quantity: qty
    });
  }

  saveCartToStorage();
  showToast(`تمت إضافة "${product.name}" إلى السلة 🛍️`);
  openCartDrawer();
}

function updateCartItemQty(productId, delta) {
  const item = AppState.cart.find((i) => String(i.id) === String(productId));
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(productId);
    return;
  }
  saveCartToStorage();
}

function removeFromCart(productId) {
  AppState.cart = AppState.cart.filter((i) => String(i.id) !== String(productId));
  saveCartToStorage();
  showToast("تم حذف المنتج من السلة");
}

function getCartSubtotal() {
  return AppState.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateCartUI() {
  const badge = document.getElementById("cart-badge");
  const countSpan = document.getElementById("cart-items-count");
  const drawerBody = document.getElementById("cart-drawer-body");
  const subtotalEl = document.getElementById("cart-subtotal");
  const shippingEl = document.getElementById("cart-shipping");
  const totalEl = document.getElementById("cart-total");
  const freeShipBar = document.getElementById("free-shipping-text");
  const freeShipProgress = document.getElementById("free-shipping-progress-fill");

  const totalCount = AppState.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (badge) badge.textContent = totalCount;
  if (countSpan) countSpan.textContent = totalCount;
  const mobBadge = document.getElementById("mobile-cart-badge");
  if (mobBadge) {
    mobBadge.textContent = totalCount;
    mobBadge.style.display = totalCount > 0 ? "flex" : "none";
  }

  const subtotal = getCartSubtotal();
  const isFreeShipping = subtotal >= AppState.freeShippingThreshold && subtotal > 0;
  const currentShipping = subtotal > 0 ? (isFreeShipping ? 0 : AppState.shippingFee) : 0;
  const grandTotal = subtotal + currentShipping;

  if (subtotalEl) subtotalEl.textContent = `${subtotal} ج.م`;
  if (shippingEl) shippingEl.textContent = isFreeShipping ? "شحن مجاني 🎉" : `${currentShipping} ج.م`;
  if (totalEl) totalEl.textContent = `${grandTotal} ج.م`;

  // Free shipping progress bar
  if (freeShipBar && freeShipProgress) {
    if (subtotal === 0) {
      freeShipBar.textContent = `أضف منتجات بقيمة ${AppState.freeShippingThreshold} ج.م للحصول على شحن مجاني! 🚚`;
      freeShipProgress.style.width = "0%";
    } else if (isFreeShipping) {
      freeShipBar.textContent = `مبروك! حصلت على شحن مجاني بالكامل! 🎁🎉`;
      freeShipProgress.style.width = "100%";
    } else {
      const remaining = AppState.freeShippingThreshold - subtotal;
      const pct = Math.min(100, Math.round((subtotal / AppState.freeShippingThreshold) * 100));
      freeShipBar.textContent = `أضف بقيمة ${remaining} ج.م أخرى لتفعيل الشحن المجاني! ⚡`;
      freeShipProgress.style.width = `${pct}%`;
    }
  }

  // Render items list
  if (drawerBody) {
    if (AppState.cart.length === 0) {
      drawerBody.innerHTML = `
        <div class="empty-state" style="border:none; padding: 3rem 1rem;">
          <div class="empty-state-icon">🛒</div>
          <h3>سلتك فارغة حالياً</h3>
          <p>تصفح أحدث حلول ومنتجات متجر حِلها وأضف ما يناسبك!</p>
        </div>
      `;
    } else {
      drawerBody.innerHTML = AppState.cart.map((item) => `
        <div class="cart-item">
          <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='assets/logo.jpg'">
          <div class="cart-item-info">
            <h5 class="cart-item-title">${item.name}</h5>
            <div class="cart-item-price">${item.price * item.quantity} ج.م</div>
            <div class="cart-item-controls">
              <div class="qty-stepper">
                <button class="qty-btn" onclick="updateCartItemQty('${item.id}', -1)">-</button>
                <span class="qty-value">${item.quantity}</span>
                <button class="qty-btn" onclick="updateCartItemQty('${item.id}', 1)">+</button>
              </div>
              <button class="btn-remove-item" onclick="removeFromCart('${item.id}')">حذف 🗑️</button>
            </div>
          </div>
        </div>
      `).join("");
    }
  }
}

function openCartDrawer() {
  const overlay = document.getElementById("cart-overlay");
  if (overlay) overlay.classList.add("active");
}

function closeCartDrawer() {
  const overlay = document.getElementById("cart-overlay");
  if (overlay) overlay.classList.remove("active");
}

/**
 * 4. Quick View Modal Logic
 */
function openQuickView(productId) {
  const product = AppState.products.find((p) => String(p.id) === String(productId));
  if (!product) return;

  const modalOverlay = document.getElementById("quick-view-overlay");
  const modalContent = document.getElementById("quick-view-body");
  if (!modalOverlay || !modalContent) return;

  modalContent.innerHTML = `
    <div class="quick-view-grid">
      <div>
        <img src="${product.image || 'assets/logo.jpg'}" alt="${product.name}" class="quick-view-img" onerror="this.src='assets/logo.jpg'">
      </div>
      <div>
        <div class="product-category-tag">${product.categoryName || getCategoryArabicName(product.category)}</div>
        <h2 style="font-size: 1.35rem; font-weight:800; color:var(--dark); margin-bottom: 0.5rem;">${product.name}</h2>
        <p style="color:var(--gray); font-size:0.9rem; margin-bottom: 1rem;">${product.subtitle || ""}</p>
        
        <div class="product-price-row" style="border:none; padding:0; margin-bottom: 1rem;">
          <div class="price-box">
            <span class="current-price" style="font-size:1.6rem;">${product.price} <small>ج.م</small></span>
            ${product.originalPrice ? `<span class="old-price" style="font-size:1.1rem;">${product.originalPrice} ج.م</span>` : ""}
          </div>
        </div>

        <p style="font-size: 0.95rem; line-height: 1.6; color: var(--dark-soft); margin-bottom: 1rem;">
          ${product.description || "منتج عملي وحل مميز لحياتك اليومية من متجر حِلها."}
        </p>

        ${product.features && product.features.length ? `
          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--primary);">أبرز المميزات والمواصفات:</h4>
          <ul class="features-list">
            ${product.features.map(f => `<li>${f}</li>`).join("")}
          </ul>
        ` : ""}

        <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
          <button class="btn-primary" style="flex:1; justify-content:center; padding:0.85rem;" onclick="addToCart('${product.id}'); closeQuickView();">
            🛒 أضف إلى السلة الآن
          </button>
        </div>
      </div>
    </div>
  `;

  modalOverlay.classList.add("active");
}

function closeQuickView() {
  const modalOverlay = document.getElementById("quick-view-overlay");
  if (modalOverlay) modalOverlay.classList.remove("active");
}

/**
 * 5. Checkout Flow & Order Placement
 */
function openCheckoutModal() {
  if (AppState.cart.length === 0) {
    showToast("سلتك فارغة، أضف منتجات أولاً! 🛒", "error");
    return;
  }
  closeCartDrawer();

  const checkoutOverlay = document.getElementById("checkout-overlay");
  const reviewBox = document.getElementById("checkout-order-review");

  const subtotal = getCartSubtotal();
  const isFree = subtotal >= AppState.freeShippingThreshold;
  const shipFee = isFree ? 0 : AppState.shippingFee;
  const total = subtotal + shipFee;

  if (reviewBox) {
    reviewBox.innerHTML = `
      <h4 style="font-weight:800; color:var(--primary); margin-bottom:0.75rem;">ملخص طلبك (${AppState.cart.length} منتجات)</h4>
      <div style="display:flex; flex-direction:column; gap:0.4rem; font-size:0.88rem; margin-bottom: 0.75rem;">
        ${AppState.cart.map(i => `
          <div style="display:flex; justify-content:space-between;">
            <span>${i.name} (×${i.quantity})</span>
            <strong>${i.price * i.quantity} ج.م</strong>
          </div>
        `).join("")}
      </div>
      <div style="border-top:1px dashed var(--border); padding-top:0.5rem; display:flex; justify-content:space-between; font-weight:700;">
        <span>الشحن:</span>
        <span>${isFree ? "مجاني 🎉" : `${shipFee} ج.م`}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:1.15rem; font-weight:800; color:var(--primary); margin-top:0.35rem;">
        <span>الإجمالي النهائي:</span>
        <span>${total} ج.م</span>
      </div>
    `;
  }

  if (checkoutOverlay) checkoutOverlay.classList.add("active");
}

function closeCheckoutModal() {
  const checkoutOverlay = document.getElementById("checkout-overlay");
  if (checkoutOverlay) checkoutOverlay.classList.remove("active");
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("order-customer-name").value.trim();
  const phone = document.getElementById("order-customer-phone").value.trim();
  const city = document.getElementById("order-customer-city").value.trim();
  const address = document.getElementById("order-customer-address").value.trim();
  const notes = document.getElementById("order-customer-notes").value.trim();

  if (!name || !phone || !address || !city) {
    showToast("يرجى ملء جميع الحقول المطلوبة", "error");
    return;
  }

  const policyAgree = document.getElementById("order-policy-agree");
  const agreementWrap = document.querySelector(".checkout-agreement-wrap");
  const policyError = document.getElementById("policy-agree-error");

  if (policyAgree && !policyAgree.checked) {
    if (agreementWrap) {
      agreementWrap.classList.add("has-error");
      setTimeout(() => agreementWrap.classList.remove("has-error"), 3000);
    }
    if (policyError) {
      policyError.style.display = "block";
    }
    policyAgree.setCustomValidity("لا بد من مراجعة والتأكيد على سياسة الاستبدال والاسترجاع");
    if (typeof policyAgree.reportValidity === "function") {
      policyAgree.reportValidity();
    }
    showToast("لا بد من مراجعة والتأكيد على سياسة الاستبدال والاسترجاع", "error");
    policyAgree.focus();
    return;
  }

  const submitBtn = document.getElementById("btn-submit-order");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "جاري تأكيد وتسجيل الطلب...";
  }

  const subtotal = getCartSubtotal();
  const isFree = subtotal >= AppState.freeShippingThreshold;
  const shippingFee = isFree ? 0 : AppState.shippingFee;
  const totalAmount = subtotal + shippingFee;

  const orderId = "HLH-" + Math.floor(100000 + Math.random() * 900000);

  const orderData = {
    orderId,
    id: orderId,
    customerName: name,
    customerPhone: phone,
    city: city,
    address: address,
    notes: notes,
    items: AppState.cart,
    subtotal: subtotal,
    shippingFee: shippingFee,
    totalAmount: totalAmount,
    status: "new",
    paymentMethod: "الدفع عند الاستلام",
    createdAt: new Date().toLocaleString("ar-EG"),
    timestamp: Date.now()
  };

  try {
    // 1. Save order to Firebase Realtime Database
    if (typeof db !== "undefined" && db) {
      await db.ref(`orders/${orderId}`).set(orderData);
      
      // Update analytics in Firebase
      db.ref("analytics/totalOrders").transaction((current) => (current || 0) + 1);
      db.ref("analytics/totalRevenue").transaction((current) => (current || 0) + totalAmount);
    }

    // 2. Send instant Telegram Notification
    await TelegramService.notifyNewOrder(orderData);

    // 3. Clear Cart
    AppState.cart = [];
    saveCartToStorage();

    // 4. Show Success Screen
    closeCheckoutModal();
    showOrderSuccessModal(orderData);

  } catch (err) {
    console.error("Order error:", err);
    showToast("حدث خطأ أثناء حفظ الطلب، يرجى المحاولة مرة أخرى", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "تأكيد الطلب الآن 🚚";
    }
  }
}

function showOrderSuccessModal(order) {
  const successOverlay = document.getElementById("success-overlay");
  const codeEl = document.getElementById("success-order-code");
  const waBtn = document.getElementById("success-whatsapp-btn");
  const trackBtn = document.getElementById("success-track-btn");

  if (codeEl) codeEl.textContent = `#${order.orderId}`;
  
  if (trackBtn) {
    trackBtn.href = `track.html?order=${order.orderId}`;
  }

  if (waBtn) {
    waBtn.href = "contact.html";
  }

  if (successOverlay) successOverlay.classList.add("active");
}

function closeSuccessModal() {
  const successOverlay = document.getElementById("success-overlay");
  if (successOverlay) successOverlay.classList.remove("active");
}

/**
 * 6. Visitor Analytics Tracker
 */
function trackVisitor() {
  const visited = sessionStorage.getItem("helha_visited");
  if (!visited) {
    sessionStorage.setItem("helha_visited", "true");
    if (typeof db !== "undefined" && db) {
      db.ref("analytics/totalVisits").transaction((current) => (current || 0) + 1);
      db.ref("analytics/todayVisits").transaction((current) => (current || 0) + 1);
    }
  }
}

/**
 * 7. Event Listeners & UI Binding
 */
function setupEventListeners() {
  // Category tabs
  const tabButtons = document.querySelectorAll(".cat-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      AppState.currentCategory = btn.getAttribute("data-category") || "all";
      renderProducts();
    });
  });

  // Handle URL category parameter (e.g. index.html?cat=kitchen)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get("cat");
    if (catParam) {
      AppState.currentCategory = catParam;
      const targetBtn = document.querySelector(`.cat-btn[data-category="${catParam}"]`);
      if (targetBtn) {
        tabButtons.forEach(b => b.classList.remove("active"));
        targetBtn.classList.add("active");
        setTimeout(() => {
          const prodSection = document.getElementById("products-section");
          if (prodSection) prodSection.scrollIntoView({ behavior: "smooth" });
        }, 400);
      }
    }
  } catch (e) {}

  // Instant Live Search Input
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      handleLiveSearch(e.target.value);
    });
    searchInput.addEventListener("focus", (e) => {
      if (e.target.value.trim().length > 0) {
        handleLiveSearch(e.target.value);
      }
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const dropdown = document.getElementById("search-live-dropdown");
        if (dropdown) dropdown.style.display = "none";
      }
    });
  }

  // Close live search dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const searchWrapper = document.querySelector(".search-wrapper");
    const dropdown = document.getElementById("search-live-dropdown");
    if (searchWrapper && dropdown && !searchWrapper.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // Checkout form
  const checkoutForm = document.getElementById("checkout-form");
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", handleCheckoutSubmit);
  }

  // Cart button in navbar
  const navCartBtn = document.getElementById("nav-cart-btn");
  if (navCartBtn) {
    navCartBtn.addEventListener("click", openCartDrawer);
  }

  // Close modals on overlay background click
  window.addEventListener("click", (e) => {
    if (e.target.id === "cart-overlay") closeCartDrawer();
    if (e.target.id === "quick-view-overlay") closeQuickView();
    if (e.target.id === "checkout-overlay") closeCheckoutModal();
    if (e.target.id === "success-overlay") closeSuccessModal();
  });
}

/**
 * Toast Notification Helper
 */
function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === "error" ? "⚠️" : "✓"}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * ============================================================================
 * Instant Live Search & Arabic Normalization Logic
 * ============================================================================
 */

function normalizeArabic(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel/diacritics
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .trim();
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightMatch(text, query) {
  if (!text || !query) return escapeHTML(text || "");
  const trimmed = query.trim();
  if (!trimmed) return escapeHTML(text);

  const escapedQuery = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  if (regex.test(text)) {
    return escapeHTML(text).replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  const normText = normalizeArabic(text);
  const normQuery = normalizeArabic(trimmed);
  const idx = normText.indexOf(normQuery);
  if (idx !== -1) {
    const len = trimmed.length;
    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + len);
    const after = text.substring(idx + len);
    return `${escapeHTML(before)}<mark class="search-highlight">${escapeHTML(match)}</mark>${escapeHTML(after)}`;
  }

  return escapeHTML(text);
}

function handleLiveSearch(query) {
  const clearBtn = document.getElementById("search-clear-btn");
  const dropdown = document.getElementById("search-live-dropdown");
  const trimmed = (query || "").trim();

  AppState.searchQuery = trimmed;

  if (trimmed.length === 0) {
    if (clearBtn) clearBtn.style.display = "none";
    if (dropdown) dropdown.style.display = "none";
    renderProducts();
    return;
  }

  if (clearBtn) clearBtn.style.display = "flex";

  const normQuery = normalizeArabic(trimmed);
  const matches = AppState.products.filter((p) => {
    const normName = normalizeArabic(p.name);
    const normSub = normalizeArabic(p.subtitle);
    const normDesc = normalizeArabic(p.description);
    const normCat = normalizeArabic(p.categoryName || getCategoryArabicName(p.category));
    return (
      normName.includes(normQuery) ||
      normSub.includes(normQuery) ||
      normDesc.includes(normQuery) ||
      normCat.includes(normQuery)
    );
  });

  // Keep the page grid synced
  renderProducts();

  // Render Live Dropdown
  if (dropdown) {
    if (matches.length === 0) {
      dropdown.innerHTML = `
        <div class="search-dropdown-empty">
          <div class="search-dropdown-empty-icon">🔍</div>
          <div style="font-weight:700; color:var(--dark); margin-bottom:0.3rem;">لم يتم العثور على "${escapeHTML(trimmed)}"</div>
          <div style="font-size:0.8rem; color:var(--gray);">جرّب كتابة كلمة أخرى مثل: قطاعة، موزع، صابون، منظم...</div>
        </div>
      `;
    } else {
      const topMatches = matches.slice(0, 8);
      dropdown.innerHTML = `
        <div class="search-dropdown-header">
          <span>نتائج البحث الفورية (${matches.length} منتج)</span>
          <span style="font-size:0.75rem; color:var(--primary); font-weight:700;">اضغط للشراء مباشرة 🛒</span>
        </div>
        <div class="search-dropdown-list">
          ${topMatches
            .map(
              (prod) => `
            <a href="product.html?id=${prod.id}" class="search-dropdown-item">
              <img src="${prod.image || 'assets/logo.jpg'}" alt="${escapeHTML(prod.name)}" class="search-item-thumb" onerror="this.src='assets/logo.jpg'">
              <div class="search-item-details">
                <div class="search-item-title">${highlightMatch(prod.name, trimmed)}</div>
                <div class="search-item-sub">${escapeHTML(prod.categoryName || getCategoryArabicName(prod.category))} ${prod.subtitle ? '• ' + escapeHTML(prod.subtitle) : ''}</div>
              </div>
              <div class="search-item-price-col">
                <span class="search-item-price">${prod.price} ج.م</span>
                ${prod.originalPrice ? `<span class="search-item-old-price">${prod.originalPrice} ج.م</span>` : ''}
              </div>
            </a>
          `
            )
            .join("")}
        </div>
        <div class="search-dropdown-footer" onclick="scrollToProductsSection()">
          <span>عرض جميع النتائج (${matches.length} منتج) في المعرض</span>
          <span>↓</span>
        </div>
      `;
    }
    dropdown.style.display = "block";
  }
}

function clearLiveSearch() {
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear-btn");
  const dropdown = document.getElementById("search-live-dropdown");

  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }
  if (clearBtn) clearBtn.style.display = "none";
  if (dropdown) dropdown.style.display = "none";

  AppState.searchQuery = "";
  renderProducts();
}

function scrollToProductsSection() {
  const dropdown = document.getElementById("search-live-dropdown");
  if (dropdown) dropdown.style.display = "none";
  const prodSection = document.getElementById("products-section");
  if (prodSection) {
    prodSection.scrollIntoView({ behavior: "smooth" });
  }
}

/**
 * ============================================================================
 * 8. Real-time Banner & Announcement Synchronization
 * ============================================================================
 */
function initBannersListener() {
  if (typeof db === "undefined" || !db) return;

  db.ref("settings/banners").on("value", (snapshot) => {
    const banners = snapshot.val();
    if (!banners) return;

    // 1. Top Announcement Bar
    const topBar = banners.topBar;
    const topBarEl = document.getElementById("announcement-bar");
    const badgeEl = document.getElementById("announcement-badge");
    const textEl = document.getElementById("announcement-text");
    const extraEl = document.getElementById("announcement-extra");

    if (topBarEl && topBar) {
      if (topBar.enabled === false) {
        topBarEl.style.display = "none";
      } else {
        topBarEl.style.display = "";
        if (badgeEl && topBar.badge !== undefined) badgeEl.textContent = topBar.badge;
        if (textEl && topBar.text !== undefined) textEl.textContent = topBar.text;
        if (extraEl && topBar.extra !== undefined) {
          extraEl.textContent = topBar.extra;
          extraEl.style.display = topBar.extra ? "" : "none";
        }
      }
    }

    // 2. Hero Banner
    const hero = banners.hero;
    const heroSection = document.getElementById("hero-section");
    const heroImg = document.getElementById("hero-banner-img");
    const heroTitle = document.getElementById("hero-banner-title");
    const heroSub = document.getElementById("hero-banner-subtitle");
    const heroBtn = document.getElementById("hero-banner-btn");

    if (heroSection && hero) {
      if (hero.enabled === false) {
        heroSection.style.display = "none";
      } else {
        heroSection.style.display = "";
        if (heroImg && hero.image) heroImg.src = hero.image;
        if (heroTitle && hero.title !== undefined) heroTitle.textContent = hero.title;
        if (heroSub && hero.subtitle !== undefined) heroSub.textContent = hero.subtitle;
        if (heroBtn) {
          if (hero.btnText !== undefined) heroBtn.textContent = hero.btnText;
          if (hero.btnLink !== undefined) heroBtn.href = hero.btnLink;
        }
      }
    }
  });
}

/**
 * ============================================================================
 * 9. Real-time Categories Sync for Store Front
 * ============================================================================
 */
function initStoreCategories() {
  if (typeof db === "undefined" || !db) return;

  db.ref("categories").on("value", (snap) => {
    const data = snap.val();
    const container = document.getElementById("category-tabs-container");
    if (!container) return;

    const DEFAULT_CATS = [
      { id: "all", name: "⚡ جميع المنتجات" },
      { id: "kitchen", name: "🍳 حلول المطبخ" },
      { id: "cleaning", name: "🧹 أدوات التنظيف" },
      { id: "home", name: "🏠 حلول منزلية" },
      { id: "deals", name: "🔥 عروض التوفير" }
    ];

    let cats = [...DEFAULT_CATS];
    if (data) {
      Object.keys(data).forEach((k) => {
        const item = data[k];
        const catId = item.id || k;
        if (!cats.some((c) => c.id === catId)) {
          cats.push({
            id: catId,
            name: `${item.icon || "🏷️"} ${item.name}`
          });
        }
      });
    }

    container.innerHTML = cats
      .map(
        (c) => `
      <button class="cat-btn ${AppState.currentCategory === c.id ? "active" : ""}" data-category="${c.id}">${c.name}</button>
    `
      )
      .join("");

    // Re-bind click listeners
    container.querySelectorAll(".cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        AppState.currentCategory = btn.getAttribute("data-category") || "all";
        renderProducts();
      });
    });
  });
}
