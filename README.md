# Food Analyzer

A single-page web app for logging what you ate and seeing calories, macros, and other nutrition facts — **fully free, no API key, no account, no signup.**

Plain HTML / CSS / vanilla JS — no framework, no build step. Deploys as-is to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any static host.

## Why there's no AI photo recognition

There is no free, accurate image-recognition model — especially for Indian and other home-cooked dishes — that can run without a paid API. Rather than bolt on an inaccurate "AI guess," this app uses a **search-and-confirm** flow instead: you snap a photo (optional, just for your own reference) and then tell the app what it is by searching a bundled nutrition list. This is actually more accurate than a photo classifier would be, since there's no guessing involved.

## File structure

```
index.html      Markup / screens
style.css        Claude-inspired dark/light theme, layout, components
app.js            All app logic: camera, search, USDA lookup, manual entry, rendering
foods.json        Bundled nutrition database — 207 dishes across Indian, American, Chinese, Japanese, Korean, Thai, Vietnamese, Mexican, Italian, Mediterranean, Seafood, and general foods
.gitignore
README.md
```

## How it works

1. **Capture (optional)** — tap the camera button for a live photo (falls back to your device's native photo picker if the browser doesn't support live camera access), or tap "Skip photo" to go straight to search. The photo is just for your own reference — the app never analyzes the image itself.
2. **Search & confirm** — after the photo, type what you ate (e.g. "dosa", "biryani", "paneer tikka", "pizza") into the search box that appears. Matches from the bundled `foods.json` list appear instantly as you type — no network call, works offline.
3. **Search online (optional)** — if it's not in the bundled list, tap "Search online" to query **USDA FoodData Central**, a free public US government nutrition database, live over the network. No signup is required to try it (it uses the public `DEMO_KEY`, which is rate-limited — see below to get your own free key with higher limits).
4. **Enter manually (fallback)** — if nothing matches, type in the nutrition facts yourself.
5. **Results** — shows the food name, portion, a servings stepper (½ increments) that scales every number live, calories, macro bars (protein/carbs/fat), and fiber/sugar/sodium.
6. **Scan Another** resets back to the capture screen.

## Run locally

Camera access (`getUserMedia`) and the `fetch("foods.json")` call both require `https://` or `http://localhost` — opening `index.html` directly via `file://` will block both in most browsers (the device photo-picker fallback still works, and the app tells you if the local food list failed to load). Serve it locally instead:

```bash
# any static server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed `localhost` URL on your phone or desktop browser.

## Deploying

Push the folder to a static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.) — there's nothing to build, and nothing to keep secret. No environment variables or config files needed.

## Getting your own free USDA key (optional, recommended)

The app ships using USDA's public `DEMO_KEY`, which works immediately with no signup but is capped at 30 requests/hour and 50/day per IP — fine for trying it out, but you'll hit the limit with regular use.

To remove that limit:
1. Go to https://fdc.nal.usda.gov/api-key-signup.html
2. Enter your email — no billing, no credit card, it's genuinely free forever.
3. You'll get a key by email instantly. Open `app.js` and change:
   ```js
   const USDA_API_KEY = "DEMO_KEY";
   ```
   to
   ```js
   const USDA_API_KEY = "your-real-key-here";
   ```

## What's in the bundled list

207 dishes across cuisines, so the instant offline search works well beyond just Indian food:

| Cuisine | Items |
|---|---|
| Indian (breads, rice, curries, South Indian, snacks, tandoor, desserts, drinks) | 70 |
| American | 46 |
| Mediterranean (Greek, Levantine, Spanish) | 15 |
| Seafood | 14 |
| Chinese | 17 |
| Japanese | 12 |
| Korean | 6 |
| Thai | 5 |
| Mexican | 5 |
| Italian | 4 |
| Vietnamese | 3 |
| General (fruit, eggs, plain rice, grilled proteins, etc.) | 10 |

If a dish isn't in the list, "Search online" queries USDA FoodData Central live, or you can enter it manually.

## Adding more foods

Everything in the always-available, offline search comes from `foods.json` — a plain JSON array. To add a dish, add an object in the same shape:

```json
{
  "name": "Your Dish Name",
  "aliases": ["alternate spelling", "regional name"],
  "category": "Indian – Curry",
  "portion": "1 cup (~240g)",
  "calories": 300,
  "protein_g": 12,
  "carbs_g": 30,
  "fat_g": 15,
  "fiber_g": 5,
  "sugar_g": 4,
  "sodium_mg": 500
}
```

`aliases` is optional — it helps the search match different names for the same dish (e.g. "chole" as an alias for "Chana Masala", "idly" for "Idli"). All the nutrition numbers are per the stated `portion`, and get multiplied by the servings stepper on the results screen.

## A note on accuracy

- **Bundled list (`foods.json`)** — reference estimates for a *typical* standard serving of each dish, not measured from your specific meal. Use the servings stepper to adjust for a bigger or smaller portion than the default.
- **USDA lookup** — USDA FoodData Central is strongest for US-market ingredients and branded/packaged products; whole regional dishes (especially Indian ones) are far better covered by the bundled list.
- **Manual entry** — as accurate as the numbers you type in, e.g. from a package label.

## Customizing

- **Theme colors**: edit the CSS variables at the top of `style.css` (`:root` for dark, `body.light` for light).
- **Default USDA search scope**: `app.js` restricts USDA results to `Foundation`, `SR Legacy`, and `Branded` data types for relevance — adjust the `dataType` query param in `searchOnline()` if you want broader/narrower results.
