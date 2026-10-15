/**
 * Helha Store - Social Proof & Sales Pop Engine (إشعارات الدليل الاجتماعي ومبيعات المنتجات)
 * 
 * Features:
 * 1. Live Sales Pop Notifications in authentic Arabic.
 * 2. Real product names, real images, authentic Egyptian names and cities.
 * 3. 1-Click navigation directly to the exact product page.
 * 4. Deterministic sales count for each product (>1000 purchases).
 * 5. Safe mobile placement that never conflicts with bottom app bar or icons.
 * 6. Waits for PWA install banner to be dismissed or absent before displaying.
 */

(function (window) {
  "use strict";

  // 1. Egyptian Names Pool (رجال ونساء)
  const SALES_POP_NAMES = [
    "محمد نصر",
    "أحمد محمود الشناوي",
    "محمود عبد الرحمن",
    "سارة أحمد الشناوي",
    "عمر خالد رضوان",
    "مريم عبد الله",
    "مصطفى الجوهري",
    "إيمان الشناوي",
    "كريم صبري النجار",
    "فاطمة حسن الدسوقي",
    "طارق العوضي",
    "آية مصطفى",
    "يوسف خليل",
    "نور الهدى الشريف",
    "إبراهيم خليل غنيم",
    "هبة فتحي",
    "ياسر عثمان",
    "شيماء الصاوي",
    "حسام الدين حسن",
    "دينا إبراهيم غريب",
    "عمرو سليم الهواري",
    "أميرة بدر",
    "وليد عبد الصبور",
    "ياسمين عبد الرحمن",
    "محمد رفعت بركات",
    "نورهان كمال",
    "بهاء الدين الديب",
    "رحمة الصفتي",
    "هشام القاضي",
    "هدى البدري",
    "وائل السنباطي",
    "إسراء الشافعي",
    "صلاح الهواري",
    "سلمى طارق",
    "أيمن الشربيني",
    "منة الله حسام",
    "مدحت عاشور",
    "رنا فاروق",
    "أشرف جلال",
    "حبيبة النجار",
    "معتز درويش",
    "هاجر العوضي",
    "أحمد الدمرداش",
    "ندى غنيم",
    "بلال المنسي",
    "سحر الهواري",
    "أنس قطب",
    "رضوى خفاجي"
  ];

  // 2. Egyptian Governorates & Key Cities (المحافظات والمدن المصرية)
  const SALES_POP_CITIES = [
    "المنصورة",
    "القاهرة - المعادي",
    "الجيزة - الدقي",
    "الإسكندرية - سموحة",
    "طنطا",
    "القاهرة - التجمع الخامس",
    "الزقازيق",
    "القاهرة - مصر الجديدة",
    "المحلة الكبرى",
    "الجيزة - الشيخ زايد",
    "دمياط",
    "بورسعيد",
    "الإسماعيلية",
    "السويس",
    "بنها",
    "دمنهور",
    "كفر الشيخ",
    "الفيوم",
    "بني سويف",
    "المنيا",
    "أسيوط",
    "سوهاج",
    "قنا",
    "الأقصر",
    "أسوان",
    "شبين الكوم",
    "القاهرة - شبرا",
    "الجيزة - المهندسين",
    "الإسكندرية - سيدي جابر"
  ];

  // Helper: Deterministic Hash with Avalanche (FNV-1a + Murmur3 fmix32)
  function hashString(str) {
    let h = 0x811c9dc5;
    const s = String(str || "helha");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return Math.abs(h);
  }

  // PRNG (Pseudo-Random Number Generator with Seed)
  function createPRNG(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // Shuffle Array (Fisher-Yates)
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const SocialProofModule = {
    timerId: null,
    cooldownUntil: 0,
    containerEl: null,
    currentCardEl: null,
    shuffledProducts: [],
    productIndex: 0,
    nameIndex: 0,
    cityIndex: 0,
    shuffledNames: [],
    shuffledCities: [],
    isInitialized: false,

    /**
     * Compute a deterministic sales count for any product (> 1000)
     * Consistent across reloads and pages for the same product
     */
    getProductSalesCount(product) {
      if (!product) return 1280;
      const key = String(product.id || product.name || "prod");
      const h = hashString(key);
      const rand = createPRNG(h);
      // Produce realistic count between 1,120 and 3,950 rounded to nearest 5 or 10
      const base = 1120 + Math.floor(rand() * 2830);
      const rounded = Math.round(base / 5) * 5;
      return rounded;
    },

    /**
     * Format number with Arabic locale or comma separator
     */
    formatNumber(num) {
      return Number(num).toLocaleString("en-US");
    },

    /**
     * Get HTML for the sales count badge to render on product cards or pages
     */
    getSalesBadgeHTML(product, isSinglePage) {
      const count = this.getProductSalesCount(product);
      const formatted = this.formatNumber(count);
      if (isSinglePage) {
        return `
          <div class="prod-sales-badge-single" title="إجمالي عدد الطلبات المكتملة لهذا المنتج من متجر حِلها">
            <span class="sales-fire-icon">🔥</span>
            <span>تم شراء هذا المنتج <strong>${formatted}</strong> مرة</span>
            <span class="sales-verified-tick" title="تم التحقق من تقييمات الشراء">✔️</span>
          </div>
        `;
      }
      return `
        <div class="product-sales-count-badge" title="تم شراء هذا المنتج ${formatted} مرة">
          <span class="sales-fire-icon">🔥</span>
          <span>تم شراء هذا المنتج <strong>${formatted}</strong> مرة</span>
        </div>
      `;
    },

    /**
     * Get available products from the current environment
     */
    getProductsPool() {
      if (window.AppState && Array.isArray(window.AppState.products) && window.AppState.products.length > 0) {
        return window.AppState.products;
      }
      if (typeof DEMO_PRODUCTS !== "undefined" && Array.isArray(DEMO_PRODUCTS) && DEMO_PRODUCTS.length > 0) {
        return DEMO_PRODUCTS;
      }
      return [];
    },

    /**
     * Check if PWA install banner is currently visible on screen
     * User requested: "واجعلها تظهر بعد الغاء بانر تثبيت التطبيق او الغاء البانر"
     */
    isPwaBannerVisible() {
      const pwaBanner = document.getElementById("pwa-install-banner");
      if (!pwaBanner) return false;
      const style = window.getComputedStyle(pwaBanner);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    },

    /**
     * Initialize container element
     */
    initContainer() {
      if (this.containerEl) return;
      let el = document.getElementById("sales-pop-container");
      if (!el) {
        el = document.createElement("div");
        el.id = "sales-pop-container";
        el.className = "sales-pop-container";
        el.setAttribute("aria-live", "polite");
        document.body.appendChild(el);
      }
      this.containerEl = el;
    },

    /**
     * Main initialization
     */
    init() {
      if (this.isInitialized) return;
      this.isInitialized = true;

      this.shuffledNames = shuffleArray(SALES_POP_NAMES);
      this.shuffledCities = shuffleArray(SALES_POP_CITIES);

      this.initContainer();

      // Start the loop after a gentle initial delay (6 seconds)
      setTimeout(() => {
        this.scheduleNext(1000);
      }, 5500);
    },

    /**
     * Schedule next pop
     */
    scheduleNext(delayMs) {
      if (this.timerId) {
        clearTimeout(this.timerId);
      }
      this.timerId = setTimeout(() => {
        this.triggerPop();
      }, delayMs);
    },

    /**
     * Trigger a single sales pop
     */
    triggerPop() {
      // 1. Check cooldown (e.g. if user closed a popup)
      if (Date.now() < this.cooldownUntil) {
        this.scheduleNext(12000);
        return;
      }

      // 2. Check if PWA banner is currently visible. If so, postpone!
      if (this.isPwaBannerVisible()) {
        this.scheduleNext(6000);
        return;
      }

      // 3. Check if cart overlay or modal is active
      const cartOverlay = document.querySelector(".cart-overlay.active");
      const modalOverlay = document.querySelector(".modal-overlay.active");
      if (cartOverlay || modalOverlay) {
        this.scheduleNext(8000);
        return;
      }

      // 4. Get product
      const pool = this.getProductsPool();
      if (!pool || pool.length === 0) {
        this.scheduleNext(5000);
        return;
      }

      if (this.shuffledProducts.length === 0 || this.productIndex >= this.shuffledProducts.length) {
        this.shuffledProducts = shuffleArray(pool);
        this.productIndex = 0;
      }

      const prod = this.shuffledProducts[this.productIndex++];

      // 5. Get Name & City
      if (this.nameIndex >= this.shuffledNames.length) {
        this.shuffledNames = shuffleArray(SALES_POP_NAMES);
        this.nameIndex = 0;
      }
      const personName = this.shuffledNames[this.nameIndex++];

      if (this.cityIndex >= this.shuffledCities.length) {
        this.shuffledCities = shuffleArray(SALES_POP_CITIES);
        this.cityIndex = 0;
      }
      const cityName = this.shuffledCities[this.cityIndex++];

      // 6. Random realistic minutes (between 3 and 45 minutes)
      const minutesAgo = Math.floor(Math.random() * 42) + 3;

      // 7. Render Card
      this.showPopCard({
        product: prod,
        name: personName,
        city: cityName,
        minutesAgo: minutesAgo
      });
    },

    /**
     * Display the sales pop card in DOM
     */
    showPopCard(data) {
      this.initContainer();

      // Dismiss any existing card smoothly
      if (this.currentCardEl) {
        this.currentCardEl.remove();
        this.currentCardEl = null;
      }

      const prod = data.product;
      const prodImg = (Array.isArray(prod.images) && prod.images.length > 0)
        ? prod.images[0]
        : (prod.image || "assets/logo.jpg");
      const prodName = prod.name || "منتج من متجر حِلها";
      const targetUrl = `product.html?id=${encodeURIComponent(prod.id)}`;

      const card = document.createElement("div");
      card.className = "sales-pop-card";
      card.setAttribute("role", "alert");
      card.innerHTML = `
        <button type="button" class="sales-pop-close-btn" aria-label="إغلاق التنبيه" title="إغلاق">✕</button>
        <div class="sales-pop-thumb-wrap">
          <img src="${prodImg}" alt="${prodName}" class="sales-pop-thumb" onerror="this.src='assets/logo.jpg'" loading="lazy">
        </div>
        <div class="sales-pop-content">
          <div class="sales-pop-header">
            <span class="sales-pop-customer">${data.name}</span>
            <span class="sales-pop-separator">من</span>
            <span class="sales-pop-city">${data.city}</span>
          </div>
          <div class="sales-pop-action">
            اشترى <strong class="sales-pop-prod-title">${prodName}</strong>
          </div>
          <div class="sales-pop-meta">
            <span class="sales-pop-time">منذ ${data.minutesAgo} دقيقة</span>
            <span class="sales-pop-verified"><span class="sales-pop-badge-icon">✔️</span> تم الشراء</span>
          </div>
        </div>
      `;

      // Click to open product
      card.addEventListener("click", (e) => {
        // Ignore if clicked on close button
        if (e.target.closest(".sales-pop-close-btn")) {
          return;
        }
        window.location.href = targetUrl;
      });

      // Close button handler
      const closeBtn = card.querySelector(".sales-pop-close-btn");
      if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.dismissCurrent(true);
        });
      }

      this.containerEl.appendChild(card);
      this.currentCardEl = card;

      // Auto dismiss after 5.5 seconds, then schedule next after 12 - 18 seconds
      const displayDuration = 5500;
      const nextDelay = 12000 + Math.floor(Math.random() * 6000);

      setTimeout(() => {
        if (this.currentCardEl === card) {
          this.dismissCurrent(false);
          this.scheduleNext(nextDelay);
        }
      }, displayDuration);
    },

    /**
     * Dismiss current card with exit animation
     */
    dismissCurrent(isManualClose) {
      if (!this.currentCardEl) return;
      const card = this.currentCardEl;
      card.classList.add("sales-pop-leaving");

      if (isManualClose) {
        // Cooldown for 35 seconds if user closed it manually
        this.cooldownUntil = Date.now() + 35000;
        this.scheduleNext(36000);
      }

      setTimeout(() => {
        if (card.parentNode) {
          card.remove();
        }
        if (this.currentCardEl === card) {
          this.currentCardEl = null;
        }
      }, 350);
    }
  };

  // Expose globally
  window.SocialProofModule = SocialProofModule;

  // Auto-init on DOMContentLoaded
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => SocialProofModule.init());
    } else {
      SocialProofModule.init();
    }
  }

})(window);
