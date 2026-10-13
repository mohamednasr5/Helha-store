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

// Check if app is already running in standalone mode
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

// Listen for the native beforeinstallprompt event
window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent default mini-infobar on mobile Chrome
  e.preventDefault();
  
  // Stash the event so it can be triggered directly on button click
  deferredInstallPrompt = e;
  
  // If not already in standalone mode, display the direct install banner
  if (!isRunningStandalone()) {
    showPwaInstallBanner();
  }
});

// Create and show the direct 1-click install banner
function showPwaInstallBanner() {
  // Don't show if user dismissed it in this session
  if (sessionStorage.getItem("helha_pwa_dismissed") === "true") {
    return;
  }

  // Check if banner already exists
  if (document.getElementById("pwa-install-banner")) {
    document.getElementById("pwa-install-banner").style.display = "flex";
    return;
  }

  const banner = document.createElement("div");
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

// Direct 1-Click Install Trigger (No tutorials, native prompt directly)
window.triggerPwaInstall = async function () {
  if (!deferredInstallPrompt) {
    // If beforeinstallprompt hasn't fired yet or not supported
    alert("لتثبيت التطبيق على جهازك، اضغط على خيارات المتصفح (⋮) ثم اختر 'تثبيت التطبيق' أو 'Install App'.");
    return;
  }

  // Show the native Android install prompt
  deferredInstallPrompt.prompt();

  // Wait for the user to respond to the prompt
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log(`PWA user response: ${outcome}`);

  // Clear prompt
  deferredInstallPrompt = null;

  // Hide the banner
  const banner = document.getElementById("pwa-install-banner");
  if (banner) {
    banner.style.display = "none";
  }
};

// Dismiss banner
window.dismissPwaBanner = function () {
  const banner = document.getElementById("pwa-install-banner");
  if (banner) {
    banner.style.display = "none";
  }
  sessionStorage.setItem("helha_pwa_dismissed", "true");
};

// Listen for successful installation
window.addEventListener("appinstalled", () => {
  console.log("🎉 Helha PWA standalone application installed successfully!");
  deferredInstallPrompt = null;
  const banner = document.getElementById("pwa-install-banner");
  if (banner) {
    banner.style.display = "none";
  }
});
