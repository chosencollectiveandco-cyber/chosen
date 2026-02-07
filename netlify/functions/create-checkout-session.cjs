const Stripe = require("stripe");

const SIZES = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);

function env(name) {
  return String(process.env[name] || "").trim();
}

// Product catalog (prices in cents)
const CATALOG = {
  "MERCH-01": {
    name: "CHSN-T1",
    unitAmount: 4000,
    imagePaths: ["assets/chsn-t1.jpg", "assets/chsn-t1-2.png"],
    priceId: env("STRIPE_PRICE_MERCH_01"),
  },
  "MERCH-02": {
    name: "CHSN-H1",
    unitAmount: 8500,
    imagePaths: ["assets/chsn-h1.jpg", "assets/chsn-h1-2.png"],
    priceId: env("STRIPE_PRICE_MERCH_02"),
  },
  "MERCH-03": {
    name: "CHSN-T2",
    unitAmount: 4500,
    imagePath: "assets/chsn-t2.png",
    priceId: env("STRIPE_PRICE_MERCH_03"),
  },
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

    const checkoutEnabled =
      String(process.env.CHECKOUT_ENABLED ?? "true")
        .trim()
        .toLowerCase() !== "false";
    if (!checkoutEnabled) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Checkout is temporarily disabled." }),
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
    if (!DOMAIN || !DOMAIN.startsWith("http")) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Missing DOMAIN. Add DOMAIN (ex: https://yourdomain.com) to Netlify environment variables so Stripe can redirect to success/cancel pages.",
        }),
      };
    }

    const lineItems = items.map((item) => {
      const product = CATALOG[item.sku];

      if (product.priceId) {
        return {
          price: product.priceId,
          quantity: item.quantity,
        };
      }

      const imagePaths = Array.isArray(product.imagePaths)
        ? product.imagePaths
        : product.imagePath
          ? [product.imagePath]
          : [];
      const images = DOMAIN ? imagePaths.map((p) => absoluteAssetUrl(DOMAIN, p)).filter(Boolean) : [];
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
      metadata: { items: JSON.stringify(items) },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("create-checkout-session error:", err);
    const message =
      err && typeof err.message === "string" && err.message.trim()
        ? err.message.trim()
        : "Failed to create Checkout Session.";
    const type = err && typeof err.type === "string" ? err.type : undefined;
    const code = err && typeof err.code === "string" ? err.code : undefined;
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: message,
        ...(type ? { type } : {}),
        ...(code ? { code } : {}),
      }),
    };
  }
};
