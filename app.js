/* Food Analyzer — vanilla JS, single file.
 * 100% free, no API key required.
 *
 * How it identifies food: there is no free, accurate AI image classifier for
 * home-cooked / Indian food, so instead of guessing from the photo, you search
 * and confirm what you ate from a bundled nutrition list (foods.json, heavy on
 * Indian dishes) with a live online fallback (USDA FoodData Central — free,
 * no signup needed via the public DEMO_KEY) and a manual-entry option.
 * See README.md for details and how to add more foods.
 */

const USDA_API_KEY = "DEMO_KEY"; // free, no signup; rate-limited. Swap in your own free key from
// https://fdc.nal.usda.gov/api-key-signup.html for higher limits — see README.md.
const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const SERVINGS_MIN = 0.5;
const SERVINGS_STEP = 0.5;

// Rough daily-value references used only to size the macro bars proportionally.
const DAILY_VALUES = { protein_g: 50, carbs_g: 300, fat_g: 78 };

// ---------- State ----------
const state = {
  theme: "dark", // in-memory only, per spec — no persistence
  stream: null,
  capturedImage: null, // data URL, or null if the user skipped the photo
  foodDb: [],
  dbLoadFailed: false,
  selectedFood: null, // normalized food object, see normalizeFood()
  servings: 1,
};

// ---------- DOM ----------
const el = {
  themeToggle: document.getElementById("theme-toggle"),
  captureBtn: document.getElementById("capture-btn"),
  skipPhotoBtn: document.getElementById("skip-photo-btn"),
  fileInput: document.getElementById("file-input"),
  cancelCameraBtn: document.getElementById("cancel-camera-btn"),
  shutterBtn: document.getElementById("shutter-btn"),
  video: document.getElementById("camera-video"),
  canvas: document.getElementById("capture-canvas"),

  searchThumb: document.getElementById("search-thumb"),
  searchInput: document.getElementById("search-input"),
  searchResults: document.getElementById("search-results"),
  searchOnlineBtn: document.getElementById("search-online-btn"),
  manualEntryBtn: document.getElementById("manual-entry-btn"),
  backToCaptureBtn: document.getElementById("back-to-capture-btn"),

  manualForm: document.getElementById("manual-form"),
  manualCancelBtn: document.getElementById("manual-cancel-btn"),

  resultImage: document.getElementById("result-image"),
  resultsContent: document.getElementById("results-content"),
  scanAgainBtn: document.getElementById("scan-again-btn"),

  errorMessage: document.getElementById("error-message"),
  retryBtn: document.getElementById("retry-btn"),

  screens: {
    capture: document.getElementById("screen-capture"),
    camera: document.getElementById("screen-camera"),
    search: document.getElementById("screen-search"),
    manual: document.getElementById("screen-manual"),
    results: document.getElementById("screen-results"),
    error: document.getElementById("screen-error"),
  },
};

function showScreen(name) {
  Object.values(el.screens).forEach((s) => s.classList.remove("active"));
  el.screens[name].classList.add("active");
}

// ---------- Theme ----------
el.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.body.classList.toggle("light", state.theme === "light");
});

// ---------- Food database ----------
async function loadFoodDb() {
  try {
    const res = await fetch("foods.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.foodDb = await res.json();
  } catch (err) {
    console.error("Couldn't load foods.json:", err);
    state.dbLoadFailed = true;
  }
}
loadFoodDb();

// ---------- Entry points ----------
el.captureBtn.addEventListener("click", startCamera);
el.skipPhotoBtn.addEventListener("click", () => {
  state.capturedImage = null;
  enterSearchScreen();
});
el.cancelCameraBtn.addEventListener("click", stopCameraAndReset);
el.shutterBtn.addEventListener("click", captureFrame);
el.fileInput.addEventListener("change", (e) => handleFileSelected(e.target.files[0]));
el.scanAgainBtn.addEventListener("click", resetToCapture);
el.retryBtn.addEventListener("click", resetToCapture);

el.backToCaptureBtn.addEventListener("click", resetToCapture);
el.manualEntryBtn.addEventListener("click", () => showScreen("manual"));
el.manualCancelBtn.addEventListener("click", () => showScreen("search"));
el.manualForm.addEventListener("submit", handleManualSubmit);

let searchDebounceTimer = null;
el.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderLocalResults, 120);
});
el.searchOnlineBtn.addEventListener("click", searchOnline);

// ---------- Camera ----------
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    el.fileInput.click();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    state.stream = stream;
    el.video.srcObject = stream;
    showScreen("camera");
  } catch (err) {
    showError(cameraErrorMessage(err));
  }
}

function cameraErrorMessage(err) {
  if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
    return "Camera access was denied. Allow camera permission in your browser settings, or choose a photo instead.";
  }
  if (err && err.name === "NotFoundError") {
    return "No camera was found on this device. Try choosing a photo instead.";
  }
  return "Couldn't access the camera. You can choose a photo instead.";
}

function stopCameraAndReset() {
  stopCamera();
  showScreen("capture");
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  el.video.srcObject = null;
}

function captureFrame() {
  const video = el.video;
  const canvas = el.canvas;
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 960;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  state.capturedImage = canvas.toDataURL("image/jpeg", 0.85);
  stopCamera();
  enterSearchScreen();
}

function handleFileSelected(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.capturedImage = reader.result;
    enterSearchScreen();
  };
  reader.onerror = () => showError("Couldn't read that photo. Please try again.");
  reader.readAsDataURL(file);
  el.fileInput.value = "";
}

// ---------- Search / identify screen ----------
function enterSearchScreen() {
  if (state.capturedImage) {
    el.searchThumb.src = state.capturedImage;
    el.searchThumb.hidden = false;
  } else {
    el.searchThumb.hidden = true;
  }
  el.searchInput.value = "";
  el.searchResults.innerHTML = "";
  el.searchOnlineBtn.disabled = false;
  el.searchOnlineBtn.textContent = "Search online (USDA database)";
  showScreen("search");
  el.searchInput.focus();

  if (state.dbLoadFailed) {
    el.searchResults.innerHTML =
      '<p class="search-empty">The local food list couldn\'t be loaded (if you opened this file directly, run it from a local server instead — see README.md). You can still search online or enter nutrition manually.</p>';
  }
}

function renderLocalResults() {
  if (state.dbLoadFailed) return;
  const query = el.searchInput.value.trim().toLowerCase();
  el.searchResults.innerHTML = "";
  if (!query) return;

  const matches = state.foodDb
    .map((food) => ({ food, score: matchScore(food, query) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map((m) => m.food);

  if (matches.length === 0) {
    el.searchResults.innerHTML =
      '<p class="search-empty">No matches in the bundled list. Try "Search online", or enter it manually.</p>';
    return;
  }

  matches.forEach((food) => {
    el.searchResults.appendChild(buildResultRow(food, "local"));
  });
}

function matchScore(food, query) {
  const name = food.name.toLowerCase();
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.includes(query)) return 60;
  const aliases = food.aliases || [];
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    if (a === query) return 90;
    if (a.startsWith(query)) return 70;
    if (a.includes(query)) return 50;
  }
  return 0;
}

function buildResultRow(food, source) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "search-result-row";
  row.innerHTML = `
    <div class="result-row-main">
      <span class="result-row-name">${escapeHtml(food.name)}</span>
      <span class="result-row-meta">${escapeHtml(food.portion || "")}${food.category ? " · " + escapeHtml(food.category) : ""}</span>
    </div>
    <span class="result-row-cal">${Math.round(food.calories)} kcal</span>
  `;
  row.addEventListener("click", () => chooseFood(food, source));
  return row;
}

async function searchOnline() {
  const query = el.searchInput.value.trim();
  if (!query) {
    el.searchInput.focus();
    return;
  }

  el.searchOnlineBtn.disabled = true;
  el.searchOnlineBtn.textContent = "Searching…";
  const statusEl = document.createElement("p");
  statusEl.className = "search-status";
  statusEl.textContent = "Searching USDA FoodData Central…";
  el.searchResults.appendChild(statusEl);

  try {
    const url = `${USDA_SEARCH_URL}?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(
      query
    )}&pageSize=8&dataType=Foundation,SR%20Legacy,Branded`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    statusEl.remove();

    const foods = (data.foods || []).map(usdaFoodToLocalShape).filter(Boolean);
    if (foods.length === 0) {
      el.searchResults.insertAdjacentHTML(
        "beforeend",
        '<p class="search-empty">No online results found. Try a different search term, or enter it manually.</p>'
      );
      return;
    }
    foods.forEach((food) => el.searchResults.appendChild(buildResultRow(food, "usda")));
  } catch (err) {
    console.error(err);
    statusEl.remove();
    el.searchResults.insertAdjacentHTML(
      "beforeend",
      '<p class="search-empty">Couldn\'t reach USDA FoodData Central (check your connection). You can enter nutrition manually instead.</p>'
    );
  } finally {
    el.searchOnlineBtn.disabled = false;
    el.searchOnlineBtn.textContent = "Search online (USDA database)";
  }
}

function usdaFoodToLocalShape(item) {
  const nutrient = (namePart) => {
    const n = (item.foodNutrients || []).find((fn) =>
      (fn.nutrientName || "").toLowerCase().includes(namePart)
    );
    return n ? Number(n.value) || 0 : 0;
  };

  const calories = nutrient("energy");
  if (!calories) return null; // skip entries with no usable energy value

  let portion = "100g (USDA estimate)";
  if (item.servingSize && item.servingSizeUnit) {
    portion = `1 serving (${item.servingSize}${item.servingSizeUnit})`;
  }

  return {
    name: item.description || "Unknown food",
    portion,
    category: item.brandOwner || item.dataType || "USDA",
    calories,
    protein_g: nutrient("protein"),
    carbs_g: nutrient("carbohydrate"),
    fat_g: nutrient("total lipid"),
    fiber_g: nutrient("fiber"),
    sugar_g: nutrient("sugars"),
    sodium_mg: nutrient("sodium"),
  };
}

// ---------- Manual entry ----------
function handleManualSubmit(e) {
  e.preventDefault();
  const num = (id) => Number(document.getElementById(id).value) || 0;
  const food = {
    name: document.getElementById("manual-name").value.trim() || "Custom food",
    portion: document.getElementById("manual-portion").value.trim() || "1 serving",
    calories: num("manual-calories"),
    protein_g: num("manual-protein"),
    carbs_g: num("manual-carbs"),
    fat_g: num("manual-fat"),
    fiber_g: num("manual-fiber"),
    sugar_g: num("manual-sugar"),
    sodium_mg: num("manual-sodium"),
  };
  el.manualForm.reset();
  chooseFood(food, "manual");
}

// ---------- Choosing a food / results ----------
const SOURCE_LABELS = {
  local: "Indian & general food reference (bundled)",
  usda: "Source: USDA FoodData Central",
  manual: "Manually entered",
};

function chooseFood(food, source) {
  state.selectedFood = { ...food, source };
  state.servings = 1;
  renderResults();
  showScreen("results");
}

function resetToCapture() {
  state.capturedImage = null;
  state.selectedFood = null;
  state.servings = 1;
  showScreen("capture");
}

function showError(message) {
  el.errorMessage.textContent = message;
  showScreen("error");
}

function renderResults() {
  const food = state.selectedFood;
  if (!food) return;

  if (state.capturedImage) {
    el.resultImage.src = state.capturedImage;
    el.resultImage.hidden = false;
  } else {
    el.resultImage.hidden = true;
  }

  el.resultsContent.innerHTML = `
    <div class="food-items">
      <div class="food-item-row">
        <span class="food-item-name">${escapeHtml(food.name)}</span>
        <span class="food-item-portion">${escapeHtml(food.portion || "")}</span>
      </div>
    </div>

    <div class="servings-row">
      <span class="servings-label">Servings</span>
      <div class="servings-stepper">
        <button type="button" id="servings-minus" class="servings-btn" aria-label="Decrease servings">&minus;</button>
        <span id="servings-value" class="servings-value"></span>
        <button type="button" id="servings-plus" class="servings-btn" aria-label="Increase servings">+</button>
      </div>
    </div>

    <div class="calories-block">
      <span id="calories-value" class="calories-value"></span>
      <span class="calories-label">calories (estimated)</span>
    </div>

    <div class="macros" id="macros-block"></div>

    <div class="extra-facts" id="extra-facts-block"></div>

    <p class="results-note">${escapeHtml(SOURCE_LABELS[food.source] || "")}</p>
  `;

  document.getElementById("servings-minus").addEventListener("click", () => adjustServings(-SERVINGS_STEP));
  document.getElementById("servings-plus").addEventListener("click", () => adjustServings(SERVINGS_STEP));

  renderNutritionValues();
}

function adjustServings(delta) {
  const next = Math.round((state.servings + delta) * 100) / 100;
  state.servings = Math.max(SERVINGS_MIN, next);
  renderNutritionValues();
}

function renderNutritionValues() {
  const food = state.selectedFood;
  if (!food) return;
  const s = state.servings;

  document.getElementById("servings-value").textContent = s.toString();
  document.getElementById("calories-value").textContent = Math.round((food.calories || 0) * s);

  const macros = [
    { key: "protein_g", label: "Protein" },
    { key: "carbs_g", label: "Carbs" },
    { key: "fat_g", label: "Fat" },
  ];
  document.getElementById("macros-block").innerHTML = macros
    .map((m) => {
      const value = Math.round((Number(food[m.key]) || 0) * s * 10) / 10;
      const dv = DAILY_VALUES[m.key] || 1;
      const pct = Math.max(4, Math.min(100, Math.round((value / dv) * 100)));
      return `
      <div class="macro-row">
        <div class="macro-row-top">
          <span class="macro-name">${m.label}</span>
          <span class="macro-value">${value}g</span>
        </div>
        <div class="macro-bar-track">
          <div class="macro-bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>`;
    })
    .join("");

  const extraFacts = [
    { label: "Fiber", key: "fiber_g", unit: "g" },
    { label: "Sugar", key: "sugar_g", unit: "g" },
    { label: "Sodium", key: "sodium_mg", unit: "mg" },
  ];
  document.getElementById("extra-facts-block").innerHTML = extraFacts
    .map((f) => {
      const raw = food[f.key];
      const value = raw != null ? Math.round(Number(raw) * s * 10) / 10 : null;
      return `
      <div class="extra-fact">
        <div class="extra-fact-value">${value != null ? value : "–"}${value != null ? f.unit : ""}</div>
        <div class="extra-fact-label">${f.label}</div>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
