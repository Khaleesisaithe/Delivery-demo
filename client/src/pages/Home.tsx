import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bell,
  Check,
  Clock3,
  Flame,
  House,
  MapPin,
  Menu as MenuIcon,
  Minus,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Tag,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  calculateSubtotal,
  calculateTotal,
  formatBRL,
  getEffectivePriceCents,
} from "../../../shared/pricing";

type Option = { id: number; name: string; priceCents: number };
type CartLine = {
  key: string;
  productId: number;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  quantity: number;
  options: Option[];
  note: string;
};
type DeliveryType = "delivery" | "pickup";
type PaymentMethod = "pix" | "cash" | "card_delivery" | "card_pickup";

const HERO_IMAGE = "/assets/food/hero.jpg";
const ORIGINAL_DEMO_IMAGE = "/assets/food/burger.jpg";
const MENU_IMAGES = [
  "/assets/food/combo-1.jpg",
  "/assets/food/combo-2.jpg",
  "/assets/food/combo-3.jpg",
];
const AÇAÍ_IMAGE = "/assets/food/acai-bowl.jpg";
const JUICE_IMAGE = "/assets/food/natural-juice.jpg";
const MARMITEX_IMAGE = "/assets/food/marmitex.jpg";
function productImage(product: { name: string; imageUrl: string | null }) {
  if (product.imageUrl && product.imageUrl !== ORIGINAL_DEMO_IMAGE)
    return product.imageUrl;
  const name = product.name.toLocaleLowerCase("pt-BR");
  if (name.includes("açaí") || name.includes("acai")) return AÇAÍ_IMAGE;
  if (
    name.includes("suco") ||
    name.includes("limonada") ||
    name.includes("laranja") ||
    name.includes("maracujá")
  )
    return JUICE_IMAGE;
  if (name.includes("marmitex") || name.includes("marmita"))
    return MARMITEX_IMAGE;
  if (
    name.includes("frango") ||
    name.includes("chicken") ||
    name.includes("fritas") ||
    name.includes("porção") ||
    name.includes("porcao")
  )
    return MENU_IMAGES[1];
  if (
    name.includes("combo duplo") ||
    name.includes("combo veggie") ||
    name.includes("veggie")
  )
    return MENU_IMAGES[2];
  if (
    name.includes("combo") ||
    name.includes("bacon") ||
    name.includes("duplo")
  )
    return MENU_IMAGES[0];
  return MENU_IMAGES[2];
}
const categoryEmoji: Record<string, string> = {
  Hambúrgueres: "🍔",
  Combos: "🍟",
  Porções: "🥔",
  Bebidas: "🥤",
  Sobremesas: "🍰",
  Açaí: "🫐",
  "Sucos naturais": "🍊",
  Marmitex: "🍱",
};
const emptyAddress = {
  postalCode: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  reference: "",
};

export default function Home() {
  const catalog = trpc.delivery.catalog.home.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const data = catalog.data;
  const store = data?.store;
  const products = data?.products ?? [];
  useEffect(() => {
    if (!store || typeof document === "undefined") return;
    document.title = `${store.name} | Delivery`;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    const socialTitle = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]'
    );
    const socialDescription = document.querySelector<HTMLMetaElement>(
      'meta[property="og:description"]'
    );
    if (description)
      description.content = `${store.name}. ${store.tagline || "Peça online e acompanhe seu pedido."}`;
    if (socialTitle) socialTitle.content = `${store.name} | Delivery`;
    if (socialDescription)
      socialDescription.content =
        store.tagline || "Peça online e acompanhe seu pedido.";
  }, [store]);
  const orderMutation = trpc.delivery.orders.create.useMutation();
  const cepLookup = trpc.delivery.catalog.lookupCep.useMutation({
    onSuccess: result => {
      setAddress(current => ({
        ...current,
        postalCode: result.cep,
        street: result.street || current.street,
        neighborhood: result.neighborhood || current.neighborhood,
        city: result.city || current.city,
      }));
      toast.success(
        result.street || result.neighborhood
          ? "Endereço preenchido pelo CEP. Confira antes de continuar."
          : "CEP localizado. Complete o endereço, pois este CEP não informa a rua."
      );
    },
    onError: error => toast.error(error.message),
  });
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Option[]>([]);
  const [productNote, setProductNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("delivery-cart") || "[]"
      ) as CartLine[];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{
    publicId: string;
    orderNumber: string;
    totalCents: number;
    trackingUrl: string;
    whatsappUrl: string;
  } | null>(null);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const allowedPaymentMethods = useMemo(
    () =>
      (data?.paymentMethods ?? []).filter(method =>
        deliveryType === "delivery"
          ? method !== "card_pickup"
          : method !== "card_delivery"
      ),
    [data?.paymentMethods, deliveryType]
  );
  useEffect(() => {
    if (
      allowedPaymentMethods.length &&
      !allowedPaymentMethods.includes(paymentMethod)
    )
      setPaymentMethod(allowedPaymentMethods[0]);
  }, [allowedPaymentMethods, paymentMethod]);
  const [changeFor, setChangeFor] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [customerNote, setCustomerNote] = useState("");
  const [cartError, setCartError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    localStorage.setItem("delivery-cart", JSON.stringify(cart));
  }, [cart]);

  const subtotal = useMemo(
    () =>
      calculateSubtotal(
        cart.map(line => ({
          unitPriceCents: line.priceCents,
          quantity: line.quantity,
          options: line.options,
        }))
      ),
    [cart]
  );
  const deliveryFee =
    deliveryType === "delivery" ? (store?.deliveryFeeCents ?? 700) : 0;
  const total = calculateTotal(subtotal, deliveryFee);
  const selected = products.find(product => product.id === selectedProduct);
  const filteredProducts = products.filter(product => {
    const categoryMatch =
      activeCategory === null || product.categoryId === activeCategory;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (
      categoryMatch &&
      (!query ||
        `${product.name} ${product.description ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query))
    );
  });
  const featured = products.find(product => product.isFeatured);
  const popularProducts = [
    ...(featured ? [featured] : []),
    ...products.filter(
      product => product.isPromotion && product.id !== featured?.id
    ),
    ...products.filter(
      product =>
        data?.categories.find(category => category.id === product.categoryId)
          ?.name === "Combos" &&
        product.id !== featured?.id &&
        !product.isPromotion
    ),
  ].slice(0, 3);
  const promotionProducts = products.filter(
    product => product.isPromotion && product.promotionPriceCents !== null
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const storeOpen = store?.isOpen ?? true;
  const storePaused = Boolean(
    store?.pauseUntil && new Date(store.pauseUntil).getTime() > Date.now()
  );

  function openProduct(productId: number) {
    setSelectedProduct(productId);
    setSelectedOptions([]);
    setProductNote("");
    setQuantity(1);
  }
  function addProduct() {
    if (!selected) return;
    const options = selectedOptions.slice().sort((a, b) => a.id - b.id);
    const key = `${selected.id}:${options.map(option => option.id).join(",")}:${productNote.trim()}`;
    setCart(current => {
      const existing = current.find(line => line.key === key);
      if (existing)
        return current.map(line =>
          line.key === key
            ? { ...line, quantity: line.quantity + quantity }
            : line
        );
      return [
        ...current,
        {
          key,
          productId: selected.id,
          name: selected.name,
          description: selected.description,
          priceCents: getEffectivePriceCents(selected),
          imageUrl: selected.imageUrl,
          quantity,
          options,
          note: productNote.trim(),
        },
      ];
    });
    setSelectedProduct(null);
    setCartOpen(true);
    toast.success("Adicionado à sacola");
  }
  function changeCartQuantity(key: string, delta: number) {
    setCart(current =>
      current.flatMap(line =>
        line.key !== key
          ? [line]
          : line.quantity + delta <= 0
            ? []
            : [{ ...line, quantity: line.quantity + delta }]
      )
    );
  }
  function beginCheckout() {
    if (!storeOpen) {
      toast.error(
        storePaused
          ? "A loja está em pausa por até uma hora. Tente novamente em instantes."
          : store?.closedMessage || "A loja está fechada no momento."
      );
      return;
    }
    if (!cart.length) return;
    if (subtotal < (store?.minimumOrderCents ?? 2000)) {
      setCartError(
        `Pedido mínimo de ${formatBRL(store?.minimumOrderCents ?? 2000)}.`
      );
      return;
    }
    setCartError("");
    setCartOpen(false);
    setCheckoutOpen(true);
  }
  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (customerName.trim().split(/\s+/).filter(Boolean).length < 2) {
      toast.error("Informe seu nome e sobrenome.");
      return;
    }
    if (
      deliveryType === "delivery" &&
      (!/^\d{5}-?\d{3}$/.test(address.postalCode.replace(/\s/g, "")) ||
        !address.street.trim() ||
        !address.streetNumber.trim() ||
        !address.neighborhood.trim() ||
        !address.city.trim())
    ) {
      toast.error(
        "Informe um CEP válido e preencha rua, número, bairro e cidade para a entrega."
      );
      return;
    }
    orderMutation.mutate(
      {
        customerName,
        phone,
        deliveryType,
        paymentMethod,
        changeForCents:
          paymentMethod === "cash" && changeFor
            ? Math.round(Number(changeFor.replace(",", ".")) * 100)
            : null,
        ...address,
        customerNote,
        items: cart.map(line => ({
          productId: line.productId,
          quantity: line.quantity,
          optionIds: line.options.map(option => option.id),
          note: line.note || undefined,
        })),
      },
      {
        onSuccess: result => {
          setCreatedOrder(result);
          setCart([]);
          setCheckoutOpen(false);
          setCartOpen(false);
          window.history.pushState({}, "", `/pedido/${result.publicId}`);
          toast.success("Pedido confirmado no sistema!");
        },
        onError: error =>
          toast.error(
            error.message ||
              "Não foi possível realizar o pedido. Tente novamente."
          ),
      }
    );
  }

  if (catalog.isLoading)
    return (
      <div className="loading-shell">
        <span className="loader-mark">
          <Flame size={24} />
        </span>
        <span>Acendendo a brasa…</span>
      </div>
    );
  if (catalog.error || !data)
    return (
      <main className="load-error">
        <Flame size={28} />
        <h1>Estamos preparando a casa.</h1>
        <p>Não foi possível carregar o cardápio agora.</p>
        <button onClick={() => catalog.refetch()}>Tentar novamente</button>
      </main>
    );
  if (!store)
    return (
      <main className="load-error">
        <Store size={30} />
        <h1>Esta loja está sendo configurada.</h1>
        <p>Volte em alguns instantes para conhecer o cardápio.</p>
      </main>
    );

  return (
    <div
      className="storefront app-storefront"
      id="inicio"
      style={{ "--bp-fire": store.brandColor } as CSSProperties}
    >
      <header className="app-topbar">
        <button
          className="header-icon-button menu-trigger"
          onClick={() =>
            document
              .getElementById("cardapio")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          aria-label="Ir para o cardápio"
        >
          <MenuIcon size={21} />
        </button>
        <a className="app-brand" href="/" aria-label={`${store.name}, início`}>
          <span className="brand-mark">
            {store.logoUrl ? (
              <img className="store-logo" src={store.logoUrl} alt="" />
            ) : (
              <Flame size={20} fill="currentColor" />
            )}
          </span>
          <span>
            <small>{store.tagline || "Delivery da casa"}</small>
            <b>{store.name}</b>
          </span>
        </a>
        <div
          className={`open-pill app-open-pill ${storeOpen ? "is-open" : "is-closed"}`}
        >
          <i />
          {storePaused ? "Em pausa" : storeOpen ? "Aberto" : "Fechado"}
        </div>
        <Link
          href="/pedido"
          className="header-icon-button notification-trigger"
          aria-label="Acompanhar pedido"
        >
          <Bell size={20} />
        </Link>
        <button
          className="header-icon-button bag-trigger"
          onClick={() => setCartOpen(true)}
          aria-label={`Abrir sacola, ${itemCount} itens`}
        >
          <ShoppingBag size={20} />
          {itemCount > 0 && <b className="header-count">{itemCount}</b>}
        </button>
      </header>

      <div className="search-row">
        <div className="mobile-search">
          <Search size={20} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar seu sabor favorito..."
            aria-label="Buscar produtos"
          />
          <button
            className="filter-button"
            onClick={() => setFilterOpen(value => !value)}
            aria-label="Filtrar por categoria"
          >
            <Settings2 size={19} />
          </button>
        </div>
        {filterOpen && (
          <div className="quick-filter-popover">
            <b>Filtrar por categoria</b>
            <button
              className={activeCategory === null ? "quick-filter-active" : ""}
              onClick={() => {
                setActiveCategory(null);
                setFilterOpen(false);
                document
                  .getElementById("cardapio")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Tudo
            </button>
            {data.categories.map(category => (
              <button
                key={category.id}
                className={
                  activeCategory === category.id ? "quick-filter-active" : ""
                }
                onClick={() => {
                  setActiveCategory(category.id);
                  setFilterOpen(false);
                  document
                    .getElementById("cardapio")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {categoryEmoji[category.name] || "✦"} {category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <main>
        <section className="hero-wrap app-hero">
          <div className="hero-art">
            <img
              src={store.bannerUrl || HERO_IMAGE}
              alt={`${store.name} — imagem de destaque`}
            />
            <div className="hero-photo-shade" />
          </div>
          <div className="hero-copy">
            <span className="limited-label">FEITO AGORA · EDIÇÃO DA CASA</span>
            <h1>
              Feito na brasa.
              <br />
              <em>Chega quentinho.</em>
            </h1>
            <p>{store.tagline}</p>
            <a href="#cardapio" className="hero-cta">
              Pedir agora{" "}
              <span className="round-arrow">
                <ArrowRight size={16} />
              </span>
            </a>
          </div>
          <div className="hero-dots" aria-hidden="true">
            <i className="active" />
            <i />
            <i />
          </div>
        </section>

        <section
          className="category-section"
          aria-label="Categorias do cardápio"
        >
          <div className="category-row visual-category-row">
            <button
              className={
                activeCategory === null
                  ? "visual-category active"
                  : "visual-category"
              }
              onClick={() => {
                setActiveCategory(null);
                setActiveTab("menu");
              }}
            >
              <span className="category-photo all-category">
                <Flame size={22} />
              </span>
              <b>Tudo</b>
            </button>
            {data.categories.map(category => {
              const sample = products.find(
                product => product.categoryId === category.id
              );
              const categoryPhoto =
                category.name === "Açaí"
                  ? AÇAÍ_IMAGE
                  : category.name === "Sucos naturais"
                    ? JUICE_IMAGE
                    : category.name === "Marmitex"
                      ? MARMITEX_IMAGE
                      : category.name === "Porções"
                        ? MENU_IMAGES[1]
                        : category.name === "Combos"
                          ? MENU_IMAGES[2]
                          : category.name === "Hambúrgueres"
                            ? MENU_IMAGES[0]
                            : sample
                              ? productImage(sample)
                              : MENU_IMAGES[2];
              return (
                <button
                  key={category.id}
                  className={
                    activeCategory === category.id
                      ? "visual-category active"
                      : "visual-category"
                  }
                  onClick={() => {
                    setActiveCategory(category.id);
                    setActiveTab("menu");
                  }}
                >
                  <span className="category-photo">
                    {categoryPhoto ? (
                      <img src={categoryPhoto} alt="" />
                    ) : (
                      <span>{categoryEmoji[category.name] || "✦"}</span>
                    )}
                  </span>
                  <b>{category.name}</b>
                </button>
              );
            })}
          </div>
        </section>

        <section className="popular-section" id="cardapio">
          <div className="app-section-heading">
            <div>
              <h2>Mais pedidos</h2>
              <p>Os favoritos da casa</p>
            </div>
            <button
              className="view-all"
              onClick={() => {
                setActiveCategory(null);
                setActiveTab("menu");
                document
                  .getElementById("menu-completo")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Ver todos <ArrowRight size={16} />
            </button>
          </div>
          <div className="popular-grid">
            {popularProducts.map((product, index) => (
              <article
                className="popular-card"
                key={product.id}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <button
                  className="popular-photo"
                  onClick={() => openProduct(product.id)}
                  aria-label={`Ver ${product.name}`}
                >
                  <img
                    src={productImage(product)}
                    alt={product.name}
                    loading="lazy"
                  />
                  <span
                    className={
                      product.isPromotion
                        ? "popular-tag promo-tag"
                        : index === 1
                          ? "popular-tag gold-tag"
                          : "popular-tag"
                    }
                  >
                    {product.isPromotion
                      ? "PROMOÇÃO DO DIA"
                      : index === 0
                        ? "MAIS VENDIDO"
                        : index === 1
                          ? "POPULAR"
                          : "QUERIDINHO"}
                  </span>
                </button>
                <div className="popular-info">
                  <button
                    className="popular-title"
                    onClick={() => openProduct(product.id)}
                  >
                    {product.name}
                  </button>
                  <p>{product.description}</p>
                  <div className="popular-bottom">
                    <div>
                      <span className="rating">★</span> 4,8{" "}
                      <small>(+1,2 mil)</small>
                      <strong
                        className={
                          product.isPromotion ? "customer-promo-price" : ""
                        }
                      >
                        {product.isPromotion && product.promotionPriceCents ? (
                          <>
                            <del>{formatBRL(product.priceCents)}</del>
                            {formatBRL(product.promotionPriceCents)}
                          </>
                        ) : (
                          formatBRL(product.priceCents)
                        )}
                      </strong>
                    </div>
                    <button
                      className="round-add"
                      onClick={() => openProduct(product.id)}
                      aria-label={`Adicionar ${product.name}`}
                    >
                      <Plus size={19} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="offer-strip">
          <div>
            <span>FEITO NA BRASA</span>
            <h2>
              Seu próximo favorito
              <br />
              está no cardápio.
            </h2>
            <button
              onClick={() => {
                const combo = data.categories.find(
                  category => category.name === "Combos"
                );
                setActiveCategory(combo?.id ?? null);
                document
                  .getElementById("menu-completo")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Descobrir sabores <ArrowRight size={15} />
            </button>
          </div>
          <span className="offer-art">
            <img
              src={MENU_IMAGES[0]}
              alt="Burger artesanal acompanhado de batatas"
            />
          </span>
        </section>

        {promotionProducts.length > 0 && (
          <section
            className="popular-section daily-promotions"
            aria-label="Promoções do dia"
          >
            <div className="app-section-heading">
              <div>
                <span className="promo-kicker">OFERTA POR TEMPO LIMITADO</span>
                <h2>Promoções de hoje</h2>
                <p>Preços especiais enquanto durar o estoque.</p>
              </div>
            </div>
            <div className="popular-grid">
              {promotionProducts.map(product => (
                <article
                  className="popular-card"
                  key={`promotion-${product.id}`}
                >
                  <button
                    className="popular-photo"
                    onClick={() => openProduct(product.id)}
                    aria-label={`Ver promoção de ${product.name}`}
                  >
                    <img
                      src={productImage(product)}
                      alt={product.name}
                      loading="lazy"
                    />
                    <span className="popular-tag promo-tag">
                      PROMOÇÃO DO DIA
                    </span>
                  </button>
                  <div className="popular-info">
                    <button
                      className="popular-title"
                      onClick={() => openProduct(product.id)}
                    >
                      {product.name}
                    </button>
                    <p>{product.description}</p>
                    <div className="promo-price-stack">
                      <del>{formatBRL(product.priceCents)}</del>
                      <strong>
                        {formatBRL(getEffectivePriceCents(product))}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="menu-section complete-menu" id="menu-completo">
          <div className="section-heading">
            <div>
              <span className="eyebrow">DO NOSSO FOGO PARA A SUA MESA</span>
              <h2>Cardápio completo</h2>
            </div>
          </div>
          <div className="category-row full-menu-categories">
            <button
              className={
                activeCategory === null
                  ? "category-chip active"
                  : "category-chip"
              }
              onClick={() => setActiveCategory(null)}
            >
              Tudo <span>{products.length}</span>
            </button>
            {data.categories.map(category => (
              <button
                key={category.id}
                className={
                  activeCategory === category.id
                    ? "category-chip active"
                    : "category-chip"
                }
                onClick={() => setActiveCategory(category.id)}
              >
                <span className="category-emoji">
                  {categoryEmoji[category.name] || "✦"}
                </span>
                {category.name}
              </button>
            ))}
          </div>
          <div className="menu-grid">
            {filteredProducts.map((product, index) => {
              const category = data.categories.find(
                item => item.id === product.categoryId
              );
              return (
                <article
                  className="product-card"
                  key={product.id}
                  style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
                >
                  <button
                    className="product-image"
                    onClick={() => openProduct(product.id)}
                    aria-label={`Ver ${product.name}`}
                  >
                    <img
                      src={productImage(product)}
                      alt={product.name}
                      loading="lazy"
                    />
                    {product.isFeatured && (
                      <b className="mini-badge">Favorito</b>
                    )}
                    {product.isPromotion && (
                      <b className="mini-badge promo-badge">Promoção do dia</b>
                    )}
                  </button>
                  <div className="product-copy">
                    <div className="product-title-row">
                      <h3>{product.name}</h3>
                      <strong
                        className={
                          product.isPromotion ? "customer-promo-price" : ""
                        }
                      >
                        {product.isPromotion && product.promotionPriceCents ? (
                          <>
                            <del>{formatBRL(product.priceCents)}</del>
                            {formatBRL(product.promotionPriceCents)}
                          </>
                        ) : (
                          formatBRL(product.priceCents)
                        )}
                      </strong>
                    </div>
                    <p>{product.description}</p>
                    <div className="product-bottom">
                      <small>{category?.name}</small>
                      <button
                        onClick={() => openProduct(product.id)}
                        aria-label={`Adicionar ${product.name}`}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {!filteredProducts.length && (
            <div className="empty-results">
              <span>🍽️</span>
              <h3>Não achamos esse sabor.</h3>
              <p>Tente outro nome ou escolha uma categoria.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setActiveCategory(null);
                }}
              >
                Limpar busca
              </button>
            </div>
          )}
        </section>
        <section className="store-footer">
          <div>
            <span className="brand-mark">
              {store.logoUrl ? (
                <img className="store-logo" src={store.logoUrl} alt="" />
              ) : (
                <Flame size={18} fill="currentColor" />
              )}
            </span>
            <b>{store.name}</b>
          </div>
          <p>{store.businessHours || "Consulte os horários da loja."}</p>
          {store.address && <p>{store.address}</p>}
          {store.phone && (
            <p>
              <a href={`https://wa.me/${store.phone.replace(/\D/g, "")}`}>
                WhatsApp da loja
              </a>
            </p>
          )}
          <span>
            © {new Date().getFullYear()} {store.name}
          </span>
        </section>
      </main>

      <nav
        className={`bottom-nav ${itemCount > 0 && !cartOpen && !checkoutOpen ? "cart-visible" : ""}`}
        aria-label="Navegação principal"
      >
        <a
          href="#inicio"
          className={activeTab === "home" ? "bottom-tab active" : "bottom-tab"}
          onClick={() => setActiveTab("home")}
        >
          <House size={19} />
          <small>Início</small>
        </a>
        <a
          href="#cardapio"
          className={activeTab === "menu" ? "bottom-tab active" : "bottom-tab"}
          onClick={() => setActiveTab("menu")}
        >
          <Utensils size={19} />
          <small>Cardápio</small>
        </a>
        <Link href="/pedido" className="bottom-tab order-tab">
          <span>
            <ShoppingBag size={19} />
          </span>
          <small>Pedidos</small>
        </Link>
        <button
          className="bottom-tab"
          onClick={() => {
            const combo = data.categories.find(
              category => category.name === "Combos"
            );
            setActiveCategory(combo?.id ?? null);
            setActiveTab("offers");
            document
              .getElementById("menu-completo")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <Tag size={19} />
          <small>Ofertas</small>
        </button>
      </nav>
      {itemCount > 0 && !cartOpen && !checkoutOpen && !createdOrder && (
        <button className="cart-bar" onClick={() => setCartOpen(true)}>
          <span className="cart-bar-icon">
            <ShoppingBag size={19} />
            <b>{itemCount}</b>
          </span>
          <span>Ver sacola</span>
          <strong>{formatBRL(subtotal)}</strong>
          <ArrowRight size={18} />
        </button>
      )}
      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <aside
            className="side-panel"
            onClick={event => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SEU PEDIDO</span>
                <h2>
                  Sua sacola <span>({itemCount})</span>
                </h2>
              </div>
              <button
                className="icon-close"
                onClick={() => setCartOpen(false)}
                aria-label="Fechar"
              >
                <X />
              </button>
            </div>
            {!cart.length ? (
              <div className="empty-cart">
                <ShoppingBag size={35} />
                <h3>Sua sacola está vazia</h3>
                <p>Escolha alguma delícia do cardápio.</p>
                <button onClick={() => setCartOpen(false)}>
                  Voltar ao cardápio
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map(line => (
                    <div className="cart-line" key={line.key}>
                      <div className="cart-thumb">
                        {categoryEmoji[
                          data.categories.find(
                            c =>
                              c.id ===
                              products.find(p => p.id === line.productId)
                                ?.categoryId
                          )?.name || ""
                        ] || "🍽️"}
                      </div>
                      <div className="cart-line-main">
                        <b>{line.name}</b>
                        {line.options.length > 0 && (
                          <small>
                            +{" "}
                            {line.options.map(option => option.name).join(", ")}
                          </small>
                        )}
                        {line.note && <small>Obs.: {line.note}</small>}
                        <strong>
                          {formatBRL(
                            (line.priceCents +
                              line.options.reduce(
                                (sum, option) => sum + option.priceCents,
                                0
                              )) *
                              line.quantity
                          )}
                        </strong>
                        <div className="stepper">
                          <button
                            onClick={() => changeCartQuantity(line.key, -1)}
                            aria-label="Diminuir"
                          >
                            <Minus size={14} />
                          </button>
                          <b>{line.quantity}</b>
                          <button
                            onClick={() => changeCartQuantity(line.key, 1)}
                            aria-label="Aumentar"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <button
                        className="remove-line"
                        onClick={() =>
                          changeCartQuantity(line.key, -line.quantity)
                        }
                        aria-label="Remover item"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <b>{formatBRL(subtotal)}</b>
                  </div>
                  <div>
                    <span>Entrega</span>
                    <b>
                      {deliveryType === "pickup"
                        ? "Grátis"
                        : formatBRL(store?.deliveryFeeCents ?? 0)}
                    </b>
                  </div>
                  {cartError && <p className="form-error">{cartError}</p>}
                  <div className="total-row">
                    <span>Total estimado</span>
                    <strong>{formatBRL(total)}</strong>
                  </div>
                  <button className="primary-button" onClick={beginCheckout}>
                    Ir para o checkout <ArrowRight size={17} />
                  </button>
                  <p className="secure-note">
                    Seu pedido fica registrado antes de abrir o WhatsApp.
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {selected && (
        <div
          className="overlay modal-overlay"
          onClick={() => setSelectedProduct(null)}
        >
          <section
            className="product-modal"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="icon-close modal-close"
              onClick={() => setSelectedProduct(null)}
              aria-label="Fechar"
            >
              <X />
            </button>
            <div className="modal-photo">
              <img src={productImage(selected)} alt={selected.name} />
            </div>
            <div className="modal-body">
              <span className="eyebrow">
                {
                  data.categories.find(
                    category => category.id === selected.categoryId
                  )?.name
                }
              </span>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <strong className="modal-price">
                {selected.isPromotion && selected.promotionPriceCents ? (
                  <>
                    <del>{formatBRL(selected.priceCents)}</del>
                    {formatBRL(getEffectivePriceCents(selected))}
                  </>
                ) : (
                  formatBRL(selected.priceCents)
                )}
              </strong>
              {data.options.filter(option => option.productId === selected.id)
                .length > 0 && (
                <div className="addon-list">
                  <div className="addon-heading">
                    <b>Deixe do seu jeito</b>
                    <small>Adicionais opcionais</small>
                  </div>
                  {data.options
                    .filter(option => option.productId === selected.id)
                    .map(option => (
                      <label key={option.id} className="addon-row">
                        <input
                          type="checkbox"
                          checked={selectedOptions.some(
                            item => item.id === option.id
                          )}
                          onChange={event =>
                            setSelectedOptions(current =>
                              event.target.checked
                                ? [...current, option]
                                : current.filter(item => item.id !== option.id)
                            )
                          }
                        />
                        <span>{option.name}</span>
                        <b>+ {formatBRL(option.priceCents)}</b>
                      </label>
                    ))}
                </div>
              )}
              <label className="note-label">
                Alguma observação?
                <textarea
                  value={productNote}
                  maxLength={500}
                  onChange={event => setProductNote(event.target.value)}
                  placeholder="Ex.: sem cebola, ponto da carne…"
                />
              </label>
              <div className="modal-action">
                <div className="stepper large">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus size={15} />
                  </button>
                  <b>{quantity}</b>
                  <button onClick={() => setQuantity(quantity + 1)}>
                    <Plus size={15} />
                  </button>
                </div>
                <button className="primary-button" onClick={addProduct}>
                  Adicionar ·{" "}
                  {formatBRL(
                    (getEffectivePriceCents(selected) +
                      selectedOptions.reduce(
                        (sum, option) => sum + option.priceCents,
                        0
                      )) *
                      quantity
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div
          className="overlay modal-overlay"
          onClick={() => setCheckoutOpen(false)}
        >
          <section
            className="checkout-modal"
            onClick={event => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SÓ MAIS UM PASSO</span>
                <h2>Finalizar pedido</h2>
              </div>
              <button
                className="icon-close"
                onClick={() => setCheckoutOpen(false)}
                aria-label="Fechar"
              >
                <X />
              </button>
            </div>
            <form onSubmit={submitOrder}>
              <div className="checkout-scroll">
                <section className="form-section">
                  <h3>Seus dados</h3>
                  <div className="field-grid">
                    <label>
                      Nome e sobrenome
                      <input
                        required
                        minLength={5}
                        value={customerName}
                        onChange={event => setCustomerName(event.target.value)}
                        placeholder="Como podemos te chamar?"
                      />
                    </label>
                    <label>
                      Telefone / WhatsApp
                      <input
                        required
                        minLength={8}
                        value={phone}
                        onChange={event => setPhone(event.target.value)}
                        placeholder="(11) 99999-9999"
                        inputMode="tel"
                      />
                    </label>
                  </div>
                </section>
                <section className="form-section">
                  <h3>Como prefere receber?</h3>
                  <div className="choice-grid">
                    <button
                      type="button"
                      className={
                        deliveryType === "delivery"
                          ? "choice-card selected"
                          : "choice-card"
                      }
                      onClick={() => setDeliveryType("delivery")}
                    >
                      <MapPin size={18} />
                      <span>
                        <b>Entrega</b>
                        <small>{formatBRL(store?.deliveryFeeCents ?? 0)}</small>
                      </span>
                      {deliveryType === "delivery" && <Check size={17} />}
                    </button>
                    <button
                      type="button"
                      className={
                        deliveryType === "pickup"
                          ? "choice-card selected"
                          : "choice-card"
                      }
                      onClick={() => setDeliveryType("pickup")}
                    >
                      <Store size={18} />
                      <span>
                        <b>Retirada</b>
                        <small>Sem taxa</small>
                      </span>
                      {deliveryType === "pickup" && <Check size={17} />}
                    </button>
                  </div>
                  {deliveryType === "delivery" && (
                    <div className="field-grid address-grid">
                      <label className="field-wide">
                        CEP
                        <div className="cep-input-row">
                          <input
                            required
                            maxLength={9}
                            value={address.postalCode}
                            onChange={event =>
                              setAddress({
                                ...address,
                                postalCode: event.target.value,
                              })
                            }
                            placeholder="00000-000"
                            inputMode="numeric"
                            autoComplete="postal-code"
                          />
                          <button
                            type="button"
                            disabled={
                              cepLookup.isPending ||
                              !/^\d{5}-?\d{3}$/.test(address.postalCode.trim())
                            }
                            onClick={() =>
                              cepLookup.mutate({ cep: address.postalCode })
                            }
                          >
                            {cepLookup.isPending ? (
                              <>
                                <Clock3 size={14} /> Buscando…
                              </>
                            ) : (
                              <>
                                <MapPin size={14} /> Buscar endereço
                              </>
                            )}
                          </button>
                        </div>
                        <small>
                          Preenche rua, bairro e cidade quando o CEP
                          disponibiliza esses dados; confira antes de enviar.
                        </small>
                      </label>
                      <label>
                        Rua
                        <input
                          required
                          value={address.street}
                          onChange={event =>
                            setAddress({
                              ...address,
                              street: event.target.value,
                            })
                          }
                          placeholder="Nome da rua"
                        />
                      </label>
                      <label>
                        Número
                        <input
                          required
                          value={address.streetNumber}
                          onChange={event =>
                            setAddress({
                              ...address,
                              streetNumber: event.target.value,
                            })
                          }
                          placeholder="123"
                        />
                      </label>
                      <label>
                        Complemento
                        <input
                          value={address.complement}
                          onChange={event =>
                            setAddress({
                              ...address,
                              complement: event.target.value,
                            })
                          }
                          placeholder="Apto, casa…"
                        />
                      </label>
                      <label>
                        Bairro
                        <input
                          required
                          value={address.neighborhood}
                          onChange={event =>
                            setAddress({
                              ...address,
                              neighborhood: event.target.value,
                            })
                          }
                          placeholder="Seu bairro"
                        />
                      </label>
                      <label>
                        Cidade
                        <input
                          required
                          value={address.city}
                          onChange={event =>
                            setAddress({ ...address, city: event.target.value })
                          }
                          placeholder="Cidade"
                        />
                      </label>
                      <label className="field-wide">
                        Ponto de referência
                        <input
                          value={address.reference}
                          onChange={event =>
                            setAddress({
                              ...address,
                              reference: event.target.value,
                            })
                          }
                          placeholder="Ex.: portão azul, em frente à praça…"
                        />
                        <small>
                          Quanto melhor o ponto de referência, mais fácil para o
                          entregador encontrar o endereço.
                        </small>
                      </label>
                    </div>
                  )}
                </section>
                <section className="form-section">
                  <h3>Forma de pagamento</h3>
                  <div className="payment-options">
                    {(
                      [
                        { value: "pix", label: "Pix", icon: "◈" },
                        { value: "cash", label: "Dinheiro", icon: "R$" },
                        {
                          value: "card_delivery",
                          label: "Cartão na entrega",
                          icon: "▣",
                        },
                        {
                          value: "card_pickup",
                          label: "Cartão na retirada",
                          icon: "▣",
                        },
                      ] as {
                        value: PaymentMethod;
                        label: string;
                        icon: string;
                      }[]
                    )
                      .filter(
                        option =>
                          data.paymentMethods.includes(option.value) &&
                          (deliveryType === "delivery"
                            ? option.value !== "card_pickup"
                            : option.value !== "card_delivery")
                      )
                      .map(option => (
                        <label
                          key={option.value}
                          className={
                            paymentMethod === option.value
                              ? "payment-choice selected"
                              : "payment-choice"
                          }
                        >
                          <input
                            type="radio"
                            name="payment"
                            checked={paymentMethod === option.value}
                            onChange={() => setPaymentMethod(option.value)}
                          />
                          <span>{option.icon}</span>
                          {option.label}
                        </label>
                      ))}
                  </div>
                  {paymentMethod === "cash" && (
                    <label className="cash-change">
                      Troco para quanto? (opcional)
                      <input
                        className="change-input"
                        value={changeFor}
                        onChange={event => setChangeFor(event.target.value)}
                        placeholder="Ex.: 50,00"
                        inputMode="decimal"
                      />
                    </label>
                  )}
                </section>
                <section className="form-section">
                  <label className="note-label">
                    Observações do pedido
                    <textarea
                      value={customerNote}
                      maxLength={500}
                      onChange={event => setCustomerNote(event.target.value)}
                      placeholder="Alguma instrução para a loja?"
                    />
                  </label>
                </section>
              </div>
              <div className="checkout-footer">
                <div>
                  <span>Total do pedido</span>
                  <b>{formatBRL(total)}</b>
                </div>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={orderMutation.isPending}
                >
                  {orderMutation.isPending
                    ? "Registrando pedido…"
                    : "Confirmar pedido"}
                  <ArrowRight size={17} />
                </button>
                <p>
                  O pedido será salvo no sistema antes de abrir a conversa no
                  WhatsApp.
                </p>
              </div>
            </form>
          </section>
        </div>
      )}

      {createdOrder && (
        <div className="overlay modal-overlay">
          <section className="success-modal">
            <span className="success-icon">
              <Check size={31} />
            </span>
            <span className="eyebrow">PEDIDO REGISTRADO</span>
            <h2>Agora é com a gente.</h2>
            <p>
              Seu pedido <b>{createdOrder.orderNumber}</b> já está registrado.
              Envie a mensagem à loja para confirmar os detalhes.
            </p>
            <div className="success-total">
              <span>Total</span>
              <b>{formatBRL(createdOrder.totalCents)}</b>
            </div>
            <a
              className="primary-button whatsapp-cta"
              href={createdOrder.whatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              Confirmar pelo WhatsApp <ArrowRight size={17} />
            </a>
            <Link
              className="secondary-button"
              href={`/pedido/${createdOrder.publicId}`}
              onClick={() => setCreatedOrder(null)}
            >
              Acompanhar meu pedido
            </Link>
            <button
              className="text-button"
              onClick={() => setCreatedOrder(null)}
            >
              Voltar ao cardápio
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
