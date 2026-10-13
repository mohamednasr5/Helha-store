/**
 * PWA Registration & Direct 1-Click Install Handler
 * Triggers native Android WebAPK / Standalone Application installation directly
 */

let deferredInstallPrompt = null;

// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log("✓ PWA Service Worker active with scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("Service Worker registration notice:", err);
      });
  });
}

// Check if app is already running in standalone mode or installed
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

// Comprehensive check: Has the user permanently installed the app?
function isAppInstalled() {
  if (localStorage.getItem("helha_pwa_installed") === "true") {
    return true;
  }
  if (isRunningStandalone()) {
    localStorage.setItem("helha_pwa_installed", "true");
    return true;
  }
  return false;
}

// Check on load to hide top nav install button if already installed
document.addEventListener("DOMContentLoaded", () => {
  if (isAppInstalled()) {
    const navBtn = document.getElementById("nav-pwa-btn");
    if (navBtn) navBtn.style.display = "none";
    const banner = document.getElementById("pwa-install-banner");
    if (banner) banner.remove();
  }
});

// Listen for the native beforeinstallprompt event
window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent default mini-infobar on mobile Chrome
  e.preventDefault();
  
  // Stash the event so it can be triggered directly on button click
  deferredInstallPrompt = e;
  
  // Show banner only if app is not installed and not dismissed in this visit
  if (!isAppInstalled()) {
    showPwaInstallBanner();
  }
});

// Create and show the direct 1-click install banner
function showPwaInstallBanner() {
  // 1. If installed, NEVER show again!
  if (isAppInstalled()) {
    const existing = document.getElementById("pwa-install-banner");
    if (existing) existing.remove();
    return;
  }

  // 2. If user dismissed it in this visit, do NOT show until the next visit!
  if (sessionStorage.getItem("helha_pwa_dismissed") === "true") {
    return;
  }

  // Check if banner already exists in DOM
  let banner = document.getElementById("pwa-install-banner");
  if (banner) {
    banner.style.display = "flex";
    return;
  }

  banner = document.createElement("div");
  banner.id = "pwa-install-banner";
  banner.className = "pwa-banner-card";
  banner.innerHTML = `
    <div class="pwa-banner-content">
      <img src="assets/icon-192.png" alt="شعار تطبيق حِلها" class="pwa-banner-icon" onerror="this.src='assets/logo.jpg'">
      <div class="pwa-banner-text">
        <div class="pwa-banner-title">تطبيق متجر حِلها 🛒💡</div>
        <div class="pwa-banner-sub">تطبيق خفيف وسريع يعمل بدون متصفح على هاتفك</div>
      </div>
    </div>
    <div class="pwa-banner-actions">
      <button id="pwa-btn-install" class="pwa-btn-install" onclick="triggerPwaInstall()">
        <span>تثبيت التطبيق الآن</span>
        <span>📲</span>
      </button>
      <button class="pwa-btn-close" onclick="dismissPwaBanner()" aria-label="إغلاق">✕</button>
    </div>
  `;

  document.body.appendChild(banner);
}

// Direct 1-Click Install Trigger
window.triggerPwaInstall = async function () {
  if (!deferredInstallPrompt) {
    alert("لتثبيت تطبيق متجر حِلها على هاتفك، اضغط على خيارات المتصفح (⋮) ثم اختر 'تثبيت التطبيق' أو 'إضافة إلى الشاشة الرئيسية'.");
    return;
  }

  // Show native install prompt
  deferredInstallPrompt.prompt();

  // Wait for user choice
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log(`PWA user response: ${outcome}`);

  if (outcome === "accepted") {
    // User agreed to install -> permanently hide forever
    localStorage.setItem("helha_pwa_installed", "true");
    const banner = document.getElementById("pwa-install-banner");
    if (banner) banner.remove();
    const navBtn = document.getElementById("nav-pwa-btn");
    if (navBtn) navBtn.style.display = "none";
  } else {
    // User dismissed native prompt -> dismiss banner for this visit
    dismissPwaBanner();
  }

  deferredInstallPrompt = null;
};

// Dismiss banner for current visit only (reappears next visit if not installed)
window.dismissPwaBanner = function () {
  const banner = document.getElementById("pwa-install-banner");
  if (banner) {
    banner.style.animation = "pwaSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
    setTimeout(() => {
      banner.remove();
    }, 280);
  }
  sessionStorage.setItem("helha_pwa_dismissed", "true");
};

// Listen for successful installation event
window.addEventListener("appinstalled", () => {
  console.log("🎉 Helha PWA standalone application installed successfully!");
  localStorage.setItem("helha_pwa_installed", "true");
  deferredInstallPrompt = null;
  const banner = document.getElementById("pwa-install-banner");
  if (banner) banner.remove();
  const navBtn = document.getElementById("nav-pwa-btn");
  if (navBtn) navBtn.style.display = "none";
});
