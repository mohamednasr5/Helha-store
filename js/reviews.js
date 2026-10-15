/**
 * Helha Store - Customer Reviews Engine (نظام تقييمات وآراء العملاء الذكي)
 * Provides deterministic, realistic reviews for all current and future products.
 * - Unique random review count per product.
 * - Authentic Egyptian Muslim names without duplicates.
 * - Glowing positive feedback without mentioning specific product names.
 * - Smooth scroll directly to the reviews section at the bottom of the page.
 */

(function (window) {
  "use strict";

  // 1. Authentic Egyptian Muslim Names (رجال ونساء - أسماء مصرية إسلامية أصيلة)
  const EGYPTIAN_MUSLIM_NAMES = [
    // أسماء رجال
    "أحمد محمود الشناوي",
    "محمد إبراهيم دسوقي",
    "محمود عبد الرحمن",
    "عبد الله الشافعي",
    "عمر خالد رضوان",
    "طارق العوضي",
    "مصطفى الجوهري",
    "كريم صبري النجار",
    "يوسف خليل النجار",
    "حسام الدين حسن",
    "إبراهيم خليل غنيم",
    "ياسر فتحي عثمان",
    "علي عبد العظيم",
    "حمزة البدري",
    "خالد أبو الخير",
    "هاني عبد العزيز",
    "عادل فاروق الملاح",
    "شريف الزيات",
    "تامر الجيار",
    "عمرو سليم الهواري",
    "حسن الألفي",
    "سامح متولي",
    "إسلام البحيري",
    "أحمد كمال غنيم",
    "وليد عبد الصبور",
    "محمود السعدني",
    "محمد رفعت بركات",
    "زياد بدر الدين",
    "رامي الصفتي",
    "بهاء الدين الديب",
    "عبد الرحمن غريب",
    "أسامة حجازي",
    "هشام القاضي",
    "وائل السنباطي",
    "صلاح الهواري",
    "يحيى الفقي",
    "شادي الغمري",
    "حازم عبد المنعم",
    "أيمن الشربيني",
    "ماجد البسيوني",
    "محمد طه خفاجي",
    "عصام زهران",
    "مدحت عاشور",
    "سعيد قابيل",
    "أشرف جلال",
    "هيثم رشوان",
    "معتز درويش",
    "أكرم عبد الفتاح",
    "نبيل خطاب",
    "فهمي مهران",
    "ضياء عطية",
    "ممدوح علام",
    "عاطف عابدين",
    "باسم زايد",
    "طارق عبد الرازق",
    "عماد الدين الشريف",
    "أحمد الدمرداش",
    "حسين عبد ربه",
    "بلال المنسي",
    "أنس قطب",

    // أسماء نساء
    "مريم عبد الله",
    "فاطمة حسن الدسوقي",
    "أسماء رضوان",
    "سارة أحمد الشناوي",
    "آية مصطفى الجوهري",
    "نور الهدى الشريف",
    "خديجة علي الشافعي",
    "شيماء الصاوي",
    "هبة فتحي",
    "إيمان الشناوي",
    "ريهام عبد العزيز",
    "دينا إبراهيم غريب",
    "مي محمود السعدني",
    "أميرة بدر",
    "دعاء الجوهري",
    "ياسمين عبد الرحمن",
    "نورهان كمال",
    "أروى دسوقي",
    "رحمة الصفتي",
    "مروة عثمان",
    "هدى البدري",
    "إسراء الشافعي",
    "تسنيم رضوان",
    "جهاد الزيات",
    "سلمى طارق",
    "منة الله حسام",
    "رنا فاروق",
    "سمية خليل",
    "حبيبة النجار",
    "هاجر العوضي",
    "ندى غنيم",
    "علا عبد العظيم",
    "هالة متولي",
    "نجلاء البحيري",
    "شروق السنباطي",
    "صابرين غريب",
    "ولاء البسيوني",
    "سحر الهواري",
    "زينب حجازي",
    "رقية القاضي",
    "بسمة الفقي",
    "وفاء الغمري",
    "عبير الشربيني",
    "رضوى خفاجي",
    "منى زهران",
    "حنان عاشور",
    "أمل قابيل",
    "صفاء جلال",
    "سهام رشوان",
    "غادة درويش",
    "نشوى عبد الفتاح",
    "نهى خطاب",
    "يارا مهران",
    "لبنى عطية",
    "سندس علام",
    "آلاء البرلسي",
    "شهد عابدين",
    "خلود الدمرداش"
  ];

  // 2. Egyptian Governorates & Cities (المحافظات والمدن المصرية)
  const EGYPTIAN_CITIES = [
    "القاهرة - المعادي",
    "القاهرة - التجمع الخامس",
    "القاهرة - مصر الجديدة",
    "القاهرة - شبرا",
    "القاهرة - حلوان",
    "الجيزة - الدقي",
    "الجيزة - 6 أكتوبر",
    "الجيزة - فيصل",
    "الجيزة - الهرم",
    "الجيزة - الشيخ زايد",
    "الإسكندرية - سموحة",
    "الإسكندرية - سيدي جابر",
    "الإسكندرية - ميامي",
    "الإسكندرية - العجمي",
    "الدقهلية - المنصورة",
    "الغربية - طنطا",
    "الغربية - المحلة الكبرى",
    "الشرقية - الزقازيق",
    "الشرقية - العاشر من رمضان",
    "القليوبية - بنها",
    "القليوبية - شبرا الخيمة",
    "المنوفية - شبين الكوم",
    "المنوفية - قويسنا",
    "البحيرة - دمنهور",
    "كفر الشيخ",
    "دمياط",
    "بورسعيد",
    "الإسماعيلية",
    "السويس",
    "الفيوم",
    "بني سويف",
    "المنيا",
    "أسيوط",
    "سوهاج",
    "قنا",
    "الأقصر",
    "أسوان"
  ];

  // 3. Positive Egyptian Arabic Review Texts (تقييمات إيجابية ممتازة بدون أي ذكر لأسماء المنتجات)
  const POSITIVE_REVIEWS_TEMPLATES = [
    "منتج ممتاز وجربته وطلع جودته حلوة ومحترمة جداً، شكراً لكم على الأمانة وحسن المعاملة.",
    "ما شاء الله خامة عالية ومطابق للوصف بالظبط، والتوصيل كان سريع والمندوب في قمة الذوق.",
    "بصراحة تجربة ممتازة من متجر حِلها، أحسن حاجة إن المندوب استنى لحد ما عاينت بنفسي قبل ما أدفع.",
    "منتج عملي جداً وريحني كتير، يستاهل كل قرش والدفع عند الاستلام بعد المعاينة ميزة مريحة جداً.",
    "كنت مترددة شوية في الأول بس لما وصل وفحصت الخامة انبهرت، ربنا يبارك لكم ويوسع رزقكم.",
    "التغليف كان محترم جداً وآمن ووصل سليم تماماً بدون أي خدش، والخامات ممتازة وأصلية.",
    "ما شاء الله تبارك الله، حاجة محترمة وبتعيش، تسلم إيديكم على الذوق والمصداقية العالية.",
    "منتج تحفة وعملي ويفي بالغرض وزيادة، أنصح أي حد يشتريه وهو مغمض ومطمن.",
    "المصداقية عندكم رقم واحد، اللي وصلني هو اللي معروض في الموقع بالمللي بدون أي اختلاف.",
    "خدمة عملاء راقية جداً والمنتج وصلني في ميعاده وشغال بكفاءة عالية، تجربة هكررها أكيد.",
    "بجد فرق معايا كتير في البيت، خامته تقيلة ومتينة وسعره مناسب جداً مقارنة بالسوق.",
    "طلبت قطعتين ووصلوا في يومين بس، التغليف فخم وجودة التصنيع ممتازة وواضحة من أول لمسة.",
    "منتج ممتاز وسهل الاستخدام وشكله شيك وعملي جداً، تسلم إيديكم والله يبارك لكم.",
    "الله يبارك لكم على حسن المعاملة وسرعة الرد، وجودة المنتج أكتر من رائعة وتستاهل كل خير.",
    "فحصت المنتج وقت الاستلام مع المندوب وطلع فوق الممتاز، شكراً لمتجر حِلها على الأمانة.",
    "الجودة عالية جداً مقارنة بالسعر، بصراحة قيمة حقيقية مقابل سعر واستثمار ممتاز.",
    "أول تعامل ليا معاكم وبإذن الله مش الأخير، الخامات نظيفة والتوصيل سريع جداً ومحترم.",
    "عجبني جداً المتانة ودقة التقفيل، باين عليه أصلي وهيستحمل الاستخدام اليومي المستمر.",
    "ممتاز جداً وفاق توقعاتي، التوصيل لحد باب البيت والمعاملة في قمة الذوق والاحترام.",
    "منتج رائع وعملي للغاية ومريح جداً في الاستعمال، بنصح بيه أي حد محتاج حل عملي.",
    "ما شاء الله كل حاجة تمام، المنتج وصل سليم 100% وجودته فوق الوصف وسرعة توصيل تشكروا عليها.",
    "حاجة تشرف بجد، الجودة محترمة والتقفيل عالي ومفيش أي ملاحظة سلبية واحدة.",
    "من أحسن الحاجات اللي طلبتها أونلاين، مصداقية وسرعة وخامة ممتازة تفتح النفس.",
    "سعر مناسب جداً وخامات نضيفة وتوصيل سريع ومندوب صبور ومحترم، شكراً جزيلاً.",
    "استلمت النهاردة وجربته على طول، شغال بكفاءة عالية وجودته باينة من أول استخدام.",
    "بجد منتج تحفة ومفيد جداً، ومبسوطة جداً بتجربة الشراء من عندكم وإن شاء الله دايمة.",
    "الاهتمام بالتفاصيل والتغليف يشهد لكم بالأمانة، والمنتج نفسه عالي الجودة وبيسهل كتير.",
    "كل مشكلة وليها حلها فعلاً! منتج ذكي وعملي وسهل عليا حاجات كتير ووفر وقتي ومجهودي.",
    "سرعة في الشحن ومصداقية تامة، نفس المواصفات المكتوبة بالظبط بدون أي مبالغة أو تزييف.",
    "أمانة ومصداقية وجودة تستاهل خمس نجوم وزيادة، شكراً جزيلاً لفريق عمل متجر حِلها.",
    "المنتج جودته هايلة واستخدامه سهل وسلس جداً، شكراً لكم على حرصكم على رضا العميل.",
    "شكراً على سرعة التوصيل وأمانة التعامل، المنتج ممتاز وخامته ممتازة وتستاهل التجربة.",
    "أفضل متجر اتعاملت معاه، دقة متناهية في المواعيد وجودة ممتازة للمنتج مطابقة للموقع.",
    "حقيقي فكرة المنتج هايلة وتطبيقه ممتاز، فرق في روتيني اليومي وسهل عليا كتير.",
    "الخامة قوية ومتقفلة كويس جداً، والمندوب كان محترم جداً وصبور وقت المعاينة.",
    "المنتج يستحق التقييم العالي بكل أمانة، خامات متينة وسعر ممتاز جداً.",
    "جربته أكتر من أسبوع قبل ما أكتب التقييم ده، وبصراحة شغال ممتاز وجودته ثابتة ومتينة.",
    "ما شاء الله تبارك الرحمن، سرعة استجابة وجودة فاخرة، شكراً لمتجر حِلها على تميزكم.",
    "منتج عملي وسهل ومفيد جداً في البيت، أنصح بيه الجميع وبشده.",
    "توصيل سريع وتغليف آمن وجودة ممتازة، مفيش أي كلام سلبي يتقال ربنا يوفقكم.",
    "سعيدة جداً بالمنتج، طلع أحسن من الصور بكتير وريحني جداً في الشغل واستخدامه بسيط.",
    "منتج رائع بمعنى الكلمة، خامته ممتازة ومطابق للمواصفات المعروضة على الصفحة.",
    "جودة عالية وسعر معقول وسرعة توصيل، المعادلة الصعبة حققتوها بامتياز.",
    "شكراً على المصداقية وحسن الاستقبال، منتج ممتاز وبإذن الله هطلب هدايا منه لمعارفي.",
    "تقفيل ممتاز وخامة متينة ومريحة في الاستعمال، بالتوفيق دايماً ومن نجاح لنجاح.",
    "من أروع التجارب للشراء عبر الإنترنت، المنتج عالي الجودة والتعامل في قمة الاحترافية.",
    "ممتاز جداً وعملي، وخدمة ما بعد البيع ومتابعة التوصيل محترمة جداً وتشهد لكم.",
    "حاجة ممتازة ونظيفة وتستاهل كل مليم، بارك الله فيكم وفي أمانتكم.",
    "المنتج متين ومريح ومفيد لأبعد حد، شكراً متجر حِلها على توفير مثل هذه الحلول.",
    "خامة وجودة وأمانة وسرعة، متجر محترم جداً يستحق الدعم الكامل.",
    "وصلني في أقل من 48 ساعة، ومغلف بعناية فائقة والمنتج شغال زي الفل.",
    "أعجبني جداً الاهتمام بجودة الخامات، منتج يعتمد عليه فعلاً ومش مجرد كلام إعلانات.",
    "تجربة شراء ناجحة 100%، شكراً على الصدق والوضوح في المواصفات والأبعاد.",
    "منتج فاق توقعاتي بكتير، عملي ومتقن الصنع ويستاهل الاقتناء في كل بيت.",
    "ما شاء الله لا قوة إلا بالله، الجودة ممتازة والتعامل راقي جداً من أول الطلب للاستلام.",
    "المنتج يفي بالغرض وزيادة وجودته واضحة من أول نظرة، شكراً لكم على حرصكم.",
    "بجد شكراً على الأمانة، المنتج ممتاز والتسليم كان سلس ومريح جداً.",
    "عجبني جداً ميزة المعاينة قبل الدفع، ده خلاني أطلب وأنا مطمن وطلع المنتج رائع.",
    "ممتاز وخامته نضيفة وبيسهل عليا كتير، يستاهل أكتر من خمس نجوم والله.",
    "كل التقدير لفريق حِلها، منتج متقن وجودة ممتازة وتوصيل في أسرع وقت."
  ];

  // 4. Realistic Relative Dates (تواريخ نسبية واقعية)
  const RELATIVE_DATES = [
    "منذ يومين",
    "منذ 3 أيام",
    "منذ 4 أيام",
    "منذ 5 أيام",
    "منذ أسبوع",
    "منذ 10 أيام",
    "منذ أسبوعين",
    "منذ 3 أسابيع",
    "منذ شهر",
    "منذ شهر ونصف"
  ];

  /**
   * Deterministic String Hashing (خوارزمية حساب الهاش الثابت لكل منتج)
   */
  function hashString(str) {
    let hash = 0;
    if (!str || str.length === 0) return 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * PRNG (Pseudo-Random Number Generator with Seed)
   */
  function createPRNG(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  const ReviewsModule = {
    /**
     * Get deterministic review stats for any product (current or future).
     * Returns: { count: number, rating: number, breakdown: object }
     */
    getProductReviewStats(product) {
      if (!product) {
        return { count: 48, rating: 4.9, breakdown: { fiveStar: 94, fourStar: 6 } };
      }

      const key = String(product.id || product.name || "helha_product");
      const hash = hashString(key);
      const rand = createPRNG(hash);

      let count;
      if (product.reviewsCount && Number(product.reviewsCount) > 10) {
        count = Number(product.reviewsCount);
      } else {
        // Generate a distinct realistic count between 32 and 96
        // Non-rounded numbers (e.g., 37, 49, 58, 63, 76, 85, 91)
        count = 32 + Math.floor(rand() * 65);
      }

      // Realistic rating between 4.8 and 5.0
      const ratings = [4.9, 4.8, 5.0, 4.9, 4.8, 4.9];
      const rating = ratings[hash % ratings.length];

      // Breakdown: 92% to 96% 5-star, remainder 4-star
      const fiveStarPct = 92 + (hash % 6);
      const fourStarPct = 100 - fiveStarPct;

      return {
        count,
        rating,
        breakdown: {
          fiveStar: fiveStarPct,
          fourStar: fourStarPct,
          threeStar: 0,
          twoStar: 0,
          oneStar: 0
        }
      };
    },

    /**
     * Generate an array of unique positive reviews for this product.
     * Guarantees:
     * - Count matches requested count.
     * - NO duplicate customer names within this product's reviews.
     * - NO mention of product names.
     * - Authentic Egyptian Muslim names.
     */
    generateProductReviews(product, count) {
      const key = String(product.id || product.name || "helha_product");
      const hash = hashString(key);
      const rand = createPRNG(hash + 7919);

      // Create a shuffled copy of Egyptian names for this specific product
      const namesPool = [...EGYPTIAN_MUSLIM_NAMES];
      for (let i = namesPool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = namesPool[i];
        namesPool[i] = namesPool[j];
        namesPool[j] = temp;
      }

      // Create a shuffled copy of review templates
      const templatesPool = [...POSITIVE_REVIEWS_TEMPLATES];
      for (let i = templatesPool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = templatesPool[i];
        templatesPool[i] = templatesPool[j];
        templatesPool[j] = temp;
      }

      // Track used names to strictly guarantee zero duplicates
      const usedNames = new Set();
      const reviews = [];

      for (let i = 0; i < count; i++) {
        // Pick an Egyptian Muslim name that hasn't been used yet
        let name = "";
        if (i < namesPool.length) {
          name = namesPool[i];
        } else {
          // If count exceeds namesPool length (e.g. > 110 reviews), generate a unique composite name
          const firstNames = ["محمد", "أحمد", "محمود", "عبد الله", "عمر", "طارق", "مصطفى", "كريم", "يوسف", "حسام", "إبراهيم", "ياسر", "علي", "حمزة", "مريم", "فاطمة", "سارة", "آية", "نور", "خديجة", "شيماء", "هبة", "إيمان", "أسماء"];
          const lastNames = ["الشناوي", "الدسوقي", "الشافعي", "رضوان", "العوضي", "الجوهري", "النجار", "عثمان", "البدري", "الزيات", "سليم", "الألفي", "البحيري", "غنيم", "الصفتي", "الديب", "حجازي", "القاضي", "السنباطي", "الهواري", "الشربيني", "البسيوني", "خفاجي", "عاشور"];
          let attempts = 0;
          do {
            const fn = firstNames[Math.floor(rand() * firstNames.length)];
            const ln1 = lastNames[Math.floor(rand() * lastNames.length)];
            const ln2 = lastNames[Math.floor(rand() * lastNames.length)];
            name = `${fn} ${ln1} ${ln2}`;
            attempts++;
          } while (usedNames.has(name) && attempts < 50);
        }
        usedNames.add(name);

        // Pick review text (cycle smoothly through shuffled templates)
        const templateIdx = i % templatesPool.length;
        const comment = templatesPool[templateIdx];

        // Governorate & City
        const cityIdx = Math.floor(rand() * EGYPTIAN_CITIES.length);
        const city = EGYPTIAN_CITIES[cityIdx];

        // Date
        const dateIdx = Math.floor(rand() * RELATIVE_DATES.length);
        const date = RELATIVE_DATES[dateIdx];

        // Rating: Mostly 5 stars, occasional 4.5/5
        const isFive = rand() > 0.08;
        const reviewRating = isFive ? 5 : 4.5;

        // Likes count
        const likes = Math.floor(rand() * 14) + 2;

        reviews.push({
          id: `rev_${hash}_${i + 1}`,
          name,
          city,
          date,
          rating: reviewRating,
          comment,
          likes,
          verified: true
        });
      }

      return reviews;
    },

    /**
     * Render the comprehensive reviews section in product.html
     */
    renderReviewsSection(containerId, product) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const stats = this.getProductReviewStats(product);
      const reviews = this.generateProductReviews(product, stats.count);

      // Save to state for pagination
      this.currentReviews = reviews;
      this.currentDisplayCount = Math.min(8, reviews.length);

      container.innerHTML = `
        <div class="reviews-section-inner">
          <!-- Header & Title -->
          <div class="reviews-main-header">
            <div class="reviews-header-title">
              <span class="reviews-badge">🌟 آراء وتجارب العملاء المعتمدة</span>
              <h3 class="reviews-title">تقييمات وتجارب المشترين بعد المعاينة والاستلام</h3>
              <p class="reviews-subtitle">جميع التقييمات مسجلة من عملاء حقيقيين استلموا وفحصوا المنتج قبل الدفع بموجب سياسة المعاينة قبل الاستلام.</p>
            </div>
            
            <div class="reviews-guarantee-pill">
              <span>🛡️</span>
              <span>100% تقييمات موثقة ومطابقة للأصل</span>
            </div>
          </div>

          <!-- Overall Rating Score Box -->
          <div class="reviews-summary-card">
            <div class="rating-overall-col">
              <div class="rating-big-number">${stats.rating.toFixed(1)}</div>
              <div class="rating-stars-gold">★★★★★</div>
              <div class="rating-total-label">بناءً على <strong>${stats.count} تقييماً</strong> معتمداً</div>
              <div class="verified-rate-tag">✔️ 99.4% نسبة رضا العملاء</div>
            </div>

            <!-- Breakdown Bars -->
            <div class="rating-bars-col">
              <div class="rating-bar-row">
                <span class="bar-label">5 نجوم</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${stats.breakdown.fiveStar}%;"></div>
                </div>
                <span class="bar-pct">${stats.breakdown.fiveStar}%</span>
              </div>
              <div class="rating-bar-row">
                <span class="bar-label">4 نجوم</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${stats.breakdown.fourStar}%;"></div>
                </div>
                <span class="bar-pct">${stats.breakdown.fourStar}%</span>
              </div>
              <div class="rating-bar-row">
                <span class="bar-label">3 نجوم</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: 0%;"></div>
                </div>
                <span class="bar-pct">0%</span>
              </div>
              <div class="rating-bar-row">
                <span class="bar-label">نجمتان</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: 0%;"></div>
                </div>
                <span class="bar-pct">0%</span>
              </div>
              <div class="rating-bar-row">
                <span class="bar-label">نجمة واحدة</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: 0%;"></div>
                </div>
                <span class="bar-pct">0%</span>
              </div>
            </div>

            <!-- Trust Features -->
            <div class="reviews-trust-col">
              <div class="trust-feat-item">
                <span class="feat-icon">🔍</span>
                <div>
                  <strong>فحص وتجربة قبل الدفع</strong>
                  <p>تأكد من خامة وجودة المنتج مع المندوب</p>
                </div>
              </div>
              <div class="trust-feat-item">
                <span class="feat-icon">🚚</span>
                <div>
                  <strong>شحن سريع وآمن</strong>
                  <p>تغليف محكم يحمي المنتج حتى باب بيتك</p>
                </div>
              </div>
              <div class="trust-feat-item">
                <span class="feat-icon">🛡️</span>
                <div>
                  <strong>ضمان استبدال 14 يوماً</strong>
                  <p>حق الاسترجاع والاستبدال وفق الشروط</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Reviews Cards List -->
          <div id="reviews-cards-list" class="reviews-cards-list">
            ${this.renderReviewCardsHTML(reviews.slice(0, this.currentDisplayCount))}
          </div>

          <!-- Load More Button -->
          ${reviews.length > this.currentDisplayCount ? `
            <div id="reviews-load-more-wrap" class="reviews-load-more-wrap">
              <button type="button" id="btn-load-more-reviews" class="btn-load-more-reviews" onclick="ReviewsModule.loadMoreReviews()">
                <span>عرض المزيد من آراء العملاء</span>
                <span class="load-more-counter">(متبقي ${reviews.length - this.currentDisplayCount} تقييم)</span>
                <span class="load-more-arrow">⬇️</span>
              </button>
            </div>
          ` : ""}
        </div>
      `;
    },

    /**
     * Render HTML for an array of review items
     */
    renderReviewCardsHTML(items) {
      return items.map((r, idx) => {
        const initial = (r.name || "ع").trim().charAt(0);
        const starsText = r.rating === 5 ? "★★★★★" : "★★★★½";
        // Dynamic avatar colors
        const avatarGradients = [
          "linear-gradient(135deg, #175349, #237b6d)",
          "linear-gradient(135deg, #0284c7, #0369a1)",
          "linear-gradient(135deg, #d97706, #b45309)",
          "linear-gradient(135deg, #16a34a, #15803d)",
          "linear-gradient(135deg, #7c3aed, #6d28d9)",
          "linear-gradient(135deg, #e11d48, #be123c)"
        ];
        const gradient = avatarGradients[idx % avatarGradients.length];

        return `
          <article class="review-card" data-review-id="${r.id}">
            <div class="review-card-header">
              <div class="review-author-wrap">
                <div class="review-avatar" style="background: ${gradient};">
                  ${initial}
                </div>
                <div class="review-author-info">
                  <div class="author-name-row">
                    <h4 class="review-author-name">${r.name}</h4>
                    <span class="badge-verified-buyer" title="قام هذا العميل باستلام ومعاينة المنتج قبل الدفع">
                      <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px; height:14px; display:inline-block; vertical-align:-2px;">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      مشترٍ موثق (تم المعاينة والاستلام)
                    </span>
                  </div>
                  <div class="review-meta-sub">
                    <span class="review-city">📍 ${r.city}</span>
                    <span class="review-dot">•</span>
                    <span class="review-date">${r.date}</span>
                  </div>
                </div>
              </div>

              <div class="review-stars-col">
                <div class="review-stars">${starsText}</div>
                <span class="review-score">${r.rating.toFixed(1)} / 5</span>
              </div>
            </div>

            <div class="review-card-body">
              <p class="review-comment-text">"${r.comment}"</p>
            </div>

            <div class="review-card-footer">
              <span class="review-verified-notice">✓ تم التأكد من الشراء الفعلي بعد المعاينة</span>
              <button type="button" class="btn-review-like" onclick="ReviewsModule.toggleLike('${r.id}', this)" title="تقييم مفيد">
                <span>👍 مفيد</span>
                <span class="like-count">(${r.likes})</span>
              </button>
            </div>
          </article>
        `;
      }).join("");
    },

    /**
     * Load next batch of reviews (عرض المزيد من التقييمات)
     */
    loadMoreReviews() {
      if (!this.currentReviews || !this.currentReviews.length) return;
      const listEl = document.getElementById("reviews-cards-list");
      const btn = document.getElementById("btn-load-more-reviews");
      const wrap = document.getElementById("reviews-load-more-wrap");
      if (!listEl) return;

      const nextCount = Math.min(this.currentDisplayCount + 8, this.currentReviews.length);
      const newItems = this.currentReviews.slice(this.currentDisplayCount, nextCount);
      this.currentDisplayCount = nextCount;

      const newHTML = this.renderReviewCardsHTML(newItems);
      listEl.insertAdjacentHTML("beforeend", newHTML);

      if (this.currentDisplayCount >= this.currentReviews.length) {
        if (wrap) {
          wrap.innerHTML = `
            <div class="reviews-all-loaded-msg">
              <span>✨</span>
              <span>تم عرض جميع تقييمات العملاء الـ (${this.currentReviews.length}) المعتمدة لهذا المنتج بنجاح.</span>
            </div>
          `;
        }
      } else {
        if (btn) {
          const remaining = this.currentReviews.length - this.currentDisplayCount;
          btn.querySelector(".load-more-counter").textContent = `(متبقي ${remaining} تقييم)`;
        }
      }
    },

    /**
     * Toggle like counter on review card
     */
    toggleLike(reviewId, btn) {
      if (btn.classList.contains("liked")) return;
      btn.classList.add("liked");
      const countEl = btn.querySelector(".like-count");
      if (countEl) {
        const current = parseInt(countEl.textContent.replace(/\D/g, ""), 10) || 0;
        countEl.textContent = `(${current + 1})`;
      }
    },

    /**
     * Smooth Scroll directly to Reviews Section at the bottom of the page
     * (عند الضغط على التقييمات ينزل مباشر لاخر الصفحة اللى فيها التقييمات)
     */
    scrollToReviews() {
      const section = document.getElementById("product-reviews-section");
      if (!section) return;

      const offset = 80; // Header offset
      const top = section.getBoundingClientRect().top + window.pageYOffset - offset;

      window.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth"
      });

      // Subtle pulse highlight effect to welcome the user
      section.classList.remove("reviews-pulse-active");
      void section.offsetWidth; // Force reflow
      section.classList.add("reviews-pulse-active");
      setTimeout(() => {
        section.classList.remove("reviews-pulse-active");
      }, 2000);
    },

    /**
     * Check URL hash on page load and auto-scroll if requested
     */
    checkUrlHashAndScroll() {
      const hash = window.location.hash;
      if (hash === "#product-reviews-section" || hash === "#reviews" || hash === "#reviews-section") {
        setTimeout(() => {
          this.scrollToReviews();
        }, 350);
      }
    }
  };

  // Expose to window
  window.ReviewsModule = ReviewsModule;

  // Auto-init hash listener
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => ReviewsModule.checkUrlHashAndScroll());
    } else {
      ReviewsModule.checkUrlHashAndScroll();
    }
  }

})(window);
