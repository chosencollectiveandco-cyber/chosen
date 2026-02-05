const Stripe = require("stripe");

const SIZES = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);

// Product catalog (prices in cents)
const CATALOG = {
  "MERCH-01": { name: "CHSN-T1", unitAmount: 4500, imagePath: "assets/chsn-t1.jpg" },
  "MERCH-02": { name: "CHSN-H1", unitAmount: 8500, imagePath: "assets/chsn-h1.jpg" },
};

function absoluteAssetUrl(domain, assetPath) {
  const cleaned = String(assetPath || "").replace(/^\/+/, "");
  if (!cleaned) return "";
  const base = domain.endsWith("/") ? domain : `${domain}/`;
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing STRIPE_SECRET_KEY in Netlify environment variables." }),
      };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const body = JSON.parse(event.body || "{}");
    const items = normalizeCartItems(body.items);

    if (items.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Cart is empty." }),
      };
    }

    const proto =
      (event.headers && (event.headers["x-forwarded-proto"] || event.headers["X-Forwarded-Proto"])) || "https";
    const host = (event.headers && (event.headers.host || event.headers.Host)) || "";
    const inferredDomain = host ? `${proto}://${host}` : "";

    // Optional: set DOMAIN in Netlify env vars to force a custom domain.
    const DOMAIN = process.env.DOMAIN || inferredDomain;

    const lineItems = items.map((item) => {
      const product = CATALOG[item.sku];
      const imageUrl = DOMAIN ? absoluteAssetUrl(DOMAIN, product.imagePath) : "";
      return {
        price_data: {
          currency: "usd",
          unit_amount: product.unitAmount,
          product_data: {
            name: product.name,
            description: `Size: ${item.size}`,
            ...(imageUrl ? { images: [imageUrl] } : {}),
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
      metadata: { items: JSON.stringify(items) },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to create Checkout Session." }),
    };
  }
};
