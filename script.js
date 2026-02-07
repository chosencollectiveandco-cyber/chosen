const STORAGE_KEY = "bw_cart_v1";
const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const CART_KEY_SEPARATOR = "::";
const NEWSLETTER_RAIL_STORAGE_KEY = "ccco_newsletter_rail_hidden_v1";
const NAV_ACTIVE_STORAGE_KEY = "ccco_nav_active_v1";

const PRODUCT_CATALOG = {
  "MERCH-01": {
    sku: "MERCH-01",
    name: "CHSN-T1",
    price: 40,
    imageSrc: "assets/chsn-t1.jpg",
    imageSrcs: ["assets/chsn-t1.jpg", "assets/chsn-t1-2.png"],
  },
  "MERCH-02": {
    sku: "MERCH-02",
    name: "CHSN-H1",
    price: 85,
    imageSrc: "assets/chsn-h1.jpg",
    imageSrcs: ["assets/chsn-h1.jpg", "assets/chsn-h1-2.png"],
    comingSoon: true,
  },
  "MERCH-03": {
    sku: "MERCH-03",
    name: "CHSN-T2",
    price: 45,
    imageSrc: "assets/chsn-t2.png",
    comingSoon: true,
  },
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
    const existing = sku ? products.get(sku) : null;
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
    const comingSoon =
      String(card.dataset.comingSoon || "").trim().toLowerCase() === "true" || Boolean(existing?.comingSoon);

    products.set(sku, {
      sku,
      name,
      price,
      imageSrc,
      imageSrcs: imageSrcs.length ? imageSrcs : [imageSrc],
      comingSoon,
    });
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
      const product = products.get(parsed.sku);
      if (!product || product.comingSoon) continue;
      next[makeCartKey(parsed.sku, parsed.size)] = Math.floor(qty);
      continue;
    }

    const legacySku = String(rawKey).trim();
    const legacyProduct = legacySku ? products.get(legacySku) : null;
    if (!legacyProduct || legacyProduct.comingSoon) continue;

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
  initNavUnderline();

  const products = getProductsFromDom();

  initProductMagnifier();

  document.body.classList.toggle("has-verse", Boolean(document.querySelector(".verse-rail")));

  const cartCountEl = document.querySelector(".cart-count");
  const cartDrawerEl = document.querySelector(".cart-drawer");
  const backdropEl = document.querySelector(".backdrop");
  const cartItemsEl = document.querySelector(".cart-items");
  const cartTotalEl = document.querySelector("[data-cart-total]");

  const newsletterRailEl = document.querySelector(".newsletter-rail");
  const newsletterToggleEl = document.querySelector(".newsletter-toggle");
  const newsletterEmailEl = document.querySelector("#newsletter-email");

  const productModalEl = document.querySelector(".product-modal");
  const productBackdropEl = document.querySelector(".modal-backdrop");
  const productTitleEl = document.querySelector("[data-product-title]");
  const productPriceEl = document.querySelector("[data-product-price]");
  const productStatusEl = document.querySelector("[data-product-status]");
  const productImageEl = document.querySelector("[data-product-image]");
  const productImageHintEl = document.querySelector("[data-product-image-hint]");
  const sizeGridEl = document.querySelector("[data-size-grid]");
  const qtyInputEl = document.querySelector("[data-qty-input]");

  const hasCartUi = Boolean(cartCountEl && cartDrawerEl && backdropEl && cartItemsEl && cartTotalEl);
  const hasNewsletterRailUi = Boolean(newsletterRailEl && newsletterToggleEl && newsletterEmailEl);
  const hasProductModalUi = Boolean(
    productModalEl &&
      productBackdropEl &&
      productTitleEl &&
      productPriceEl &&
      productStatusEl &&
      productImageEl &&
      productImageHintEl &&
      sizeGridEl &&
      qtyInputEl,
  );

  const modalMagnifier = hasProductModalUi
    ? initModalMagnifier({
        productModalEl,
        tileEl: productModalEl.querySelector(".product-modal-tile"),
        imageEl: productImageEl,
      })
    : null;

  function hideNewsletterRail() {
    if (!hasNewsletterRailUi) return;
    document.body.classList.add("newsletter-hidden");
    localStorage.setItem(NEWSLETTER_RAIL_STORAGE_KEY, "1");
  }

  function showNewsletterRail() {
    if (!hasNewsletterRailUi) return;
    document.body.classList.remove("newsletter-hidden");
    localStorage.removeItem(NEWSLETTER_RAIL_STORAGE_KEY);
    newsletterEmailEl.focus();
  }

  if (hasNewsletterRailUi) {
    document.body.classList.add("has-newsletter");
    if (localStorage.getItem(NEWSLETTER_RAIL_STORAGE_KEY) === "1") {
      document.body.classList.add("newsletter-hidden");
    }
  }

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
    modalMagnifier?.disable();

    lastProductFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    productModalEl.dataset.sku = sku;
    productTitleEl.textContent = product.name;
    productModalEl.dataset.comingSoon = product.comingSoon ? "true" : "false";

    if (product.comingSoon) {
      productPriceEl.hidden = true;
      productPriceEl.textContent = "";
      productStatusEl.hidden = false;
      productStatusEl.textContent = "COMING SOON";
    } else {
      productPriceEl.hidden = false;
      productPriceEl.textContent = money.format(product.price);
      productStatusEl.hidden = true;
      productStatusEl.textContent = "";
    }

    const modalAddButtonEl = productModalEl.querySelector('[data-action="modal-add"]');
    if (modalAddButtonEl instanceof HTMLButtonElement) {
      if (product.comingSoon) {
        modalAddButtonEl.disabled = true;
        modalAddButtonEl.textContent = "Coming soon";
      } else {
        modalAddButtonEl.disabled = false;
        modalAddButtonEl.textContent = "Add to cart";
      }
    }

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
    modalMagnifier?.disable();
    productModalEl.setAttribute("aria-hidden", "true");
    productBackdropEl.hidden = true;
    delete productModalEl.dataset.sku;
    delete productModalEl.dataset.images;
    delete productModalEl.dataset.imageIndex;
    delete productModalEl.dataset.comingSoon;
    if (productImageEl instanceof HTMLImageElement) {
      productImageEl.hidden = true;
      productImageEl.removeAttribute("src");
      productImageEl.alt = "";
    }
    if (productImageHintEl) productImageHintEl.hidden = true;
    if (productStatusEl) productStatusEl.hidden = true;
    if (productPriceEl) productPriceEl.hidden = false;

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
        if (String(productCard.dataset.comingSoon || "").trim().toLowerCase() === "true") return;
        if (productCard.classList.contains("is-magnifying")) return;
        const sku = productCard.dataset.sku;
        if (sku) openProductModal(sku);
      }
      return;
    }

    const action = actionEl.dataset.action;
    if (!action) return;

    if (action === "magnify" || action === "modal-magnify") {
      return;
    }

    if (action === "hide-newsletter") {
      hideNewsletterRail();
      return;
    }

    if (action === "show-newsletter") {
      showNewsletterRail();
      return;
    }

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
      if (productModalEl.classList.contains("is-magnifying")) return;

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
      if (String(card.dataset.comingSoon || "").trim().toLowerCase() === "true") return;

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

function initProductMagnifier() {
  if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;

  const cards = Array.from(document.querySelectorAll('.product-card:not([data-coming-soon="true"])'));
  if (cards.length === 0) return;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  for (const card of cards) {
    const tile = card.querySelector(".product-tile");
    const img = card.querySelector(".product-image");
    if (!tile || !img) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "magnify-button";
    button.dataset.action = "magnify";
    button.setAttribute("aria-label", "Magnify");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
        <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    `.trim();
    tile.appendChild(button);

    const lens = document.createElement("div");
    lens.className = "zoom-lens";
    lens.setAttribute("aria-hidden", "true");
    tile.appendChild(lens);

    function isInSafeZone(event) {
      if (!event) return false;
      const rect = button.getBoundingClientRect();
      const padding = 14;
      return (
        event.clientX >= rect.left - padding &&
        event.clientX <= rect.right + padding &&
        event.clientY >= rect.top - padding &&
        event.clientY <= rect.bottom + padding
      );
    }

    function setSafeMode(next) {
      card.classList.toggle("magnify-safe", Boolean(next));
    }

    function applyBackground() {
      const src = img.currentSrc || img.src || "";
      if (!src) return;
      lens.style.backgroundImage = `url("${src}")`;
    }

    function update(event) {
      const rect = tile.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);

      lens.style.left = `${x}px`;
      lens.style.top = `${y}px`;

      const zoom = 2.2;
      lens.style.backgroundSize = `${Math.max(1, rect.width * zoom)}px ${Math.max(1, rect.height * zoom)}px`;

      const xPercent = rect.width === 0 ? 50 : (x / rect.width) * 100;
      const yPercent = rect.height === 0 ? 50 : (y / rect.height) * 100;
      lens.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
    }

    function setEnabled(next, event) {
      const enabled = Boolean(next);
      card.classList.toggle("is-magnifying", enabled);
      button.setAttribute("aria-pressed", enabled ? "true" : "false");

      if (!enabled) return;

      applyBackground();
      setSafeMode(isInSafeZone(event));
      if (event) {
        if (!isInSafeZone(event)) update(event);
        return;
      }

      const rect = tile.getBoundingClientRect();
      update({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setEnabled(!card.classList.contains("is-magnifying"), event);
    });

    card.addEventListener("pointerenter", (event) => {
      setSafeMode(isInSafeZone(event));
      if (!card.classList.contains("is-magnifying")) return;
      if (isInSafeZone(event)) return;
      applyBackground();
      update(event);
    });

    card.addEventListener("pointermove", (event) => {
      setSafeMode(isInSafeZone(event));
      if (!card.classList.contains("is-magnifying")) return;
      if (isInSafeZone(event)) return;
      update(event);
    });

    card.addEventListener("pointerleave", () => {
      setSafeMode(false);
    });
  }
}

function initModalMagnifier({ productModalEl, tileEl, imageEl }) {
  if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return null;
  if (!productModalEl || !tileEl || !(imageEl instanceof HTMLImageElement)) return null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "magnify-button";
  button.dataset.action = "modal-magnify";
  button.setAttribute("aria-label", "Magnify");
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  `.trim();
  tileEl.appendChild(button);

  const lens = document.createElement("div");
  lens.className = "zoom-lens";
  lens.setAttribute("aria-hidden", "true");
  tileEl.appendChild(lens);

  function isInSafeZone(event) {
    if (!event) return false;
    const rect = button.getBoundingClientRect();
    const padding = 14;
    return (
      event.clientX >= rect.left - padding &&
      event.clientX <= rect.right + padding &&
      event.clientY >= rect.top - padding &&
      event.clientY <= rect.bottom + padding
    );
  }

  function setSafeMode(next) {
    productModalEl.classList.toggle("magnify-safe", Boolean(next));
  }

  function applyBackground() {
    const src = imageEl.currentSrc || imageEl.src || "";
    if (!src) return;
    lens.style.backgroundImage = `url("${src}")`;
  }

  function update(event) {
    const rect = tileEl.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);

    lens.style.left = `${x}px`;
    lens.style.top = `${y}px`;

    const zoom = 2.2;
    lens.style.backgroundSize = `${Math.max(1, rect.width * zoom)}px ${Math.max(1, rect.height * zoom)}px`;

    const xPercent = rect.width === 0 ? 50 : (x / rect.width) * 100;
    const yPercent = rect.height === 0 ? 50 : (y / rect.height) * 100;
    lens.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
  }

  function setEnabled(next, event) {
    const enabled = Boolean(next);
    productModalEl.classList.toggle("is-magnifying", enabled);
    productModalEl.classList.toggle("magnify-hover", false);
    setSafeMode(isInSafeZone(event));
    button.setAttribute("aria-pressed", enabled ? "true" : "false");

    if (!enabled) return;

    applyBackground();
    if (event && !isInSafeZone(event)) {
      productModalEl.classList.add("magnify-hover");
      update(event);
      return;
    }

    const rect = tileEl.getBoundingClientRect();
    if (!isInSafeZone(event)) productModalEl.classList.add("magnify-hover");
    update({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setEnabled(!productModalEl.classList.contains("is-magnifying"), event);
  });

  tileEl.addEventListener("pointerenter", (event) => {
    setSafeMode(isInSafeZone(event));
    if (!productModalEl.classList.contains("is-magnifying")) return;
    if (isInSafeZone(event)) return;
    productModalEl.classList.add("magnify-hover");
    applyBackground();
    update(event);
  });

  tileEl.addEventListener("pointermove", (event) => {
    setSafeMode(isInSafeZone(event));
    if (!productModalEl.classList.contains("is-magnifying")) return;
    if (isInSafeZone(event)) {
      productModalEl.classList.remove("magnify-hover");
      return;
    }
    productModalEl.classList.add("magnify-hover");
    update(event);
  });

  tileEl.addEventListener("pointerleave", () => {
    setSafeMode(false);
    productModalEl.classList.remove("magnify-hover");
  });

  return {
    disable() {
      setEnabled(false);
    },
  };
}

function initNavUnderline() {
  const links = Array.from(document.querySelectorAll(".top-nav .nav-link"));
  if (links.length === 0) return;

  function normalizedKey(rawHref) {
    try {
      const url = new URL(rawHref, window.location.href);
      let path = url.pathname || "/";
      if (path === "/") path = "/index.html";
      return `${path}${url.hash || ""}`;
    } catch {
      return String(rawHref || "");
    }
  }

  const keysByLink = new Map(links.map((link) => [link, normalizedKey(link.getAttribute("href") || "")]));
  const availableKeys = new Set(keysByLink.values());

  function setActive(linkToActivate) {
    for (const link of links) link.classList.remove("is-active");
    if (!linkToActivate) return;
    linkToActivate.classList.add("is-active");
    const key = keysByLink.get(linkToActivate);
    if (key) localStorage.setItem(NAV_ACTIVE_STORAGE_KEY, key);
  }

  function activateByKey(key) {
    if (!key) return false;
    const match = links.find((link) => keysByLink.get(link) === key);
    if (!match) return false;
    setActive(match);
    return true;
  }

  function activateForCurrentLocation() {
    const current = new URL(window.location.href);
    let path = current.pathname || "/";
    if (path === "/") path = "/index.html";

    const candidates = [`${path}${current.hash || ""}`, path];
    for (const candidate of candidates) {
      if (availableKeys.has(candidate) && activateByKey(candidate)) return;
    }

    const stored = localStorage.getItem(NAV_ACTIVE_STORAGE_KEY) || "";
    if (stored && availableKeys.has(stored) && activateByKey(stored)) return;

    if (path === "/index.html" && availableKeys.has("/index.html#home")) {
      activateByKey("/index.html#home");
      return;
    }

    setActive(links[0] || null);
  }

  for (const link of links) {
    link.addEventListener("click", () => {
      setActive(link);
    });
  }

  window.addEventListener("hashchange", activateForCurrentLocation, { passive: true });
  activateForCurrentLocation();
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
