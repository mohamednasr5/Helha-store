/**
 * Product Direct Checkout & Landing Page Logic
 * Matches exact COD Single-Product Landing Page flow
 */

const ProductPage = {
  currentProduct: null,
  selectedOfferIndex: 0,
  couponDiscount: 0,
  appliedCoupon: null,
  shippingFee: 50,
  shippingSettings: null,
  recommendedProducts: [],
  autoScrollTimer: null,
  galleryImages: [],
  currentGalleryIndex: 0,
  galleryAutoTimer: null,

  // Governorates of Egypt
  governorates: [
    "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "الشرقية", "القليوبية",
    "المنوفية", "الغربية", "كفر الشيخ", "البحيرة", "دمياط", "بورسعيد",
    "الإسماعيلية", "السويس", "الفيوم", "بني سويف", "المنيا", "أسيوط",
    "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "شمال سيناء",
    "جنوب سيناء", "الوادي الجديد", "مطروح"
  ],

  async init() {
    this.populateGovernorates();
    this.initShippingListener();
    await this.loadProduct();
    this.setupListeners();
    await this.loadRecommendedProducts();
    this.updateMobileCartGlow();
    this.trackVisitor();
  },

  initShippingListener() {
    if (typeof db !== "undefined" && db) {
      db.ref("settings/shipping").on("value", (snap) => {
        const val = snap.val();
        if (val) {
          this.shippingSettings = val;
          this.recalculateShipping();
        }
      });
    }
  },

  populateGovernorates() {
    const select = document.getElementById("order-gov");
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>اختر المحافظة...</option>' +
      this.governorates.map(gov => `<option value="${gov}">${gov}</option>`).join("");

    select.addEventListener("change", () => {
      this.recalculateShipping();
    });
  },

  async loadProduct() {
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get("id") || "demo_1";

    // 1. Try fetching from Firebase
    if (typeof db !== "undefined" && db) {
      try {
        const snap = await db.ref(`products/${prodId}`).once("value");
        const val = snap.val();
        if (val) {
          this.currentProduct = { ...val, id: prodId };
          this.render();
          return;
        }
      } catch (e) {
        console.warn("Could not load from Firebase:", e);
      }
    }

    // 2. Fallback to DEMO_PRODUCTS
    const found = DEMO_PRODUCTS.find(p => String(p.id) === String(prodId)) || DEMO_PRODUCTS[0];
    this.currentProduct = found;
    this.render();
  },

  render() {
    const p = this.currentProduct;
    if (!p) return;

    // Dynamic SEO Document Title & Meta Description (Long-Tail Target)
    document.title = `سعر ${p.name} في مصر | شراء أونلاين مع التوصيل - متجر حِلها`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = `تعرف على سعر ومواصفات ${p.name} في مصر. تسوق الآن شراء أونلاين بأفضل سعر مع التوصيل لكافة المحافظات والدفع عند الاستلام بعد المعاينة من متجر حِلها.`;
    }

    // Product Image Gallery (Up to 10 Images + Auto Slider)
    this.initGallery(p);

    // Title & Rating
    const titleEl = document.getElementById("prod-title");
    if (titleEl) titleEl.textContent = p.name;

    const countEl = document.getElementById("prod-review-count");
    if (countEl) countEl.textContent = `(${p.reviewsCount || 4} تقييم)`;

    // Price & Discount
    const priceEl = document.getElementById("prod-main-price");
    if (priceEl) priceEl.innerHTML = `${p.price} <small>ج.م</small>`;

    const origEl = document.getElementById("prod-original-price");
    const badgeEl = document.getElementById("prod-discount-badge");

    const originalPrice = p.originalPrice || Math.round(p.price * 1.15);
    if (origEl) origEl.textContent = `${originalPrice} ج.م`;

    const discountPct = Math.round(((originalPrice - p.price) / originalPrice) * 100);
    if (badgeEl) badgeEl.textContent = `${discountPct}%`;

    const availability = p.availability || "in_stock";
    const stockCount = p.stockCount !== undefined && p.stockCount !== null ? Number(p.stockCount) : 50;
    const isPreorder = availability === "preorder";
    const isOutOfStock = availability === "out_of_stock";
    const isLowStock = !isPreorder && !isOutOfStock && stockCount > 0 && stockCount <= 3;

    // Render stock status banner/badge
    const stockContainer = document.getElementById("prod-stock-status-container");
    if (stockContainer) {
      if (isPreorder) {
        stockContainer.innerHTML = `
          <div style="background:#fef3c7; border:1px solid #f59e0b; color:#b45309; padding:0.6rem 1rem; border-radius:8px; font-weight:800; font-size:0.95rem; display:flex; align-items:center; gap:0.5rem;">
            <span>⏳</span>
            <span>هذا المنتج متاح حالياً للحجز والطلب المسبق</span>
          </div>
        `;
      } else if (isOutOfStock) {
        stockContainer.innerHTML = `
          <div style="background:#fee2e2; border:1px solid #ef4444; color:#b91c1c; padding:0.6rem 1rem; border-radius:8px; font-weight:800; font-size:0.95rem; display:flex; align-items:center; gap:0.5rem;">
            <span>❌</span>
            <span>نعتذر، هذا المنتج غير متوفر حالياً بالمخزن</span>
          </div>
        `;
      } else if (isLowStock) {
        stockContainer.innerHTML = `
          <div style="background:#fef2f2; border:1px solid #f87171; color:#dc2626; padding:0.6rem 1rem; border-radius:8px; font-weight:800; font-size:0.95rem; display:flex; align-items:center; gap:0.5rem; animation:pulse 2s infinite;">
            <span>🔥</span>
            <span>أوشك على النفاذ! متبقي فقط ${stockCount} قطع في المخزن</span>
          </div>
        `;
      } else {
        stockContainer.innerHTML = `
          <div style="background:#f0fdf4; border:1px solid #86efac; color:#166534; padding:0.5rem 0.85rem; border-radius:8px; font-weight:700; font-size:0.88rem; display:inline-flex; align-items:center; gap:0.4rem;">
            <span>✅</span>
            <span>متوفر بالمخزن - شحن فوري لجميع المحافظات</span>
          </div>
        `;
      }
    }

    // Top action buttons and preorder UI
    const topBuyBtn = document.getElementById("btn-top-buy");
    const topCartBtn = document.getElementById("btn-add-to-cart-top");
    const warningBox = document.getElementById("preorder-red-warning-box");
    const formTitle = document.getElementById("order-form-title");
    const bottomSubmitBtn = document.getElementById("btn-bottom-submit");
    const offersSection = document.querySelector(".offers-section");
    const calculationCard = document.querySelector(".calculation-card");

    if (isPreorder) {
      if (topBuyBtn) {
        topBuyBtn.disabled = false;
        topBuyBtn.style.background = "#f59e0b";
        topBuyBtn.textContent = "حجز طلب مسبق ⏳";
      }
      if (topCartBtn) topCartBtn.style.display = "none";
      if (warningBox) warningBox.style.display = "block";
      if (formTitle) {
        formTitle.innerHTML = `ادخل بياناتك وعند توفر منتج ( <strong>${p.name}</strong> ) سيصلك اشعار عبر واتساب ⏳`;
      }
      if (bottomSubmitBtn) {
        bottomSubmitBtn.style.background = "#f59e0b";
        bottomSubmitBtn.textContent = "تأكيد حجز الطلب المسبق ⏳";
      }
      if (offersSection) offersSection.style.display = "none";
      if (calculationCard) calculationCard.style.display = "none";
    } else if (isOutOfStock) {
      if (topBuyBtn) {
        topBuyBtn.disabled = true;
        topBuyBtn.style.background = "#94a3b8";
        topBuyBtn.style.cursor = "not-allowed";
        topBuyBtn.textContent = "المنتج غير متوفر حالياً ❌";
      }
      if (topCartBtn) topCartBtn.style.display = "none";
      if (warningBox) warningBox.style.display = "none";
      if (offersSection) offersSection.style.display = "none";
      if (calculationCard) calculationCard.style.display = "none";
      const formContainer = document.getElementById("order-form-container");
      if (formContainer) {
        formContainer.innerHTML = `
          <div style="text-align:center; padding:2.5rem 1.5rem; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0;">
            <div style="font-size:3rem; margin-bottom:1rem;">❌</div>
            <h3 style="color:#b91c1c; font-weight:800; margin-bottom:0.5rem;">هذا المنتج غير متوفر حالياً</h3>
            <p style="color:#64748b; font-size:0.95rem; margin-bottom:1.5rem;">نعتذر لعدم توفر كميات في المخزن في الوقت الحالي. يمكنك تصفح باقي المنتجات والعروض الرائعة.</p>
            <a href="index.html" class="btn-primary" style="display:inline-block; padding:0.8rem 1.8rem; text-decoration:none;">تصفح باقي المنتجات</a>
          </div>
        `;
      }
    } else {
      if (topBuyBtn) {
        topBuyBtn.disabled = false;
        topBuyBtn.style.background = "#175349";
        topBuyBtn.textContent = "اضغط هنا للشراء 🛒";
      }
      if (topCartBtn) topCartBtn.style.display = "inline-flex";
      if (warningBox) warningBox.style.display = "none";
      if (formTitle) formTitle.textContent = "يرجى إدخال معلوماتك لإكمال الطلب 🚚";
      if (bottomSubmitBtn) {
        bottomSubmitBtn.style.background = "var(--primary)";
        bottomSubmitBtn.textContent = "تأكيد واستكمال الطلب الآن 🚚";
      }
      if (offersSection) offersSection.style.display = "block";
      if (calculationCard) calculationCard.style.display = "block";
    }

    // Sales Copy
    this.renderSalesPitch(p);

    // Offers & Bundles
    this.renderOffers(p);

    // Calculation Summary
    this.updateCalculation();
  },

  initGallery(p) {
    // 1. Collect images array (up to 10 images)
    let images = [];
    if (Array.isArray(p.images) && p.images.length > 0) {
      images = p.images.filter(Boolean);
    } else if (p.image) {
      images = [p.image];
    } else {
      images = ["assets/logo.jpg"];
    }
    this.galleryImages = images.slice(0, 10);
    this.currentGalleryIndex = 0;

    const heroImg = document.getElementById("prod-hero-img");
    const prevBtn = document.getElementById("gallery-prev-btn");
    const nextBtn = document.getElementById("gallery-next-btn");
    const counterBadge = document.getElementById("gallery-counter-badge");
    const dotsContainer = document.getElementById("gallery-dots");
    const thumbsContainer = document.getElementById("gallery-thumbnails-strip");
    const galleryContainer = document.getElementById("product-gallery-container");

    if (heroImg) {
      heroImg.src = this.galleryImages[0];
      heroImg.alt = p.name || "صورة المنتج";
    }

    // If only 1 image, hide controls & stop auto slideshow
    if (this.galleryImages.length <= 1) {
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (counterBadge) counterBadge.style.display = "none";
      if (dotsContainer) dotsContainer.style.display = "none";
      if (thumbsContainer) thumbsContainer.style.display = "none";
      this.stopGalleryAutoPlay();
      return;
    }

    // Show controls for multiple images
    if (prevBtn) prevBtn.style.display = "flex";
    if (nextBtn) nextBtn.style.display = "flex";
    if (counterBadge) {
      counterBadge.style.display = "block";
      counterBadge.textContent = `1 / ${this.galleryImages.length}`;
    }

    // Render Dots
    if (dotsContainer) {
      dotsContainer.style.display = "flex";
      dotsContainer.innerHTML = this.galleryImages.map((_, idx) => `
        <button type="button" class="gallery-dot ${idx === 0 ? 'active' : ''}" data-idx="${idx}" aria-label="الصورة ${idx + 1}" title="الصورة ${idx + 1}"></button>
      `).join("");

      dotsContainer.querySelectorAll(".gallery-dot").forEach(dot => {
        dot.addEventListener("click", (e) => {
          const idx = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
          this.showGalleryImage(idx);
          this.resetGalleryAutoPlay();
        });
      });
    }

    // Render Thumbnails
    if (thumbsContainer) {
      thumbsContainer.style.display = "flex";
      thumbsContainer.innerHTML = this.galleryImages.map((url, idx) => `
        <button type="button" class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-idx="${idx}" aria-label="عرض صورة ${idx + 1}" title="عرض صورة ${idx + 1}">
          <img src="${url}" alt="${p.name || ''} - ${idx + 1}" onerror="this.src='assets/logo.jpg'">
        </button>
      `).join("");

      thumbsContainer.querySelectorAll(".gallery-thumb").forEach(thumb => {
        thumb.addEventListener("click", (e) => {
          const idx = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
          this.showGalleryImage(idx);
          this.resetGalleryAutoPlay();
        });
      });
    }

    // Navigation buttons listeners (Prev/Next)
    if (prevBtn && !prevBtn._hasGalleryListener) {
      prevBtn.addEventListener("click", () => {
        this.prevGalleryImage();
        this.resetGalleryAutoPlay();
      });
      prevBtn._hasGalleryListener = true;
    }

    if (nextBtn && !nextBtn._hasGalleryListener) {
      nextBtn.addEventListener("click", () => {
        this.nextGalleryImage();
        this.resetGalleryAutoPlay();
      });
      nextBtn._hasGalleryListener = true;
    }

    // Auto slideshow: automatically cycle images every 3.5 seconds
    this.startGalleryAutoPlay();

    // Pause auto slideshow on mouse hover or touch
    if (galleryContainer && !galleryContainer._hasHoverListeners) {
      galleryContainer.addEventListener("mouseenter", () => {
        this.stopGalleryAutoPlay();
      });
      galleryContainer.addEventListener("mouseleave", () => {
        this.startGalleryAutoPlay();
      });
      galleryContainer.addEventListener("touchstart", () => {
        this.stopGalleryAutoPlay();
      }, { passive: true });
      galleryContainer.addEventListener("touchend", () => {
        this.startGalleryAutoPlay();
      }, { passive: true });
      galleryContainer._hasHoverListeners = true;
    }

    // Pause autoplay when gallery is scrolled out of viewport (prevents any layout shifts or unwanted page scrolls)
    if ("IntersectionObserver" in window && galleryContainer && !galleryContainer._hasObserver) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.startGalleryAutoPlay();
          } else {
            this.stopGalleryAutoPlay();
          }
        });
      }, { threshold: 0.1 });
      observer.observe(galleryContainer);
      galleryContainer._hasObserver = true;
    }
  },

  showGalleryImage(index) {
    if (!this.galleryImages || this.galleryImages.length === 0) return;
    const len = this.galleryImages.length;
    this.currentGalleryIndex = ((index % len) + len) % len;

    const heroImg = document.getElementById("prod-hero-img");
    if (heroImg) {
      heroImg.style.opacity = "0.7";
      setTimeout(() => {
        heroImg.src = this.galleryImages[this.currentGalleryIndex];
        heroImg.style.opacity = "1";
      }, 110);
    }

    const counterBadge = document.getElementById("gallery-counter-badge");
    if (counterBadge) {
      counterBadge.textContent = `${this.currentGalleryIndex + 1} / ${len}`;
    }

    // Update Dots active class
    const dots = document.querySelectorAll(".gallery-dot");
    dots.forEach((dot, idx) => {
      dot.classList.toggle("active", idx === this.currentGalleryIndex);
    });

    // Update Thumbs active class & scroll ONLY the thumbs strip container horizontally (NEVER the page window!)
    const thumbsStrip = document.getElementById("gallery-thumbnails-strip");
    const thumbs = document.querySelectorAll(".gallery-thumb");
    thumbs.forEach((thumb, idx) => {
      const isActive = idx === this.currentGalleryIndex;
      thumb.classList.toggle("active", isActive);
      if (isActive && thumbsStrip) {
        const targetLeft = thumb.offsetLeft - (thumbsStrip.clientWidth / 2) + (thumb.clientWidth / 2);
        thumbsStrip.scrollTo({ left: targetLeft, behavior: "smooth" });
      }
    });
  },

  nextGalleryImage() {
    this.showGalleryImage(this.currentGalleryIndex + 1);
  },

  prevGalleryImage() {
    this.showGalleryImage(this.currentGalleryIndex - 1);
  },

  startGalleryAutoPlay() {
    this.stopGalleryAutoPlay();
    if (!this.galleryImages || this.galleryImages.length <= 1) return;
    this.galleryAutoTimer = setInterval(() => {
      this.nextGalleryImage();
    }, 3500);
  },

  stopGalleryAutoPlay() {
    if (this.galleryAutoTimer) {
      clearInterval(this.galleryAutoTimer);
      this.galleryAutoTimer = null;
    }
  },

  resetGalleryAutoPlay() {
    this.stopGalleryAutoPlay();
    this.startGalleryAutoPlay();
  },

  renderSalesPitch(p) {
    const pitchTitleEl = document.getElementById("sales-pitch-title");
    const pitchIntroEl = document.getElementById("sales-pitch-intro");
    const benefitsEl = document.getElementById("sales-benefits-list");
    const specsEl = document.getElementById("sales-specs-text");
    const closingEl = document.getElementById("sales-closing-text");

    if (pitchTitleEl) {
      pitchTitleEl.innerHTML = `الميزان الرقمي الذكي: لمسة الدقة في مطبخك ✨👩‍🍳`;
      if (p.subtitle) pitchTitleEl.textContent = `${p.name}: ${p.subtitle} ✨`;
    }

    if (pitchIntroEl) {
      pitchIntroEl.textContent = p.description || 
        "هل سئمت من الطرق التقليدية والمعقدة والجهد الزائد بعد كل استخدام؟ حان الوقت لترقية أدواتك مع هذا الحل الذكي من متجر حِلها لتسهيل حياتك اليومية!";
    }

    if (benefitsEl) {
      const features = (p.features && p.features.length) ? p.features : [
        "دقة متناهية وسرعة فائقة في الأداء اليومي.",
        "تصميم عصري وخفيف الوزن وسهل التخزين والتنظيف.",
        "مواد عالية الجودة مقاومة للتلف والصدمات.",
        "توفير هائل في الوقت والجهد داخل المنزل."
      ];
      benefitsEl.innerHTML = features.map(f => `<li>${f}</li>`).join("");
    }

    if (specsEl) {
      specsEl.textContent = `تصميم عملي: خفيف الوزن، سهل التنظيف، ومصمم ليناسب يدك بشكل مريح. كما أنه صغير الحجم بحيث يمكنك تخزينه في أي درج أو زاوية دون أن يأخذ أي مساحة تذكر.`;
    }

    if (closingEl) {
      closingEl.textContent = `ببساطة: تخلص من الفوضى، وفّر وقتك ومجهودك، واستمتع بيومك مع حلول متجر حِلها!`;
    }
  },

  renderOffers(p) {
    const container = document.getElementById("offers-list-container");
    if (!container) return;

    const origUnitPrice = p.originalPrice || Math.round(p.price * 1.15);

    if (p.offers && p.offers.length > 0) {
      this.offers = p.offers.map((off, idx) => ({
        index: idx,
        qty: Number(off.qty) || (idx + 1),
        title: off.title,
        totalPrice: Number(off.totalPrice),
        unitPrice: off.unitPrice || Math.round(Number(off.totalPrice) / (Number(off.qty) || 1)),
        note: off.note || "",
        originalUnit: origUnitPrice
      }));
    } else {
      const unitPrice = p.price;
      const offer1Price = unitPrice;
      const offer2Price = Math.round(unitPrice * 2 * 0.88);
      const offer2Unit = Math.round(offer2Price / 2);
      const offer3Price = Math.round(unitPrice * 3 * 0.82);
      const offer3Unit = Math.round(offer3Price / 3);

      this.offers = [
        {
          index: 0,
          qty: 1,
          title: `اشتري ${p.name.split(" ")[0] || "المنتج"} بسعر ${offer1Price}ج فقط`,
          totalPrice: offer1Price,
          unitPrice: offer1Price,
          originalUnit: origUnitPrice
        },
        {
          index: 1,
          qty: 2,
          title: `اشتري 2 ${p.name.split(" ")[0] || "منتجات"} بـ ${offer2Price}ج فقط`,
          totalPrice: offer2Price,
          unitPrice: offer2Unit,
          originalUnit: origUnitPrice
        },
        {
          index: 2,
          qty: 3,
          title: `اشتري 3 ${p.name.split(" ")[0] || "منتجات"} بـ ${offer3Price}ج فقط`,
          totalPrice: offer3Price,
          unitPrice: offer3Unit,
          originalUnit: origUnitPrice
        }
      ];
    }

    container.innerHTML = this.offers.map((offer, idx) => `
      <div class="offer-card ${idx === this.selectedOfferIndex ? 'selected' : ''}" onclick="ProductPage.selectOffer(${idx})">
        <div class="offer-radio-wrap">
          <div class="custom-radio">
            <div class="custom-radio-inner"></div>
          </div>
          <span class="offer-label">${offer.title}</span>
        </div>
        ${offer.note || idx > 0 ? `
          <div class="offer-meta-details">
            ${offer.note ? `<div>${offer.note}</div>` : `
              <div>سعر القطعة: <strong>${offer.unitPrice} ج.م</strong></div>
              <div>السعر الأصلي: <span class="offer-original-price">${offer.originalUnit} ج.م</span></div>
            `}
          </div>
        ` : ''}
      </div>
    `).join("");
  },

  selectOffer(index) {
    this.selectedOfferIndex = index;
    const cards = document.querySelectorAll(".offer-card");
    cards.forEach((card, idx) => {
      if (idx === index) {
        card.classList.add("selected");
      } else {
        card.classList.remove("selected");
      }
    });
    this.recalculateShipping();
  },

  recalculateShipping() {
    const currentOffer = this.offers ? this.offers[this.selectedOfferIndex] : null;
    const subtotal = currentOffer ? currentOffer.totalPrice : (this.currentProduct ? this.currentProduct.price : 0);
    const govSelect = document.getElementById("order-gov");
    const selectedGov = govSelect ? govSelect.value : "";

    const s = this.shippingSettings;
    if (s) {
      if (s.freeShippingEnabled && Number(s.freeShippingThreshold) > 0 && subtotal >= Number(s.freeShippingThreshold)) {
        this.shippingFee = 0;
      } else if (s.mode === "flat") {
        this.shippingFee = Number(s.flatRate) || 0;
      } else if (s.mode === "per_gov") {
        if (selectedGov && s.govRates && s.govRates[selectedGov] !== undefined) {
          this.shippingFee = Number(s.govRates[selectedGov]);
        } else {
          this.shippingFee = Number(s.flatRate) || 50;
        }
      } else {
        this.shippingFee = Number(s.flatRate) || 50;
      }
    } else {
      this.shippingFee = 50;
    }

    this.updateCalculation();
  },

  updateCalculation() {
    const currentOffer = this.offers ? this.offers[this.selectedOfferIndex] : null;
    const subtotal = currentOffer ? currentOffer.totalPrice : (this.currentProduct ? this.currentProduct.price : 0);

    let discountAmount = 0;
    if (this.appliedCoupon) {
      if (this.appliedCoupon.type === "fixed") {
        discountAmount = Math.min(subtotal, Number(this.appliedCoupon.value) || 0);
      } else {
        discountAmount = Math.round(subtotal * ((Number(this.appliedCoupon.value) || 0) / 100));
      }
    }

    const finalTotal = Math.max(0, subtotal - discountAmount + this.shippingFee);

    const subtotalEl = document.getElementById("summary-subtotal");
    const discountRowEl = document.getElementById("summary-discount-row");
    const discountEl = document.getElementById("summary-discount");
    const shippingEl = document.getElementById("summary-shipping");
    const totalEl = document.getElementById("summary-total");
    const bottomBtnPriceEl = document.getElementById("btn-bottom-total");

    if (subtotalEl) subtotalEl.textContent = `${subtotal} ج.م`;

    if (discountRowEl && discountEl) {
      if (discountAmount > 0) {
        discountRowEl.style.display = "flex";
        discountEl.textContent = `-${discountAmount} ج.م (${this.appliedCoupon.code})`;
      } else {
        discountRowEl.style.display = "none";
      }
    }

    if (shippingEl) {
      if (this.shippingFee === 0) {
        shippingEl.textContent = "شحن مجاني 🎉";
        shippingEl.style.color = "#16a34a";
      } else {
        shippingEl.textContent = `${this.shippingFee} ج.م`;
        shippingEl.style.color = "inherit";
      }
    }

    if (totalEl) totalEl.textContent = `${finalTotal} ج.م`;
    if (bottomBtnPriceEl) bottomBtnPriceEl.textContent = `(${finalTotal} ج.م)`;
  },

  async applyCoupon() {
    const input = document.getElementById("order-coupon");
    const resultEl = document.getElementById("coupon-result");
    if (!input || !resultEl) return;

    const code = input.value.trim().toUpperCase();
    if (!code) {
      resultEl.textContent = "يرجى كتابة كود الخصم أولاً";
      resultEl.style.color = "#ea580c";
      return;
    }

    resultEl.textContent = "جاري التحقق من كود الخصم...";
    resultEl.style.color = "#6b7280";

    const currentOffer = this.offers ? this.offers[this.selectedOfferIndex] : null;
    const subtotal = currentOffer ? currentOffer.totalPrice : (this.currentProduct ? this.currentProduct.price : 0);

    try {
      let couponData = null;
      if (typeof db !== "undefined" && db) {
        const snap = await db.ref(`coupons/${code}`).once("value");
        couponData = snap.val();
      }

      if (!couponData) {
        if (code === "HELHA10" || code === "حلها10") {
          couponData = { code: "HELHA10", type: "percent", value: 10, status: "active" };
        } else if (code === "HELHA20" || code === "حلها20") {
          couponData = { code: "HELHA20", type: "percent", value: 20, status: "active" };
        } else {
          resultEl.textContent = "❌ كود الخصم غير موجود أو غير صالح";
          resultEl.style.color = "#dc2626";
          this.appliedCoupon = null;
          this.updateCalculation();
          return;
        }
      }

      if (couponData.status !== "active") {
        resultEl.textContent = "❌ كود الخصم غير مفعل حالياً";
        resultEl.style.color = "#dc2626";
        this.appliedCoupon = null;
        this.updateCalculation();
        return;
      }

      if (couponData.expiryDate && new Date(couponData.expiryDate).getTime() < Date.now()) {
        resultEl.textContent = "❌ لقد انتهت صلاحية هذا الكود";
        resultEl.style.color = "#dc2626";
        this.appliedCoupon = null;
        this.updateCalculation();
        return;
      }

      if (couponData.usageLimit && (couponData.usedCount || 0) >= Number(couponData.usageLimit)) {
        resultEl.textContent = "❌ وصل هذا الكود إلى الحد الأقصى للاستخدام";
        resultEl.style.color = "#dc2626";
        this.appliedCoupon = null;
        this.updateCalculation();
        return;
      }

      if (couponData.minOrder && subtotal < Number(couponData.minOrder)) {
        resultEl.textContent = `❌ الحد الأدنى لتفعيل هذا الكود هو ${couponData.minOrder} ج.م`;
        resultEl.style.color = "#dc2626";
        this.appliedCoupon = null;
        this.updateCalculation();
        return;
      }

      this.appliedCoupon = { ...couponData, code };
      const discountLabel = couponData.type === "fixed" ? `${couponData.value} ج.م` : `${couponData.value}%`;
      resultEl.textContent = `✅ تم تطبيق خصم (${discountLabel}) بنجاح!`;
      resultEl.style.color = "#16a34a";
      this.updateCalculation();
    } catch (err) {
      console.error("Coupon check error:", err);
      resultEl.textContent = "❌ تعذر التحقق من الكود، حاول مجدداً";
      resultEl.style.color = "#dc2626";
    }
  },

  scrollToOrderForm() {
    const formEl = document.getElementById("order-form-container");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  },

  setupListeners() {
    // Top buy button scrolls cleanly to form
    const topBuyBtn = document.getElementById("btn-top-buy");
    if (topBuyBtn) {
      topBuyBtn.addEventListener("click", (e) => {
        if (e) e.preventDefault();
        this.scrollToOrderForm();
      });
    }

    // Direct Order Form Submission
    const orderForm = document.getElementById("direct-order-form");
    if (orderForm) {
      orderForm.addEventListener("submit", (e) => this.handleOrderSubmit(e));
    }

    // Favorite heart toggle
    const favBtn = document.getElementById("btn-favorite");
    if (favBtn) {
      favBtn.addEventListener("click", () => {
        favBtn.classList.toggle("active");
        favBtn.textContent = favBtn.classList.contains("active") ? "❤️" : "🤍";
      });
    }

    // Share Product
    const shareBtn = document.getElementById("btn-share-product");
    if (shareBtn) {
      shareBtn.addEventListener("click", () => {
        if (navigator.share) {
          navigator.share({
            title: this.currentProduct ? this.currentProduct.name : "متجر حِلها",
            url: window.location.href
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText(window.location.href);
          alert("تم نسخ رابط المنتج إلى الحافظة بنجاح!");
        }
      });
    }
  },

  async handleOrderSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("order-name").value.trim();
    const phone = document.getElementById("order-phone").value.trim();
    const gov = document.getElementById("order-gov").value;
    const address = document.getElementById("order-address").value.trim();

    if (!name || !phone || !gov || !address) {
      alert("يرجى ملء جميع الحقول المطلوبة (الاسم، الهاتف، المحافظة، العنوان)!");
      return;
    }

    // Handle Pre-Order Mode Submission
    if (this.currentProduct && this.currentProduct.availability === "preorder") {
      const submitBtn = document.getElementById("btn-bottom-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "جاري تسجيل الحجز المسبق...";
      }

      const preorderData = {
        id: `pre_${Date.now()}`,
        productId: this.currentProduct.id,
        productName: this.currentProduct.name,
        customerName: name,
        customerPhone: phone,
        governorate: gov,
        address: address,
        status: "pending",
        timestamp: Date.now(),
        createdAt: new Date().toLocaleString("ar-EG")
      };

      try {
        if (typeof db !== "undefined" && db) {
          await db.ref("preorders").push(preorderData);
        }
        alert(`شكراً لك يا ${name}! 🎉\nتم تسجيل حجزك المسبق بنجاح لمنتج (${this.currentProduct.name}).\nسنقوم بإشعارك عبر واتساب فور توفر المنتج بالمخزن!`);
        window.location.href = "index.html";
      } catch (err) {
        console.error("Error saving preorder:", err);
        alert("حدث خطأ أثناء تسجيل طلبك المسبق. يرجى المحاولة مرة أخرى.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "تأكيد حجز الطلب المسبق ⏳";
        }
      }
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
      policyAgree.focus();
      return;
    }

    const submitBtn = document.getElementById("btn-bottom-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري تأكيد وتسجيل طلبك...";
    }

    const currentOffer = this.offers[this.selectedOfferIndex];
    const subtotal = currentOffer.totalPrice;
    let discountAmount = 0;
    if (this.appliedCoupon) {
      if (this.appliedCoupon.type === "fixed") {
        discountAmount = Math.min(subtotal, Number(this.appliedCoupon.value) || 0);
      } else {
        discountAmount = Math.round(subtotal * ((Number(this.appliedCoupon.value) || 0) / 100));
      }
    }
    const totalAmount = Math.max(0, subtotal - discountAmount + this.shippingFee);

    const orderId = "HLH-" + Math.floor(100000 + Math.random() * 900000);

    const orderData = {
      orderId: orderId,
      id: orderId,
      customerName: name,
      customerPhone: phone,
      city: gov,
      address: address,
      couponCode: this.appliedCoupon ? this.appliedCoupon.code : null,
      discountAmount: discountAmount,
      selectedOffer: {
        qty: currentOffer.qty,
        title: currentOffer.title,
        price: currentOffer.totalPrice
      },
      items: [
        {
          id: this.currentProduct.id,
          name: this.currentProduct.name,
          quantity: currentOffer.qty,
          price: currentOffer.unitPrice,
          image: this.currentProduct.image || "assets/logo.jpg"
        }
      ],
      subtotal: subtotal,
      shippingFee: this.shippingFee,
      totalAmount: totalAmount,
      status: "new",
      paymentMethod: "الدفع عند الاستلام",
      createdAt: new Date().toLocaleString("ar-EG"),
      timestamp: Date.now()
    };

    try {
      // 1. Save to Firebase
      if (typeof db !== "undefined" && db) {
        await db.ref(`orders/${orderId}`).set(orderData);
        db.ref("analytics/totalOrders").transaction((c) => (c || 0) + 1);
        db.ref("analytics/totalRevenue").transaction((c) => (c || 0) + totalAmount);

        // Record coupon usage in Firebase
        if (this.appliedCoupon && this.appliedCoupon.code) {
          try {
            const couponKey = this.appliedCoupon.code;
            const usageRef = db.ref(`coupons/${couponKey}/usages`).push();
            await usageRef.set({
              orderId: orderId,
              customerName: name,
              customerPhone: phone,
              discountAmount: discountAmount,
              totalAmount: totalAmount,
              timestamp: Date.now(),
              createdAt: new Date().toLocaleString("ar-EG")
            });
            db.ref(`coupons/${couponKey}/usedCount`).transaction((c) => (c || 0) + 1);
            db.ref(`coupons/${couponKey}/totalDiscountGiven`).transaction((d) => (d || 0) + discountAmount);
          } catch (cErr) {
            console.warn("Could not record coupon usage:", cErr);
          }
        }
      }

      // 2. Notify Telegram
      await TelegramService.notifyNewOrder(orderData);

      // 3. Show Success Overlay
      this.showSuccessModal(orderData);

    } catch (err) {
      console.error("Order submit error:", err);
      alert("حدث خطأ أثناء إرسال الطلب: " + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>اضغط هنا للشراء</span> <span id="btn-bottom-total">(${totalAmount} ج.م)</span>`;
      }
    }
  },

  showSuccessModal(order) {
    const overlay = document.getElementById("success-overlay");
    const codeEl = document.getElementById("success-order-code");

    if (codeEl) codeEl.textContent = `#${order.orderId}`;
    
    const trackBtn = document.getElementById("success-track-btn");
    if (trackBtn) {
      trackBtn.href = `track.html?order=${order.orderId}`;
    }

    if (overlay) overlay.classList.add("active");
  },

  async loadRecommendedProducts() {
    const track = document.getElementById("recommended-products-track");
    if (!track) return;

    let prods = [];
    if (typeof db !== "undefined" && db) {
      try {
        const snap = await db.ref("products").once("value");
        const val = snap.val();
        if (val) {
          prods = Object.keys(val).map(key => ({ ...val[key], id: key }));
        }
      } catch (err) {
        console.warn("Could not load recommended products from Firebase:", err);
      }
    }

    if (!prods.length && typeof DEMO_PRODUCTS !== "undefined") {
      prods = [...DEMO_PRODUCTS];
    }

    // Filter out current product
    const currentId = this.currentProduct ? String(this.currentProduct.id) : "";
    this.recommendedProducts = prods.filter(p => String(p.id) !== currentId);

    this.renderRecommendedProducts();
    this.initRecommendedAutoScroll();
  },

  renderRecommendedProducts() {
    const track = document.getElementById("recommended-products-track");
    if (!track) return;

    if (!this.recommendedProducts || !this.recommendedProducts.length) {
      const section = document.getElementById("recommended-products-section");
      if (section) section.style.display = "none";
      return;
    }

    track.innerHTML = this.recommendedProducts.map(p => {
      const originalPrice = p.originalPrice || (p.price ? Math.round(p.price * 1.15) : 0);
      const discountPct = (originalPrice > p.price) ? Math.round(((originalPrice - p.price) / originalPrice) * 100) : null;
      const img = p.image || "assets/logo.jpg";
      const name = p.name || "منتج متجر حِلها";

      return `
        <div class="recommended-card" onclick="window.location.href='product.html?id=${p.id}'">
          <div class="rec-card-img-wrap">
            <img src="${img}" alt="${name}" loading="lazy" onerror="this.src='assets/logo.jpg'">
            ${discountPct ? `<span class="rec-card-badge">خصم ${discountPct}%</span>` : ''}
          </div>
          <div class="rec-card-body">
            <h4 class="rec-card-title">${name}</h4>
            <div class="rec-card-pricing">
              <span class="rec-current-price">${p.price} ج.م</span>
              ${originalPrice ? `<span class="rec-orig-price">${originalPrice} ج.م</span>` : ''}
            </div>
            <button type="button" class="rec-card-btn" onclick="event.stopPropagation(); window.location.href='product.html?id=${p.id}'">
              <span>طلب المنتج</span> <span>🛍️</span>
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Pause auto-scroll on hover / touch
    track.addEventListener("mouseenter", () => {
      if (this.autoScrollTimer) clearInterval(this.autoScrollTimer);
    });
    track.addEventListener("mouseleave", () => {
      this.initRecommendedAutoScroll();
    });
    track.addEventListener("touchstart", () => {
      if (this.autoScrollTimer) clearInterval(this.autoScrollTimer);
    }, { passive: true });
    track.addEventListener("touchend", () => {
      this.initRecommendedAutoScroll();
    }, { passive: true });
  },

  scrollRecommended(direction) {
    const track = document.getElementById("recommended-products-track");
    if (!track) return;

    const scrollStep = 220;
    // In RTL, left arrow goes forward (-scrollStep), right arrow goes backward (+scrollStep)
    const amount = direction === "right" ? scrollStep : -scrollStep;
    track.scrollBy({ left: amount, behavior: "smooth" });

    // Reset auto-scroll interval so user has a full minute
    this.resetRecommendedTimer();
  },

  initRecommendedAutoScroll() {
    if (this.autoScrollTimer) clearInterval(this.autoScrollTimer);
    // User requested: moves automatically every minute (60,000 ms)
    this.autoScrollTimer = setInterval(() => {
      const track = document.getElementById("recommended-products-track");
      if (!track) return;

      const maxScroll = track.scrollWidth - track.clientWidth;
      const currentScroll = Math.abs(track.scrollLeft);

      if (currentScroll >= maxScroll - 20) {
        // Return smoothly to start
        track.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        // Scroll to next product
        track.scrollBy({ left: -220, behavior: "smooth" });
      }
    }, 60000); // 1 minute (60 seconds)
  },

  resetRecommendedTimer() {
    if (this.autoScrollTimer) clearInterval(this.autoScrollTimer);
    this.initRecommendedAutoScroll();
  },

  updateMobileCartGlow() {
    try {
      const saved = localStorage.getItem("helha_cart");
      const cart = saved ? JSON.parse(saved) : [];
      const totalCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const mobCartNavItems = document.querySelectorAll('.mobile-bottom-nav a[href*="#cart"], .mobile-bottom-nav a[href*="cart"]');
      let cartBubble = document.getElementById("mobile-cart-toast-bubble");

      if (totalCount > 0) {
        mobCartNavItems.forEach(item => item.classList.add("cart-glowing"));
        if (!cartBubble) {
          cartBubble = document.createElement("a");
          cartBubble.id = "mobile-cart-toast-bubble";
          cartBubble.className = "mobile-cart-toast-bubble";
          cartBubble.href = "index.html#cart";
          document.body.appendChild(cartBubble);
        }
        cartBubble.innerHTML = `<span>🛒 يوجد منتجات في السلة بانتظارك</span> <strong>(${totalCount})</strong>`;
        cartBubble.style.display = "flex";
      } else {
        mobCartNavItems.forEach(item => item.classList.remove("cart-glowing"));
        if (cartBubble) cartBubble.style.display = "none";
      }
    } catch (e) {
      console.warn("Cart glow error:", e);
    }
  },

  addToCart() {
    if (!this.currentProduct) return;
    const p = this.currentProduct;
    try {
      const saved = localStorage.getItem("helha_cart");
      let cart = saved ? JSON.parse(saved) : [];
      const existing = cart.find(item => String(item.id) === String(p.id));
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        cart.push({
          id: p.id,
          name: p.name,
          price: p.price,
          image: p.image || "assets/logo.jpg",
          quantity: 1
        });
      }
      localStorage.setItem("helha_cart", JSON.stringify(cart));
      this.updateMobileCartGlow();
      
      let toast = document.getElementById("product-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "product-toast";
        toast.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#16a34a; color:#fff; padding:0.75rem 1.5rem; border-radius:30px; font-weight:800; font-size:0.95rem; z-index:99999999; box-shadow:0 6px 20px rgba(22,163,74,0.35); transition:all 0.3s ease; text-align:center; max-width:90%;";
        document.body.appendChild(toast);
      }
      toast.innerHTML = `تمت إضافة "${p.name}" إلى السلة 🛍️ <a href="index.html#cart" style="color:#fff; text-decoration:underline; margin-right:8px; font-weight:900;">عرض السلة ↗</a>`;
      toast.style.opacity = "1";
      toast.style.visibility = "visible";
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.visibility = "hidden";
      }, 3500);
    } catch (e) {
      console.warn("Cart error:", e);
    }
  },

  async trackVisitor() {
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

      const ua = navigator.userAgent || "";
      let deviceType = "كمبيوتر 💻";
      if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) deviceType = "جهاز لوحي 📟";
      else if (/mobile|iphone|ipod|android.*mobile/i.test(ua) || window.innerWidth <= 768) deviceType = "هاتف محمول 📱";

      let os = "غير معروف";
      if (/android/i.test(ua)) os = "Android";
      else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
      else if (/windows/i.test(ua)) os = "Windows";
      else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
      else if (/linux/i.test(ua)) os = "Linux";

      let browser = "متصفح الويب";
      if (/edg/i.test(ua)) browser = "Edge";
      else if (/chrome|crios/i.test(ua)) browser = "Chrome";
      else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
      else if (/firefox|fxios/i.test(ua)) browser = "Firefox";

      let geo = { ip: "156.197.x.x", country: "مصر", countryCode: "EG", city: "القاهرة", region: "محافظة القاهرة", flag: "🇪🇬" };
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("https://ipwho.is/", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success !== false) {
            geo = {
              ip: data.ip || "غير معروف",
              country: data.country || "مصر",
              countryCode: data.country_code || "EG",
              city: data.city || "القاهرة",
              region: data.region || "محافظة القاهرة",
              flag: data.flag ? data.flag.emoji : "🇪🇬"
            };
          }
        }
      } catch (e) {}

      const prodName = this.currentProduct ? this.currentProduct.name : "صفحة المنتج";
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
          deviceType: deviceType,
          os: os,
          browser: browser,
          screen: `${window.screen.width}x${window.screen.height}`,
          visitsCount: visitCount,
          lastPage: `منتج: ${prodName}`,
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
            deviceType: deviceType,
            os: os,
            browser: browser,
            screen: `${window.screen.width}x${window.screen.height}`,
            visitsCount: visitCount,
            page: `منتج: ${prodName}`,
            timestamp: now
          });
        }
      }
    } catch (e) {
      console.warn("ProductPage visitor tracker error:", e);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  ProductPage.init();
});
