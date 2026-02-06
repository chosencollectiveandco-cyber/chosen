const STORAGE_KEY = "bw_cart_v1";
const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const CART_KEY_SEPARATOR = "::";

const PRODUCT_CATALOG = {
  "MERCH-01": {
    sku: "MERCH-01",
    name: "CHSN-T1",
    price: 45,
    imageSrc: "assets/chsn-t1.jpg",
    imageSrcs: ["assets/chsn-t1.jpg", "assets/chsn-t1-2.png"],
  },
  "MERCH-02": { sku: "MERCH-02", name: "CHSN-H1", price: 85, imageSrc: "assets/chsn-h1.jpg" },
  "MERCH-03": { sku: "MERCH-03", name: "CHSN-T2", price: 45, imageSrc: "assets/chsn-t2.png" },
};

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function clampInt(value, { min, max }) {
  const int = Math.floor(Number(value));
  if (!Number.isFinite(int)) return min;
  return Math.min(max, Math.max(min, int));
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveCart(cart) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function makeCartKey(sku, size) {
  return `${sku}${CART_KEY_SEPARATOR}${size}`;
}

function parseCartKey(key) {
  const raw = String(key || "");
  const parts = raw.split(CART_KEY_SEPARATOR);
  if (parts.length !== 2) return null;

  const sku = parts[0].trim();
  const size = parts[1].trim().toUpperCase();

  if (!sku || !SIZES.includes(size)) return null;
  return { sku, size };
}

function parsePrice(text) {
  const cleaned = String(text || "").replace(/[^0-9.]/g, "");
  const price = Number.parseFloat(cleaned);
  return Number.isFinite(price) ? price : Number.NaN;
}

function getProductsFromDom() {
  const cards = Array.from(document.querySelectorAll(".product-card"));
  const products = new Map(Object.values(PRODUCT_CATALOG).map((product) => [product.sku, product]));

  for (const card of cards) {
    const sku = (card.dataset.sku || "").trim();
    const name = (card.dataset.name || card.querySelector(".product-name")?.textContent || "").trim();
    const rawImages = (card.dataset.images || "").trim();
    const imageSrcs = rawImages
      ? rawImages
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    const imageSrc = (
      imageSrcs[0] ||
      card.dataset.image ||
      card.querySelector(".product-image")?.getAttribute("src") ||
      ""
    ).trim();

    let price = Number(card.dataset.price);
    if (!Number.isFinite(price)) {
      price = parsePrice(card.querySelector(".product-price")?.textContent);
    }

    if (!sku || !name || !Number.isFinite(price)) continue;
    products.set(sku, { sku, name, price, imageSrc, imageSrcs: imageSrcs.length ? imageSrcs : [imageSrc] });
  }

  return products;
}

function getCartCount(cart) {
  return Object.values(cart).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

function sanitizeCart(cart, products) {
  const next = {};

  for (const [rawKey, qtyRaw] of Object.entries(cart)) {
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 1) continue;

    const parsed = parseCartKey(rawKey);
    if (parsed) {
      if (!products.has(parsed.sku)) continue;
      next[makeCartKey(parsed.sku, parsed.size)] = Math.floor(qty);
      continue;
    }

    const legacySku = String(rawKey).trim();
    if (!legacySku || !products.has(legacySku)) continue;

    const key = makeCartKey(legacySku, "M");
    next[key] = (Number(next[key]) || 0) + Math.floor(qty);
  }

  return next;
}

function setCountBubble(cartCountEl, count) {
  if (count <= 0) {
    cartCountEl.hidden = true;
    cartCountEl.textContent = "0";
    return;
  }

  cartCountEl.hidden = false;
  cartCountEl.textContent = String(count);
}

function renderCart({ cartItemsEl, cartTotalEl, cart }, products) {
  cartItemsEl.replaceChildren();

  const entries = Object.entries(cart);
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cart-empty";
    empty.textContent = "Your cart is empty.";
    cartItemsEl.appendChild(empty);
    cartTotalEl.textContent = money.format(0);
    return;
  }

  let total = 0;

  for (const [key, qty] of entries) {
    const parsed = parseCartKey(key);
    if (!parsed) continue;

    const product = products.get(parsed.sku);
    if (!product) continue;

    total += product.price * qty;

    const item = document.createElement("div");
    item.className = "cart-item";
    item.setAttribute("role", "listitem");
    item.dataset.key = key;

    const top = document.createElement("div");
    top.className = "cart-item-top";

    const left = document.createElement("div");
    left.className = "cart-item-left";

    if (product.imageSrc) {
      const img = document.createElement("img");
      img.className = "cart-item-image";
      img.src = product.imageSrc;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      left.appendChild(img);
    }

    const name = document.createElement("p");
    name.className = "cart-item-name";
    name.textContent = `${product.name} / ${parsed.size}`;
    left.appendChild(name);

    const price = document.createElement("p");
    price.className = "cart-item-price";
    price.textContent = money.format(product.price);

    top.append(left, price);

    const controls = document.createElement("div");
    controls.className = "qty-controls";

    const dec = document.createElement("button");
    dec.className = "qty-button";
    dec.type = "button";
    dec.dataset.action = "dec";
    dec.dataset.key = key;
    dec.setAttribute("aria-label", `Decrease ${product.name} size ${parsed.size}`);
    dec.textContent = "−";

    const qtyValue = document.createElement("span");
    qtyValue.className = "qty-value";
    qtyValue.textContent = String(qty);
    qtyValue.setAttribute("aria-label", `Quantity ${qty}`);

    const inc = document.createElement("button");
    inc.className = "qty-button";
    inc.type = "button";
    inc.dataset.action = "inc";
    inc.dataset.key = key;
    inc.setAttribute("aria-label", `Increase ${product.name} size ${parsed.size}`);
    inc.textContent = "+";

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.dataset.action = "remove";
    remove.dataset.key = key;
    remove.textContent = "Remove";

    controls.append(dec, qtyValue, inc, remove);

    item.append(top, controls);
    cartItemsEl.appendChild(item);
  }

  cartTotalEl.textContent = money.format(total);
}

function main() {
  initVerseReveal();

  const products = getProductsFromDom();

  const cartCountEl = document.querySelector(".cart-count");
  const cartDrawerEl = document.querySelector(".cart-drawer");
  const backdropEl = document.querySelector(".backdrop");
  const cartItemsEl = document.querySelector(".cart-items");
  const cartTotalEl = document.querySelector("[data-cart-total]");

  const productModalEl = document.querySelector(".product-modal");
  const productBackdropEl = document.querySelector(".modal-backdrop");
  const productTitleEl = document.querySelector("[data-product-title]");
  const productPriceEl = document.querySelector("[data-product-price]");
  const productImageEl = document.querySelector("[data-product-image]");
  const productImageHintEl = document.querySelector("[data-product-image-hint]");
  const sizeGridEl = document.querySelector("[data-size-grid]");
  const qtyInputEl = document.querySelector("[data-qty-input]");

  const hasCartUi = Boolean(cartCountEl && cartDrawerEl && backdropEl && cartItemsEl && cartTotalEl);
  const hasProductModalUi = Boolean(
    productModalEl &&
      productBackdropEl &&
      productTitleEl &&
      productPriceEl &&
      productImageEl &&
      productImageHintEl &&
      sizeGridEl &&
      qtyInputEl,
  );

  let cart = hasCartUi ? sanitizeCart(loadCart(), products) : loadCart();
  if (hasCartUi) saveCart(cart);

  let lastCartFocus = null;
  let lastProductFocus = null;

  function openCart() {
    if (!hasCartUi) return;
    closeProductModal({ restoreFocus: false });
    lastCartFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("cart-open");
    backdropEl.hidden = false;
    cartDrawerEl.setAttribute("aria-hidden", "false");
    cartDrawerEl.querySelector('[data-action="close-cart"]')?.focus();
  }

  function closeCart({ restoreFocus = true } = {}) {
    if (!hasCartUi) return;
    document.body.classList.remove("cart-open");
    cartDrawerEl.setAttribute("aria-hidden", "true");
    backdropEl.hidden = true;
    if (restoreFocus) lastCartFocus?.focus();
  }

  function openProductModal(sku) {
    if (!hasProductModalUi) return;
    const product = products.get(sku);
    if (!product) return;

    closeCart({ restoreFocus: false });

    lastProductFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    productModalEl.dataset.sku = sku;
    productTitleEl.textContent = product.name;
    productPriceEl.textContent = "COMING SOON";

    const images = Array.isArray(product.imageSrcs) && product.imageSrcs.length ? product.imageSrcs : [product.imageSrc];
    productModalEl.dataset.images = images.join(",");
    productModalEl.dataset.imageIndex = "0";

    if (productImageEl instanceof HTMLImageElement) {
      if (images[0]) {
        productImageEl.hidden = false;
        productImageEl.src = images[0];
        productImageEl.alt = product.name;
      } else {
        productImageEl.hidden = true;
        productImageEl.removeAttribute("src");
        productImageEl.alt = "";
      }
    }

    if (productImageHintEl) {
      productImageHintEl.hidden = images.length <= 1;
      productImageHintEl.textContent = `Image 1 / ${images.length}`;
    }

    const defaultSize = "M";
    const defaultRadio = productModalEl.querySelector(
      `input[name="size"][value="${defaultSize}"]`,
    );
    if (defaultRadio instanceof HTMLInputElement) defaultRadio.checked = true;
    qtyInputEl.value = "1";

    document.body.classList.add("product-open");
    productBackdropEl.hidden = false;
    productModalEl.setAttribute("aria-hidden", "false");

    productModalEl.querySelector('input[name="size"]:checked')?.focus();
  }

  function closeProductModal({ restoreFocus = true } = {}) {
    if (!hasProductModalUi) return;
    if (!document.body.classList.contains("product-open")) return;

    document.body.classList.remove("product-open");
    productModalEl.setAttribute("aria-hidden", "true");
    productBackdropEl.hidden = true;
    delete productModalEl.dataset.sku;
    delete productModalEl.dataset.images;
    delete productModalEl.dataset.imageIndex;
    if (productImageEl instanceof HTMLImageElement) {
      productImageEl.hidden = true;
      productImageEl.removeAttribute("src");
      productImageEl.alt = "";
    }
    if (productImageHintEl) productImageHintEl.hidden = true;

    if (restoreFocus) lastProductFocus?.focus();
  }

  function setCart(next) {
    if (!hasCartUi) return;
    cart = sanitizeCart(next, products);
    saveCart(cart);

    setCountBubble(cartCountEl, getCartCount(cart));
    renderCart({ cartItemsEl, cartTotalEl, cart }, products);
  }

  if (hasCartUi) {
    setCart(cart);
  }

  async function startCheckout(checkoutButtonEl) {
    if (!hasCartUi) return;
    const items = Object.entries(cart)
      .map(([key, quantity]) => {
        const parsed = parseCartKey(key);
        if (!parsed) return null;
        return { sku: parsed.sku, size: parsed.size, quantity };
      })
      .filter(Boolean);

    if (items.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    if (checkoutButtonEl instanceof HTMLButtonElement) {
      checkoutButtonEl.disabled = true;
      checkoutButtonEl.dataset.originalText = checkoutButtonEl.textContent || "";
      checkoutButtonEl.textContent = "Loading…";
    }

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`);
      }

      if (!data?.url) {
        throw new Error("Missing Checkout URL.");
      }

      window.location.href = data.url;
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Checkout failed. If you’re on Netlify, make sure the Netlify Function is deployed and STRIPE_SECRET_KEY is set.";
      alert(message);
    } finally {
      if (checkoutButtonEl instanceof HTMLButtonElement) {
        checkoutButtonEl.disabled = false;
        checkoutButtonEl.textContent = checkoutButtonEl.dataset.originalText || "Checkout";
        delete checkoutButtonEl.dataset.originalText;
      }
    }
  }

  document.addEventListener("click", (event) => {
    const productCard = event.target instanceof Element ? event.target.closest(".product-card") : null;
    const actionEl = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!actionEl) {
      if (productCard && hasProductModalUi) {
        const sku = productCard.dataset.sku;
        if (sku) openProductModal(sku);
      }
      return;
    }

    const action = actionEl.dataset.action;
    if (!action) return;

    if (action === "open-cart") {
      openCart();
      return;
    }

    if (action === "close-cart") {
      closeCart();
      return;
    }

    if (action === "close-product") {
      closeProductModal();
      return;
    }

    if (action === "clear-cart") {
      setCart({});
      return;
    }

    if (action === "checkout") {
      startCheckout(actionEl);
      return;
    }

    if (action === "modal-inc" || action === "modal-dec") {
      if (!hasProductModalUi) return;
      const current = clampInt(qtyInputEl.value, { min: 1, max: 99 });
      const nextQty = clampInt(current + (action === "modal-inc" ? 1 : -1), { min: 1, max: 99 });
      qtyInputEl.value = String(nextQty);
      qtyInputEl.focus();
      return;
    }

    if (action === "modal-add") {
      if (!hasProductModalUi) return;
      const sku = productModalEl.dataset.sku;
      if (!sku || !products.has(sku)) return;

      if (actionEl instanceof HTMLButtonElement && actionEl.disabled) return;

      const selectedSize = productModalEl.querySelector('input[name="size"]:checked')?.value || "";
      if (!SIZES.includes(selectedSize)) return;

      const qty = clampInt(qtyInputEl.value, { min: 1, max: 99 });

      const key = makeCartKey(sku, selectedSize);
      const next = { ...cart };
      next[key] = (Number(next[key]) || 0) + qty;
      setCart(next);

      closeProductModal();
      openCart();
      return;
    }

    if (action === "modal-next-image") {
      if (!hasProductModalUi) return;
      if (!document.body.classList.contains("product-open")) return;

      const raw = (productModalEl.dataset.images || "").trim();
      const images = raw
        ? raw
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      if (images.length <= 1) return;

      const current = clampInt(productModalEl.dataset.imageIndex || "0", { min: 0, max: images.length - 1 });
      const nextIndex = (current + 1) % images.length;
      productModalEl.dataset.imageIndex = String(nextIndex);

      if (productImageEl instanceof HTMLImageElement) {
        productImageEl.hidden = false;
        productImageEl.src = images[nextIndex];
      }

      if (productImageHintEl) {
        productImageHintEl.hidden = false;
        productImageHintEl.textContent = `Image ${nextIndex + 1} / ${images.length}`;
      }
      return;
    }

    if (action === "inc" || action === "dec" || action === "remove") {
      const key = actionEl.dataset.key;
      const parsed = parseCartKey(key);
      if (!parsed || !products.has(parsed.sku)) return;

      const next = { ...cart };

      if (action === "remove") {
        delete next[key];
        setCart(next);
        return;
      }

      const delta = action === "inc" ? 1 : -1;
      const qty = (Number(next[key]) || 0) + delta;
      if (qty <= 0) delete next[key];
      else next[key] = qty;

      setCart(next);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!hasProductModalUi) return;
    if (event.key === "Enter" || event.key === " ") {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(".product-card");
      if (!card || target !== card) return;

      event.preventDefault();
      const sku = card.dataset.sku;
      if (sku) openProductModal(sku);
    }
  });

  if (hasProductModalUi) {
    qtyInputEl.addEventListener("change", () => {
      qtyInputEl.value = String(clampInt(qtyInputEl.value, { min: 1, max: 99 }));
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (hasProductModalUi && document.body.classList.contains("product-open")) {
      closeProductModal();
      return;
    }

    if (hasCartUi && document.body.classList.contains("cart-open")) {
      closeCart();
    }
  });
}

function initVerseReveal() {
  const mask = document.querySelector("[data-verse-mask]");
  const text = document.querySelector("[data-verse-text]");
  if (!mask || !text) return;

  let raf = 0;

  function apply() {
    const verseHeight = text.scrollHeight || 0;
    if (verseHeight <= 0) return;

    const scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const t = scrollMax === 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / scrollMax));

    const minReveal = Math.min(72, verseHeight);
    const reveal = Math.round(minReveal + (verseHeight - minReveal) * t);
    mask.style.maxHeight = `${reveal}px`;
  }

  function schedule() {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  apply();
}

main();
