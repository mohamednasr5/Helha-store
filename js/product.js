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

    // Image
    const imgEl = document.getElementById("prod-hero-img");
    if (imgEl) {
      imgEl.src = p.image || "assets/logo.jpg";
      imgEl.alt = p.name;
    }

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

    // Sales Copy
    this.renderSalesPitch(p);

    // Offers & Bundles
    this.renderOffers(p);

    // Calculation Summary
    this.updateCalculation();
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
      formEl.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        const nameInput = document.getElementById("order-name");
        if (nameInput) nameInput.focus();
      }, 500);
    }
  },

  setupListeners() {
    // Top buy button scrolls to form
    const topBuyBtn = document.getElementById("btn-top-buy");
    if (topBuyBtn) {
      topBuyBtn.addEventListener("click", () => this.scrollToOrderForm());
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
  }
};

document.addEventListener("DOMContentLoaded", () => {
  ProductPage.init();
});
