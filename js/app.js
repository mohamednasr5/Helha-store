/**
 * Helha (حِلها) E-Commerce Store - Frontend Application Logic
 */

// Application State
const AppState = {
  products: [],
  cart: [],
  currentCategory: "all",
  searchQuery: "",
  shippingFee: 50,
  freeShippingThreshold: 1000,
  shippingSettings: {
    freeShippingEnabled: true,
    freeShippingThreshold: 1000,
    mode: "flat",
    flatRate: 50,
    govRates: {}
  },
  appliedCoupon: null,
  activeProductModal: null,
  cardSliderTimer: null,
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  initFirebaseProducts();
  trackVisitor();
  setupEventListeners();
  updateCartUI();
  initHeroBannerCarousel();
  initBannersListener();
  initStoreCategories();
  initStoreShippingListener();

  if (window.location.hash === "#cart") {
    setTimeout(() => {
      if (typeof openCartDrawer === "function") {
        openCartDrawer();
      }
    }, 350);
  }
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
  initProductCardSliders();
}

/**
 * Create Single Product Card HTML (Supports multi-image auto slideshow)
 */
function createProductCardHTML(prod) {
  const discountPercent =
    prod.originalPrice && prod.originalPrice > prod.price
      ? Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100)
      : null;

  // Multi-images support (up to 10 images)
  const images = (Array.isArray(prod.images) && prod.images.length > 0)
    ? prod.images.filter(Boolean).slice(0, 10)
    : (prod.image ? [prod.image] : ["assets/logo.jpg"]);
  const hasMultipleImages = images.length > 1;
  const primaryImg = images[0] || "assets/logo.jpg";
  const imagesEncoded = encodeURIComponent(JSON.stringify(images));

  const availability = prod.availability || "in_stock";
  const stockCount = prod.stockCount !== undefined && prod.stockCount !== null ? Number(prod.stockCount) : 50;
  const isPreorder = availability === "preorder";
  const isOutOfStock = availability === "out_of_stock";
  const isLowStock = !isPreorder && !isOutOfStock && stockCount > 0 && stockCount <= 3;

  let stockTagHTML = "";
  if (isPreorder) {
    stockTagHTML = `<span class="stock-tag preorder-tag" style="color:#d97706; font-weight:700;">⏳ متاح للطلب المسبق</span>`;
  } else if (isOutOfStock) {
    stockTagHTML = `<span class="stock-tag out-of-stock-tag" style="color:#dc2626; font-weight:700;">❌ غير متوفر حالياً</span>`;
  } else if (isLowStock) {
    stockTagHTML = `<span class="stock-tag low-stock-tag" style="color:#dc2626; font-weight:800; background:#fee2e2; padding:2px 6px; border-radius:4px; font-size:0.75rem;">🔥 أوشك على النفاذ! (${stockCount} فقط)</span>`;
  } else {
    stockTagHTML = `<span class="stock-tag">متوفر بالمخزن</span>`;
  }

  let actionsHTML = "";
  if (isPreorder) {
    actionsHTML = `
      <div class="product-actions" style="display:flex; gap:0.5rem; align-items:center; margin-top: auto; padding-top: 0.65rem;">
        <button type="button" class="btn-buy-now btn-preorder-cta" onclick="openPreorderModal('${prod.id}'); event.stopPropagation();" style="flex:1; display:flex; align-items:center; justify-content:center; gap:0.5rem; background:#f59e0b; color:#ffffff !important; font-weight:800; font-size:0.95rem; text-decoration:none; padding:0.8rem 0.75rem; border-radius:8px; border:none; cursor:pointer; box-shadow:0 4px 12px rgba(245,158,11,0.25);">
          <span>طلب مسبق ⏳</span>
        </button>
      </div>
    `;
  } else if (isOutOfStock) {
    actionsHTML = `
      <div class="product-actions" style="display:flex; gap:0.5rem; align-items:center; margin-top: auto; padding-top: 0.65rem;">
        <button type="button" class="btn-buy-now" disabled style="flex:1; display:flex; align-items:center; justify-content:center; gap:0.5rem; background:#94a3b8; color:#ffffff !important; font-weight:700; font-size:0.92rem; padding:0.8rem 0.75rem; border-radius:8px; border:none; cursor:not-allowed; opacity:0.85;">
          <span>غير متوفر حالياً ❌</span>
        </button>
      </div>
    `;
  } else {
    actionsHTML = `
      <div class="product-actions" style="display:flex; gap:0.5rem; align-items:center; margin-top: auto; padding-top: 0.65rem;">
        <a href="product.html?id=${prod.id}" class="btn-buy-now" style="flex:1; display:flex; align-items:center; justify-content:center; gap:0.5rem; background:#175349; color:#ffffff !important; font-weight:800; font-size:0.95rem; text-decoration:none; padding:0.8rem 0.75rem; border-radius:8px; box-shadow:0 4px 12px rgba(23,83,73,0.25);">
          <span>اضغط هنا للشراء 🚚</span>
        </a>
        <button type="button" class="btn-card-quick-cart" onclick="addToCart('${prod.id}'); event.stopPropagation();" title="إضافة المنتج للسلة 🛒" aria-label="إضافة المنتج للسلة">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px;">
            <circle cx="9" cy="21" r="1.5"></circle>
            <circle cx="20" cy="21" r="1.5"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
        </button>
      </div>
    `;
  }

  return `
    <article class="product-card" data-id="${prod.id}" data-has-slider="${hasMultipleImages ? 'true' : 'false'}" data-images="${imagesEncoded}" data-current-idx="0">
      <div class="product-thumb" onclick="window.location.href='product.html?id=${prod.id}'">
        ${prod.badge ? `<span class="product-badge">${prod.badge}</span>` : ""}
        ${discountPercent && !prod.badge ? `<span class="product-badge">خصم ${discountPercent}%</span>` : ""}
        ${prod.isDemo ? `<span class="badge-demo">تجريبي</span>` : ""}
        <img src="${primaryImg}" alt="${prod.name}" class="card-slider-img" loading="lazy" onerror="this.src='assets/logo.jpg'">
        ${hasMultipleImages ? `
          <div class="card-slider-dots">
            ${images.map((_, idx) => `<span class="card-slider-dot ${idx === 0 ? 'active' : ''}"></span>`).join("")}
          </div>
        ` : ""}
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
          ${stockTagHTML}
        </div>

        ${actionsHTML}
      </div>
    </article>
  `;
}

/**
 * 2.0b Pre-Order Modal & Form Submission Handlers
 */
window.openPreorderModal = function(productId) {
  const prod = (AppState.products || []).find(p => String(p.id) === String(productId));
  const prodName = prod ? prod.name : "المنتج المطلوب";
  
  const modal = document.getElementById("preorder-modal-overlay");
  const nameDisplay = document.getElementById("preorder-prod-name-display");
  const idInput = document.getElementById("preorder-prod-id");
  const nameInput = document.getElementById("preorder-prod-name");
  
  if (nameDisplay) nameDisplay.textContent = prodName;
  if (idInput) idInput.value = productId;
  if (nameInput) nameInput.value = prodName;
  
  if (modal) {
    modal.classList.add("active");
  }
};

window.closePreorderModal = function() {
  const modal = document.getElementById("preorder-modal-overlay");
  if (modal) modal.classList.remove("active");
};

window.submitPreorderForm = async function(e) {
  e.preventDefault();
  const prodId = document.getElementById("preorder-prod-id")?.value;
  const prodName = document.getElementById("preorder-prod-name")?.value;
  const name = document.getElementById("preorder-customer-name")?.value.trim();
  const phone = document.getElementById("preorder-customer-phone")?.value.trim();
  const gov = document.getElementById("preorder-gov")?.value;
  const address = document.getElementById("preorder-customer-address")?.value.trim();
  const btn = document.getElementById("btn-submit-preorder");

  if (!name || !phone) {
    alert("يرجى إدخال اسمك ورقم الواتساب!");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "جاري تسجيل الحجز...";
  }

  const preorderData = {
    id: `pre_${Date.now()}`,
    productId: prodId,
    productName: prodName,
    customerName: name,
    customerPhone: phone,
    governorate: gov || "غير محدد",
    address: address || "",
    status: "pending",
    timestamp: Date.now(),
    createdAt: new Date().toLocaleString("ar-EG")
  };

  try {
    if (typeof db !== "undefined" && db) {
      await db.ref("preorders").push(preorderData);
    }
    closePreorderModal();
    document.getElementById("preorder-form")?.reset();
    alert(`شكراً لك يا ${name}! 🎉\nتم تسجيل حجزك المسبق بنجاح لمنتج (${prodName}).\nسنقوم بإشعارك عبر واتساب فور توفر المنتج بالمخزن!`);
  } catch (err) {
    console.error("Preorder submission error:", err);
    alert("حدث خطأ أثناء تسجيل طلبك، يرجى المحاولة مرة أخرى.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "تأكيد حجز الطلب المسبق ⏳";
    }
  }
};

/**
 * 2.1 Product Cards Auto-Slider (Cycle multiple images automatically every 3.5s)
 */
function initProductCardSliders() {
  if (AppState.cardSliderTimer) {
    clearInterval(AppState.cardSliderTimer);
    AppState.cardSliderTimer = null;
  }

  const sliderCards = document.querySelectorAll('.product-card[data-has-slider="true"]');
  if (!sliderCards || sliderCards.length === 0) return;

  AppState.cardSliderTimer = setInterval(() => {
    sliderCards.forEach((card) => {
      // Pause cycling while user is hovering over this card
      if (card.matches(":hover")) return;

      try {
        const raw = card.getAttribute("data-images");
        if (!raw) return;
        const images = JSON.parse(decodeURIComponent(raw));
        if (!images || images.length <= 1) return;

        let currentIdx = parseInt(card.getAttribute("data-current-idx") || "0", 10);
        const nextIdx = (currentIdx + 1) % images.length;
        card.setAttribute("data-current-idx", nextIdx);

        const img = card.querySelector(".card-slider-img");
        if (img) {
          img.style.opacity = "0.75";
          setTimeout(() => {
            img.src = images[nextIdx];
            img.style.opacity = "1";
          }, 110);
        }

        const dots = card.querySelectorAll(".card-slider-dot");
        dots.forEach((dot, idx) => {
          dot.classList.toggle("active", idx === nextIdx);
        });
      } catch (e) {
        console.warn("Card slider error:", e);
      }
    });
  }, 3500);
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

  // Mobile Bottom Nav Cart Glow & "يوجد منتجات في السلة بانتظارك" Floating Bubble
  const mobCartNavItems = document.querySelectorAll('.mobile-bottom-nav a[href*="#cart"], .mobile-bottom-nav a[href*="cart"]');
  let cartBubble = document.getElementById("mobile-cart-toast-bubble");

  if (totalCount > 0) {
    mobCartNavItems.forEach(item => item.classList.add("cart-glowing"));
    if (!cartBubble) {
      cartBubble = document.createElement("a");
      cartBubble.id = "mobile-cart-toast-bubble";
      cartBubble.className = "mobile-cart-toast-bubble";
      cartBubble.href = "javascript:void(0)";
      cartBubble.onclick = (e) => {
        e.preventDefault();
        if (cartBubble) cartBubble.style.display = "none";
        if (typeof openCartDrawer === "function") openCartDrawer();
      };
      document.body.appendChild(cartBubble);
    }
    cartBubble.innerHTML = `<span>🛒 يوجد منتجات في السلة بانتظارك</span> <strong>(${totalCount})</strong>`;
    
    // Hide bubble if cart or checkout is currently open
    const isCartOpen = document.body.classList.contains("cart-open") || 
      document.getElementById("cart-overlay")?.classList.contains("active") || 
      document.getElementById("checkout-overlay")?.classList.contains("active");

    if (isCartOpen) {
      cartBubble.style.display = "none";
    } else {
      cartBubble.style.display = "flex";
    }
  } else {
    mobCartNavItems.forEach(item => item.classList.remove("cart-glowing"));
    if (cartBubble) cartBubble.style.display = "none";
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
  document.body.classList.add("cart-open");
  const bubble = document.getElementById("mobile-cart-toast-bubble");
  if (bubble) bubble.style.display = "none";
}

function closeCartDrawer() {
  const overlay = document.getElementById("cart-overlay");
  if (overlay) overlay.classList.remove("active");
  if (!document.getElementById("checkout-overlay")?.classList.contains("active")) {
    document.body.classList.remove("cart-open");
  }
  const totalCount = AppState.cart.reduce((sum, item) => sum + item.quantity, 0);
  const bubble = document.getElementById("mobile-cart-toast-bubble");
  if (bubble && totalCount > 0 && !document.getElementById("checkout-overlay")?.classList.contains("active")) {
    bubble.style.display = "flex";
  }
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
function calculateCurrentShipping(subtotal, selectedGov) {
  const s = AppState.shippingSettings || {};
  if (s.freeShippingEnabled !== false && subtotal >= (Number(s.freeShippingThreshold) || 1000) && subtotal > 0) {
    return 0;
  }
  if (s.mode === "per_gov" && selectedGov && s.govRates && s.govRates[selectedGov] !== undefined) {
    return Number(s.govRates[selectedGov]);
  }
  return Number(s.flatRate || AppState.shippingFee || 50);
}

function updateCheckoutReview() {
  const reviewBox = document.getElementById("checkout-order-review");
  const citySelect = document.getElementById("order-customer-city");
  const selectedGov = citySelect ? citySelect.value : "";

  const subtotal = getCartSubtotal();
  const shippingFee = calculateCurrentShipping(subtotal, selectedGov);
  const discountAmount = AppState.appliedCoupon ? AppState.appliedCoupon.discountAmount : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

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
      <div style="border-top:1px dashed var(--border); padding-top:0.5rem; display:flex; justify-content:space-between; font-size:0.9rem;">
        <span>المجموع الفرعي:</span>
        <span>${subtotal} ج.م</span>
      </div>
      ${AppState.appliedCoupon ? `
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:#16a34a; font-weight:700;">
          <span>خصم الكوبون (${AppState.appliedCoupon.code}):</span>
          <span>-${discountAmount} ج.م</span>
        </div>
      ` : ""}
      <div style="display:flex; justify-content:space-between; font-size:0.9rem; font-weight:700;">
        <span>الشحن ${selectedGov ? `(${selectedGov})` : ""}:</span>
        <span style="${shippingFee === 0 ? 'color:#16a34a;' : ''}">${shippingFee === 0 ? "شحن مجاني 🎉" : `${shippingFee} ج.م`}</span>
      </div>
      <div style="border-top:1px dashed var(--border); padding-top:0.5rem; display:flex; justify-content:space-between; font-size:1.15rem; font-weight:800; color:var(--primary); margin-top:0.35rem;">
        <span>الإجمالي النهائي:</span>
        <span>${grandTotal} ج.م</span>
      </div>
    `;
  }
}

async function applyCheckoutCoupon(inputCode) {
  const code = (inputCode || (document.getElementById("checkout-coupon-code") ? document.getElementById("checkout-coupon-code").value : "")).trim().toUpperCase();
  const msgEl = document.getElementById("checkout-coupon-msg");

  if (!code) {
    if (msgEl) {
      msgEl.textContent = "يرجى كتابة كود الخصم أولاً!";
      msgEl.style.color = "#ef4444";
    }
    return;
  }

  if (typeof db === "undefined" || !db) {
    if (msgEl) {
      msgEl.textContent = "خدمة الكوبونات غير متصلة حالياً";
      msgEl.style.color = "#ef4444";
    }
    return;
  }

  try {
    const snap = await db.ref(`coupons/${code}`).once("value");
    const coupon = snap.val();

    if (!coupon) {
      AppState.appliedCoupon = null;
      if (msgEl) {
        msgEl.textContent = "❌ كود الخصم غير صحيح أو غير موجود";
        msgEl.style.color = "#ef4444";
      }
      updateCheckoutReview();
      return;
    }

    if (coupon.status === "disabled") {
      AppState.appliedCoupon = null;
      if (msgEl) {
        msgEl.textContent = "⚠️ هذا الكود معطّل حالياً";
        msgEl.style.color = "#ef4444";
      }
      updateCheckoutReview();
      return;
    }

    const now = Date.now();
    if (coupon.expiryDate && new Date(coupon.expiryDate).getTime() < now) {
      AppState.appliedCoupon = null;
      if (msgEl) {
        msgEl.textContent = "⌛ عذراً، انتهت صلاحية كود الخصم هذا";
        msgEl.style.color = "#ef4444";
      }
      updateCheckoutReview();
      return;
    }

    if (coupon.usageLimit > 0 && (coupon.usedCount || 0) >= coupon.usageLimit) {
      AppState.appliedCoupon = null;
      if (msgEl) {
        msgEl.textContent = "⚠️ عذراً، تم الوصول للحد الأقصى لاستخدام هذا الكود";
        msgEl.style.color = "#ef4444";
      }
      updateCheckoutReview();
      return;
    }

    const subtotal = getCartSubtotal();
    if (coupon.minOrder > 0 && subtotal < coupon.minOrder) {
      AppState.appliedCoupon = null;
      if (msgEl) {
        msgEl.textContent = `⚠️ يلزم أن يكون إجمالي مشترياتك ${coupon.minOrder} ج.م على الأقل لتفعيل هذا الكود`;
        msgEl.style.color = "#ef4444";
      }
      updateCheckoutReview();
      return;
    }

    // Valid coupon!
    let discountAmount = 0;
    if (coupon.type === "fixed") {
      discountAmount = Math.min(subtotal, Number(coupon.value) || 0);
    } else {
      discountAmount = Math.round(subtotal * ((Number(coupon.value) || 0) / 100));
    }

    AppState.appliedCoupon = {
      code: coupon.code || code,
      type: coupon.type,
      value: coupon.value,
      discountAmount: discountAmount
    };

    if (msgEl) {
      msgEl.textContent = `🎉 تم تفعيل الكود بنجاح! وفرت ${discountAmount} ج.م`;
      msgEl.style.color = "#16a34a";
    }

    updateCheckoutReview();
  } catch (err) {
    console.error("Error applying coupon:", err);
    if (msgEl) {
      msgEl.textContent = "حدث خطأ أثناء فحص الكود";
      msgEl.style.color = "#ef4444";
    }
  }
}

function openCheckoutModal() {
  if (AppState.cart.length === 0) {
    showToast("سلتك فارغة، أضف منتجات أولاً! 🛒", "error");
    return;
  }
  closeCartDrawer();

  const checkoutOverlay = document.getElementById("checkout-overlay");
  updateCheckoutReview();

  if (checkoutOverlay) {
    checkoutOverlay.classList.add("active");
    document.body.classList.add("cart-open");
    const bubble = document.getElementById("mobile-cart-toast-bubble");
    if (bubble) bubble.style.display = "none";
  }
}

function closeCheckoutModal() {
  const checkoutOverlay = document.getElementById("checkout-overlay");
  if (checkoutOverlay) checkoutOverlay.classList.remove("active");
  document.body.classList.remove("cart-open");
  updateCartUI();
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("order-customer-name").value.trim();
  const phone = document.getElementById("order-customer-phone").value.trim();
  const city = document.getElementById("order-customer-city").value.trim();
  const address = document.getElementById("order-customer-address").value.trim();
  const notes = document.getElementById("order-customer-notes") ? document.getElementById("order-customer-notes").value.trim() : "";

  if (!name || !phone || !address || !city) {
    showToast("يرجى ملء جميع الحقول المطلوبة واختيار المحافظة", "error");
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
  const shippingFee = calculateCurrentShipping(subtotal, city);
  const discountAmount = AppState.appliedCoupon ? AppState.appliedCoupon.discountAmount : 0;
  const couponCode = AppState.appliedCoupon ? AppState.appliedCoupon.code : null;
  const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

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
    couponCode: couponCode,
    discountAmount: discountAmount,
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

      // Record coupon usage in Firebase if applied
      if (couponCode) {
        const usageObj = {
          orderId: orderId,
          customerName: name,
          customerPhone: phone,
          discountAmount: discountAmount,
          totalAmount: totalAmount,
          usedAt: new Date().toLocaleString("ar-EG")
        };
        db.ref(`coupons/${couponCode}/usages`).push(usageObj);
        db.ref(`coupons/${couponCode}/usedCount`).transaction(c => (c || 0) + 1);
        db.ref(`coupons/${couponCode}/totalDiscountGiven`).transaction(d => (d || 0) + discountAmount);
      }
    }

    // 2. Send instant Telegram Notification
    await TelegramService.notifyNewOrder(orderData);

    // 3. Clear Cart & Reset Coupon
    AppState.cart = [];
    AppState.appliedCoupon = null;
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
 * 6. Visitor Analytics Tracker (Advanced Geolocation, IP, Device, and Visits Counter)
 */
const VisitorAnalytics = {
  getDeviceInfo() {
    const ua = navigator.userAgent || "";
    let deviceType = "كمبيوتر 💻";
    const isMobile = /mobile|iphone|ipod|android.*mobile/i.test(ua);
    const isTablet = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
    
    if (isTablet) {
      deviceType = "جهاز لوحي 📟";
    } else if (isMobile || window.innerWidth <= 768) {
      deviceType = "هاتف محمول 📱";
    }

    let os = "غير معروف";
    if (/android/i.test(ua)) os = "Android";
    else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
    else if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
    else if (/windows/i.test(ua)) os = "Windows";
    else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
    else if (/linux/i.test(ua)) os = "Linux";

    let browser = "متصفح الويب";
    if (/edg/i.test(ua)) browser = "Edge";
    else if (/chrome|crios/i.test(ua)) browser = "Chrome";
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
    else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
    else if (/samsungbrowser/i.test(ua)) browser = "Samsung Browser";
    else if (/opera|opr/i.test(ua)) browser = "Opera";

    return {
      deviceType,
      os,
      browser,
      screen: `${window.screen.width}x${window.screen.height}`
    };
  },

  async fetchGeoIP() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch("https://ipwho.is/", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false) {
          return {
            ip: data.ip || "غير معروف",
            country: data.country || "مصر",
            countryCode: data.country_code || "EG",
            city: data.city || "القاهرة",
            region: data.region || "محافظة القاهرة",
            flag: data.flag ? data.flag.emoji : "🇪🇬"
          };
        }
      }
    } catch (e) {
      // Fallback
    }

    try {
      const res = await fetch("https://api.ipify.org?format=json");
      if (res.ok) {
        const data = await res.json();
        return {
          ip: data.ip || "غير معروف",
          country: "مصر",
          countryCode: "EG",
          city: "القاهرة",
          region: "محافظة القاهرة",
          flag: "🇪🇬"
        };
      }
    } catch (e) {
      // Fallback default
    }

    return {
      ip: "156.197.x.x",
      country: "مصر",
      countryCode: "EG",
      city: "القاهرة",
      region: "محافظة القاهرة",
      flag: "🇪🇬"
    };
  },

  async recordVisit(pageName = "") {
    try {
      let vid = localStorage.getItem("helha_vid");
      if (!vid) {
        vid = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
        localStorage.setItem("helha_vid", vid);
      }

      const sessionVisited = sessionStorage.getItem("helha_session_visited");
      let visitCount = parseInt(localStorage.getItem("helha_visit_count") || "0", 10);
      
      if (!sessionVisited) {
        visitCount += 1;
        localStorage.setItem("helha_visit_count", String(visitCount));
        sessionStorage.setItem("helha_session_visited", "true");

        if (typeof db !== "undefined" && db) {
          db.ref("analytics/totalVisits").transaction((c) => (c || 0) + 1);
          db.ref("analytics/todayVisits").transaction((c) => (c || 0) + 1);
        }
      }

      const dev = this.getDeviceInfo();
      const geo = await this.fetchGeoIP();
      const currentPage = pageName || document.title || "المتجر الرئيسي";
      const now = Date.now();

      if (typeof db !== "undefined" && db) {
        db.ref(`analytics/visitors/${vid}`).update({
          vid: vid,
          ip: geo.ip,
          country: geo.country,
          countryCode: geo.countryCode,
          flag: geo.flag,
          city: geo.city,
          region: geo.region,
          deviceType: dev.deviceType,
          os: dev.os,
          browser: dev.browser,
          screen: dev.screen,
          visitsCount: visitCount,
          lastPage: currentPage,
          lastVisit: now
        });

        if (!sessionVisited) {
          const logRef = db.ref("analytics/visitorLogs").push();
          logRef.set({
            id: logRef.key,
            vid: vid,
            ip: geo.ip,
            country: geo.country,
            countryCode: geo.countryCode,
            flag: geo.flag,
            city: geo.city,
            region: geo.region,
            deviceType: dev.deviceType,
            os: dev.os,
            browser: dev.browser,
            screen: dev.screen,
            visitsCount: visitCount,
            page: currentPage,
            timestamp: now
          });
        }
      }
    } catch (err) {
      console.warn("VisitorAnalytics error:", err);
    }
  }
};

function trackVisitor() {
  VisitorAnalytics.recordVisit();
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
    if (e.target.id === "preorder-modal-overlay") closePreorderModal();
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
 * 8. Real-time Multi-Banner Carousel & Announcements Synchronization
 * ============================================================================
 */
const DEFAULT_HERO_BANNERS = [
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

let heroBannerState = {
  currentIndex: 0,
  banners: [...DEFAULT_HERO_BANNERS],
  timer: null,
  interval: 4500,
  isPaused: false,
  touchStartX: 0,
  touchEndX: 0
};

function safeBannerText(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHeroBannerCarousel(bannersList) {
  const container = document.getElementById("hero-carousel-container");
  const track = document.getElementById("hero-slider-track");
  const dotsContainer = document.getElementById("hero-slider-dots");
  if (!container || !track) return;

  const validBanners = (bannersList && Array.isArray(bannersList) && bannersList.length > 0)
    ? bannersList.filter(b => b && b.enabled !== false && b.image)
    : [...DEFAULT_HERO_BANNERS];

  heroBannerState.banners = validBanners.length > 0 ? validBanners : [...DEFAULT_HERO_BANNERS];
  heroBannerState.currentIndex = 0;

  // Render slides dynamically
  track.innerHTML = heroBannerState.banners.map((b, idx) => `
    <div class="hero-slide ${idx === 0 ? "active" : ""}" data-index="${idx}">
      <a href="${b.link || "#products-section"}" class="hero-slide-link" title="${safeBannerText(b.title || "متجر حلها")}">
        <div class="hero-slide-img-wrap">
          <img src="${b.image}" alt="${safeBannerText(b.title || "بانر متجر حلها")}" class="hero-slide-img" loading="${idx === 0 ? "eager" : "lazy"}" onerror="this.src='assets/banner.jpg'">
          <div class="hero-slide-sheen"></div>
        </div>
      </a>
    </div>
  `).join("");

  // Render dots
  if (dotsContainer) {
    if (heroBannerState.banners.length <= 1) {
      dotsContainer.style.display = "none";
    } else {
      dotsContainer.style.display = "flex";
      dotsContainer.innerHTML = heroBannerState.banners.map((_, idx) => `
        <button type="button" class="hero-dot ${idx === 0 ? "active" : ""}" data-slide="${idx}" aria-label="الانتقال للبانر ${idx + 1}"></button>
      `).join("");

      dotsContainer.querySelectorAll(".hero-dot").forEach(dot => {
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          const targetIndex = parseInt(dot.getAttribute("data-slide"), 10);
          goToHeroSlide(targetIndex);
          restartHeroAutoTimer();
        });
      });
    }
  }

  // Prev / Next button visibility
  const prevBtn = document.getElementById("hero-prev-btn");
  const nextBtn = document.getElementById("hero-next-btn");
  if (prevBtn && nextBtn) {
    if (heroBannerState.banners.length <= 1) {
      prevBtn.style.display = "none";
      nextBtn.style.display = "none";
    } else {
      prevBtn.style.display = "flex";
      nextBtn.style.display = "flex";
    }
  }

  startHeroAutoTimer();
}

function goToHeroSlide(index) {
  const slides = document.querySelectorAll("#hero-slider-track .hero-slide");
  const dots = document.querySelectorAll("#hero-slider-dots .hero-dot");
  if (!slides.length) return;

  const total = slides.length;
  heroBannerState.currentIndex = ((index % total) + total) % total;

  slides.forEach((slide, idx) => {
    slide.classList.toggle("active", idx === heroBannerState.currentIndex);
  });

  dots.forEach((dot, idx) => {
    dot.classList.toggle("active", idx === heroBannerState.currentIndex);
  });
}

function nextHeroSlide() {
  goToHeroSlide(heroBannerState.currentIndex + 1);
}

function prevHeroSlide() {
  goToHeroSlide(heroBannerState.currentIndex - 1);
}

function startHeroAutoTimer() {
  stopHeroAutoTimer();
  if (heroBannerState.banners.length <= 1) return;

  heroBannerState.timer = setInterval(() => {
    if (!heroBannerState.isPaused) {
      nextHeroSlide();
    }
  }, heroBannerState.interval);
}

function stopHeroAutoTimer() {
  if (heroBannerState.timer) {
    clearInterval(heroBannerState.timer);
    heroBannerState.timer = null;
  }
}

function restartHeroAutoTimer() {
  startHeroAutoTimer();
}

function initHeroBannerCarousel() {
  const container = document.getElementById("hero-carousel-container");
  if (!container) return;

  // Initialize slides and dots
  renderHeroBannerCarousel(heroBannerState.banners);

  // Nav buttons
  const prevBtn = document.getElementById("hero-prev-btn");
  const nextBtn = document.getElementById("hero-next-btn");
  if (prevBtn) {
    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      prevHeroSlide();
      restartHeroAutoTimer();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      nextHeroSlide();
      restartHeroAutoTimer();
    });
  }

  // Hover pause
  container.addEventListener("mouseenter", () => {
    heroBannerState.isPaused = true;
  });
  container.addEventListener("mouseleave", () => {
    heroBannerState.isPaused = false;
  });

  // Touch swipe support for mobile
  container.addEventListener("touchstart", (e) => {
    heroBannerState.touchStartX = e.changedTouches[0].screenX;
    heroBannerState.isPaused = true;
  }, { passive: true });

  container.addEventListener("touchend", (e) => {
    heroBannerState.touchEndX = e.changedTouches[0].screenX;
    const diff = heroBannerState.touchEndX - heroBannerState.touchStartX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        // Swiped right (in RTL brings previous/next)
        prevHeroSlide();
      } else {
        // Swiped left
        nextHeroSlide();
      }
      restartHeroAutoTimer();
    }
    setTimeout(() => {
      heroBannerState.isPaused = false;
    }, 1500);
  }, { passive: true });

  // Pause when page is hidden/inactive tab
  document.addEventListener("visibilitychange", () => {
    heroBannerState.isPaused = document.hidden;
  });
}

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

    // 2. Hero Multi-Banner Carousel Synchronization
    const heroSection = document.getElementById("hero-section");
    if (heroSection) {
      if (banners.hero && banners.hero.enabled === false) {
        heroSection.style.display = "none";
        stopHeroAutoTimer();
      } else {
        heroSection.style.display = "";

        if (banners.heroInterval && !isNaN(banners.heroInterval)) {
          heroBannerState.interval = parseInt(banners.heroInterval, 10) * 1000;
        }

        if (Array.isArray(banners.heroList) && banners.heroList.length > 0) {
          renderHeroBannerCarousel(banners.heroList);
        } else if (banners.hero && banners.hero.image) {
          // Backward compatibility if single hero banner was saved
          const singleList = [{
            image: banners.hero.image,
            title: banners.hero.title || "",
            link: banners.hero.btnLink || "#products-section",
            enabled: true
          }];
          renderHeroBannerCarousel(singleList);
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
