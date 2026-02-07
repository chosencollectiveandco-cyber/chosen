import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import express from "express";
import Stripe from "stripe";

const PORT = Number(process.env.PORT) || 4242;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY. Add it to your environment variables.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const SIZES = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);

const AUTO_FREE_PROMO_CODE =
  (process.env.AUTO_FREE_PROMO_CODE || (STRIPE_SECRET_KEY.startsWith("sk_test_") ? "FREE100" : "")).trim() ||
  "";

const CATALOG = {
  "MERCH-01": { name: "CHSN-T1", unitAmount: 4000, imagePaths: ["assets/chsn-t1.jpg", "assets/chsn-t1-2.png"] },
  "MERCH-02": { name: "CHSN-H1", unitAmount: 8500, imagePaths: ["assets/chsn-h1.jpg", "assets/chsn-h1-2.png"] },
  "MERCH-03": { name: "CHSN-T2", unitAmount: 4500, imagePath: "assets/chsn-t2.png" },
};

function absoluteAssetUrl(assetPath) {
  const cleaned = String(assetPath || "").replace(/^\/+/, "");
  if (!cleaned) return "";
  const base = DOMAIN.endsWith("/") ? DOMAIN : `${DOMAIN}/`;
  try {
    return new URL(cleaned, base).toString();
  } catch {
    return "";
  }
}

function clampInt(value, { min, max }) {
  const int = Math.floor(Number(value));
  if (!Number.isFinite(int)) return min;
  return Math.min(max, Math.max(min, int));
}

function normalizeCartItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  const normalized = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;

    const sku = String(item.sku || "").trim();
    const size = String(item.size || "").trim().toUpperCase();
    const quantity = clampInt(item.quantity, { min: 1, max: 99 });

    if (!CATALOG[sku]) continue;
    if (!SIZES.has(size)) continue;

    normalized.push({ sku, size, quantity });
  }

  return normalized;
}

async function ensureFreePromotionCode(code) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return null;

  const target = normalizedCode.toUpperCase();

  const existing = await stripe.promotionCodes.list({ active: true, limit: 100 });
  const match = existing.data.find((p) => String(p.code || "").toUpperCase() === target);
  if (match) return match;

  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: "once",
    name: `${normalizedCode} (100% off)`,
  });

  return stripe.promotionCodes.create({
    coupon: coupon.id,
    code: normalizedCode,
    active: true,
  });
}

let freePromoPromise = null;
function ensureFreePromoOnce() {
  if (!AUTO_FREE_PROMO_CODE) return null;
  if (!freePromoPromise) {
    freePromoPromise = ensureFreePromotionCode(AUTO_FREE_PROMO_CODE).catch((error) => {
      console.error("Failed to ensure free promo code:", error);
      return null;
    });
  }
  return freePromoPromise;
}

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname, { index: false }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const checkoutEnabled =
      String(process.env.CHECKOUT_ENABLED ?? "true")
        .trim()
        .toLowerCase() !== "false";
    if (!checkoutEnabled) {
      return res.status(503).json({ error: "Checkout is temporarily disabled." });
    }

    const items = normalizeCartItems(req.body?.items);
    if (items.length === 0) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    await ensureFreePromoOnce();

    const lineItems = items.map((item) => {
      const product = CATALOG[item.sku];
      const imagePaths = Array.isArray(product.imagePaths)
        ? product.imagePaths
        : product.imagePath
          ? [product.imagePath]
          : [];
      const images = imagePaths.map(absoluteAssetUrl).filter(Boolean);

      return {
        price_data: {
          currency: "usd",
          unit_amount: product.unitAmount,
          product_data: {
            name: product.name,
            description: `Size: ${item.size}`,
            ...(images.length ? { images } : {}),
          },
        },
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      allow_promotion_codes: true,
      success_url: `${DOMAIN}/success.html`,
      cancel_url: `${DOMAIN}/cancel.html`,
      metadata: {
        items: JSON.stringify(items),
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create Checkout Session." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at ${DOMAIN}`);
});
