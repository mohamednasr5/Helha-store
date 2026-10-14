/**
 * Firebase Realtime Database Configuration for Helha (حِلها) Store
 */

const firebaseConfig = {
  apiKey: "AIzaSyCIXBok0UcPXB6KF8jdHAZroEcVr-8Ztjs",
  authDomain: "hani-b15d1.firebaseapp.com",
  databaseURL: "https://hani-b15d1-default-rtdb.firebaseio.com",
  projectId: "hani-b15d1",
  storageBucket: "hani-b15d1.firebasestorage.app",
  messagingSenderId: "442361130664",
  appId: "1:442361130664:web:1015043645205e6cf4dc9d",
  measurementId: "G-239EH33MVY"
};

// Initialize Firebase if loaded
let db = null;
let isFirebaseConnected = false;

try {
  if (typeof firebase !== "undefined") {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
    isFirebaseConnected = true;
    console.log("✅ Firebase Realtime Database connected successfully.");
  } else {
    console.warn("⚠️ Firebase SDK not loaded yet.");
  }
} catch (error) {
  console.error("❌ Firebase initialization error:", error);
}

// Initial demo products for Helha store
const DEMO_PRODUCTS = [
  {
    id: "demo_1",
    isDemo: true,
    name: "قطاعة الخضار والفواكه الذكية 14 في 1",
    subtitle: "حل سريع لتقطيع الخضروات والسلطة في ثوانٍ",
    category: "kitchen",
    categoryName: "حلول المطبخ",
    price: 349,
    originalPrice: 480,
    badge: "الأكثر مبيعاً",
    image: "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=600&auto=format&fit=crop&q=80",
    images: [
      "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1506368249639-73a05d6f6488?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&auto=format&fit=crop&q=80"
    ],
    description: "تخلص من عناء تقطيع الخضار والمجهود اليومي! قطاعة 14 في 1 بشفرات استانلس ستيل حادة ومقاومة للصدأ، تأتي مع وعاء مدمج ومصفاة وغطاء أمان لحماية اليدين.",
    features: [
      "14 ملحق وشفرة متعددة الاستخدامات",
      "شفرات استانلس ستيل غير قابلة للصدأ",
      "وعاء سفلي سعة 1.5 لتر مع مصفاة",
      "سهلة الفك والتنظيف وآمنة لغسالة الأطباق"
    ],
    inStock: true,
    stockCount: 45,
    rating: 4.9,
    reviewsCount: 128
  },
  {
    id: "demo_2",
    isDemo: true,
    name: "مكنسة ذكية لاسلكية محمولة بقوة شفط توربينية",
    subtitle: "حل مثالي لتنظيف السيارة وزوايا المنزل الضيقة",
    category: "cleaning",
    categoryName: "أدوات التنظيف",
    price: 499,
    originalPrice: 650,
    badge: "خصم 23%",
    image: "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&auto=format&fit=crop&q=80",
    images: [
      "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=600&auto=format&fit=crop&q=80"
    ],
    description: "تنظيف فوري أينما كنت! مكنسة خفيفة الوزن بقوة شفط هائلة 9000Pa وبطارية ليثيوم قابلة لإعادة الشحن عبر USB، ومزودة بفلتر HEPA قابل للغسيل ورؤوس متعددة للوصول لأضيق الأماكن.",
    features: [
      "قوة شفط عالية 9000Pa لاسلكية",
      "بطارية ليثيوم تدوم حتى 35 دقيقة عمل",
      "فلتر HEPA نانو قابل للغسيل",
      "رؤوس مخصصة للسيارة والمفروشات والكيبورد"
    ],
    inStock: true,
    stockCount: 30,
    rating: 4.8,
    reviewsCount: 94
  },
  {
    id: "demo_3",
    isDemo: true,
    name: "موزع الصابون السائل الأوتوماتيكي بحساس الأشعة تحت الحمراء",
    subtitle: "حل صحي بدون لمس لتوفير الصابون ومنع البكتيريا",
    category: "home",
    categoryName: "حلول منزلية",
    price: 289,
    originalPrice: 380,
    badge: "جديد",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
    images: [
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1608248597359-250818b2f9fa?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1584472282996-add59297f047?w=600&auto=format&fit=crop&q=80"
    ],
    description: "احمِ عائلتك من انتقال الجراثيم! موزع صابون ذكي يعمل بدون لمس عبر مستشعر دقيق، يضخ رغوة غنية خلال 0.25 ثانية بتوفير يصل إلى 50% من استهلاك الصابون العادي.",
    features: [
      "حساس استشعار فائق السرعة خلال 0.25 ثانية",
      "مقاوم لرذاذ الماء بمعيار IPX4",
      "توفير هائل في استهلاك الصابون بفضل تقنية الرغوة",
      "تصميم أنيق يناسب الحمام والمطبخ"
    ],
    inStock: true,
    stockCount: 55,
    rating: 4.7,
    reviewsCount: 62
  },
  {
    id: "demo_4",
    isDemo: true,
    name: "منظم التوابل والعلب الدوار 360 درجة المزدوج",
    subtitle: "حل فوضى دواليب المطبخ وسهولة الوصول لأي علبة",
    category: "kitchen",
    categoryName: "حلول المطبخ",
    price: 220,
    originalPrice: 310,
    badge: "الأكثر طلباً",
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80",
    images: [
      "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=600&auto=format&fit=crop&q=80"
    ],
    description: "ضاعف مساحة دولابك واستمتع بمطبخ منظم كالمحترفين! صينية دوارة بطبقتين مع دوران سلس 360 درجة، ومصنوعة من مواد قوية مانعة للانزلاق لتنظيم التوابل والزيوت والصلصات.",
    features: [
      "دوران سلس ومستقر 360 درجة",
      "طبقتان لاستيعاب أكثر من 20 برطمان",
      "قاعدة مانعة للانزلاق لحماية الأواني",
      "سهل التنظيف ومقاوم للرطوبة والدهون"
    ],
    inStock: true,
    stockCount: 40,
    rating: 4.9,
    reviewsCount: 88
  },
  {
    id: "demo_5",
    isDemo: true,
    name: "شريط النانو اللاصق السحري الشفاف القابل للغسل",
    subtitle: "حل التثبيت بدون مسامير أو تكسير بالجدران",
    category: "home",
    categoryName: "حلول منزلية",
    price: 135,
    originalPrice: 190,
    badge: "وفر 29%",
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80",
    images: [
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=600&auto=format&fit=crop&q=80"
    ],
    description: "ثبت أي شيء في مكانك بكل سهولة وأمان! شريط نانو فائق الالتصاق يحمل أوزاناً حتى 5 كجم، لا يترك أي أثر على الحائط ويمكن غسله بالماء وإعادة استخدامه عشرات المرات.",
    features: [
      "قوة لصق جبارة على السيراميك والخشب والزجاج",
      "قابل للغسيل وإعادة الاستخدام بعد الجفاف",
      "لا يترك أي أثر أو بقايا صمغ",
      "طول 5 أمتار وعرض 3 سم"
    ],
    inStock: true,
    stockCount: 80,
    rating: 4.6,
    reviewsCount: 154
  },
  {
    id: "demo_6",
    isDemo: true,
    name: "مضخة قوارير المياه الكهربائية الذكية القابلة للشحن",
    subtitle: "حل رفع قوارير المياه الثقيلة بلمسة زر واحدة",
    category: "home",
    categoryName: "حلول منزلية",
    price: 199,
    originalPrice: 280,
    badge: "مميز",
    image: "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80",
    description: "وداعاً لرفع قوارير المياه الثقيلة وعناء الصب اليدوي! مضخة كهربائية تركب مباشرة على أي قارورة مياه وتعمل بلمسة زر ببطارية تدوم لأكثر من 5 قوارير بالشحنة الواحدة عبر USB.",
    features: [
      "مخرج ستانلس ستيل صحي وخالي من BPA",
      "تعمل بلمسة زر واحدة مع ضخ سريع",
      "شحن USB سريع يكفي لـ 30-40 يوماً",
      "تناسب جميع مقاسات قوارير المياه القياسية"
    ],
    inStock: true,
    stockCount: 60,
    rating: 4.8,
    reviewsCount: 110
  }
];

// Helper to hash passwords using standard Web Crypto SHA-256
async function hashPassword(plainText) {
  const msgUint8 = new TextEncoder().encode(plainText.toString());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Default admin password SHA-256 hash
const DEFAULT_ADMIN_PASSWORD_HASH = "64533647a5d1df6de07cdc1a3a51f4c0fcbb35fffd51b5c38f32c949e24a210c";
