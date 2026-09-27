import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Eye,
  Flame,
  LoaderCircle,
  MessageCircle,
  Pause,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Play,
  Phone,
  Settings2,
  ShoppingBag,
  Store,
  Trash2,
  Utensils,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  printInternalKitchenTicket,
  printServiceTicket,
} from "@/lib/printTicket";
import ChangePassword from "@/pages/ChangePassword";
import { formatBRL } from "../../../shared/pricing";

type Status =
  | "received"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "rejected";
type EditableOrder = {
  customerName: string;
  phone: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  reference: string;
  customerNote: string;
  items: { id: number; quantity: number; note: string }[];
};
type ProductDraft = {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  isPromotion: boolean;
  promotionPrice: string;
  isAvailable: boolean;
  isFeatured: boolean;
  options: string;
};
const stages: { key: Status; title: string; color: string; next?: Status }[] = [
  { key: "received", title: "Novos", color: "amber", next: "confirmed" },
  { key: "confirmed", title: "Confirmados", color: "blue", next: "preparing" },
  { key: "preparing", title: "Preparando", color: "orange", next: "ready" },
  { key: "ready", title: "Prontos", color: "green", next: "out_for_delivery" },
  {
    key: "out_for_delivery",
    title: "Em entrega",
    color: "violet",
    next: "delivered",
  },
  { key: "delivered", title: "Entregues", color: "muted" },
  { key: "cancelled", title: "Cancelados", color: "muted" },
  { key: "rejected", title: "Recusados", color: "muted" },
];
const statusNames: Record<Status, string> = {
  received: "Novo pedido",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
  rejected: "Recusado",
};
const paymentNames: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card_delivery: "Cartão na entrega",
  card_pickup: "Cartão na retirada",
};
const initialProduct: ProductDraft = {
  categoryId: "",
  name: "",
  description: "",
  price: "",
  imageUrl: "",
  isPromotion: false,
  promotionPrice: "",
  isAvailable: true,
  isFeatured: false,
  options: "",
};

export default function Admin() {
  const { user, loading } = useAuth();
  const storeRole = user?.role === "admin" || user?.role === "staff";
  if (!loading && user?.passwordResetRequired) return <ChangePassword />;
  return (
    <DashboardLayout>
      {loading ? (
        <div className="admin-loading">
          <LoaderCircle className="spin" /> Abrindo o painel…
        </div>
      ) : storeRole ? (
        <AdminWorkspace isOwner={user.role === "admin"} />
      ) : (
        <div className="admin-denied">
          <span>🔒</span>
          <h1>Acesso exclusivo da equipe</h1>
          <p>
            Peça ao proprietário da loja para habilitar seu perfil de
            funcionário.
          </p>
          <Link href="/" className="primary-button">
            Voltar ao cardápio
          </Link>
        </div>
      )}
    </DashboardLayout>
  );
}

function AdminWorkspace({ isOwner }: { isOwner: boolean }) {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const stats = trpc.delivery.orders.adminStats.useQuery(undefined, {
    refetchInterval: 8000,
    enabled: isOwner,
  });
  const [salesDays, setSalesDays] = useState<7 | 30 | 90>(30);
  const sales = trpc.delivery.orders.adminSales.useQuery(
    { days: salesDays },
    { enabled: isOwner }
  );
  const orderQuery = trpc.delivery.orders.adminList.useQuery(undefined, {
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
  const catalog = trpc.delivery.catalog.adminData.useQuery(undefined, {
    enabled: isOwner,
  });
  const isTeam = isOwner && location === "/admin/equipe";
  const teamQuery = trpc.delivery.team.list.useQuery(undefined, {
    enabled: isTeam,
  });
  const createStaff = trpc.delivery.team.createStaff.useMutation({
    onSuccess: async result => {
      await utils.delivery.team.list.invalidate();
      setTemporaryPassword(result.temporaryPassword);
      setEmployeeDraft({ name: "", email: "" });
      toast.success(
        "Conta criada. Copie a senha temporária e entregue-a com segurança."
      );
    },
    onError: error => toast.error(error.message),
  });
  const setStaffActive = trpc.delivery.team.setActive.useMutation({
    onSuccess: async () => {
      await utils.delivery.team.list.invalidate();
      toast.success("Acesso atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const resetStaffPassword = trpc.delivery.team.resetStaffPassword.useMutation({
    onSuccess: result => {
      setTemporaryPassword(result.temporaryPassword);
      toast.success("Nova senha temporária criada.");
    },
    onError: error => toast.error(error.message),
  });
  const statusMutation = trpc.delivery.orders.adminUpdateStatus.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.delivery.orders.adminList.invalidate(),
        utils.delivery.orders.adminStats.invalidate(),
        utils.delivery.orders.adminSales.invalidate(),
      ]);
      if (!result.whatsappDelivered)
        toast.success(
          "Status atualizado. Notificação automática pelo WhatsApp ainda não está configurada."
        );
      else toast.success("Status atualizado e aviso enviado pelo WhatsApp.");
    },
  });
  const noteMutation = trpc.delivery.orders.adminNote.useMutation({
    onSuccess: () => {
      utils.delivery.orders.adminDetail.invalidate();
      toast.success("Observação salva.");
    },
  });
  const editOrderMutation = trpc.delivery.orders.adminEdit.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.delivery.orders.adminDetail.invalidate(),
        utils.delivery.orders.adminList.invalidate(),
        utils.delivery.orders.adminStats.invalidate(),
        utils.delivery.orders.adminSales.invalidate(),
      ]);
      setWhatsappDraftUrl(result.whatsappUrl);
      toast.success(
        "Pedido alterado. O WhatsApp abrirá com a mensagem pronta; confira e toque em Enviar."
      );
    },
    onError: error => toast.error(error.message),
  });
  const createCategory = trpc.delivery.catalog.categoryCreate.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      setCategoryName("");
      toast.success("Categoria criada.");
    },
  });
  const toggleCategory = trpc.delivery.catalog.categoryToggle.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
    },
  });
  const deleteCategory = trpc.delivery.catalog.categoryDelete.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      toast.success("Categoria removida.");
    },
    onError: error => toast.error(error.message),
  });
  const updateCategory = trpc.delivery.catalog.categoryUpdate.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      toast.success("Categoria atualizada.");
    },
  });
  const createProduct = trpc.delivery.catalog.productCreate.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      setProductDraft(initialProduct);
      setProductFormOpen(false);
      toast.success("Produto cadastrado.");
    },
  });
  const updateProduct = trpc.delivery.catalog.productUpdate.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      setProductDraft(initialProduct);
      setEditingProductId(null);
      toast.success("Produto atualizado.");
    },
  });
  const availability = trpc.delivery.catalog.productAvailability.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
    },
  });
  const deleteProduct = trpc.delivery.catalog.productDelete.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      toast.success("Produto removido.");
    },
  });
  const updateStore = trpc.delivery.catalog.storeUpdate.useMutation({
    onSuccess: () => {
      utils.delivery.catalog.adminData.invalidate();
      utils.delivery.catalog.home.invalidate();
      toast.success("Configurações salvas.");
    },
  });
  const setStoreOpen = trpc.delivery.catalog.storeSetOpen.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.delivery.catalog.adminData.invalidate(),
        utils.delivery.catalog.home.invalidate(),
      ]);
      toast.success("Funcionamento da loja atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const pauseStore = trpc.delivery.catalog.storePauseForHour.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.delivery.catalog.adminData.invalidate(),
        utils.delivery.catalog.home.invalidate(),
      ]);
      toast.success(
        variables.paused
          ? "Pausa de uma hora iniciada. A loja reabre automaticamente."
          : "Pausa encerrada."
      );
    },
    onError: error => toast.error(error.message),
  });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const detail = trpc.delivery.orders.adminDetail.useQuery(
    { id: selectedOrderId || 0 },
    { enabled: selectedOrderId !== null }
  );
  const [internalNote, setInternalNote] = useState("");
  const [whatsappDraftUrl, setWhatsappDraftUrl] = useState("");
  const [orderEditDraft, setOrderEditDraft] = useState<EditableOrder>({
    customerName: "",
    phone: "",
    postalCode: "",
    street: "",
    streetNumber: "",
    complement: "",
    neighborhood: "",
    city: "",
    reference: "",
    customerNote: "",
    items: [],
  });
  const [categoryName, setCategoryName] = useState("");
  const [productDraft, setProductDraft] =
    useState<ProductDraft>(initialProduct);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    name: "",
    tagline: "",
    phone: "",
    address: "",
    logoUrl: "",
    bannerUrl: "",
    brandColor: "#C84B2F",
    timeZone: "America/Sao_Paulo",
    businessHours: "",
    paymentMethods: ["pix", "cash", "card_delivery", "card_pickup"] as (
      | "pix"
      | "cash"
      | "card_delivery"
      | "card_pickup"
    )[],
    averageDeliveryMinutes: "35",
    deliveryFee: "0",
    minimumOrder: "0",
    isOpen: false,
    closedMessage: "",
  });
  const [employeeDraft, setEmployeeDraft] = useState({ name: "", email: "" });
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const data = catalog.data;
  const storePaused = Boolean(
    data?.store?.pauseUntil &&
      new Date(data.store.pauseUntil).getTime() > Date.now()
  );
  const orders = orderQuery.data ?? [];
  const isMenu = isOwner && location === "/admin/cardapio";
  const isFinance = isOwner && location === "/admin/financeiro";
  const isStore = isOwner && location === "/admin/loja";
  const sectionTitle = isFinance
    ? "Financeiro"
    : isMenu
      ? "Seu cardápio"
      : isStore
        ? "Sua loja"
        : isTeam
          ? "Sua equipe"
          : "Central de pedidos";
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        stages.map(stage => [
          stage.key,
          orders.filter(row => row.order.status === stage.key),
        ])
      ) as Record<Status, typeof orders>,
    [orders]
  );

  useEffect(() => {
    if (
      !isOwner &&
      [
        "/admin/cardapio",
        "/admin/loja",
        "/admin/equipe",
        "/admin/financeiro",
      ].includes(location)
    )
      setLocation("/admin");
  }, [isOwner, location, setLocation]);

  useEffect(() => {
    if (!selectedOrderId || !detail.data) return;
    setOrderEditDraft({
      customerName: detail.data.customer.name,
      phone: detail.data.customer.phone,
      postalCode: detail.data.order.postalCode || "",
      street: detail.data.order.street || "",
      streetNumber: detail.data.order.streetNumber || "",
      complement: detail.data.order.complement || "",
      neighborhood: detail.data.order.neighborhood || "",
      city: detail.data.order.city || "",
      reference: detail.data.order.reference || "",
      customerNote: detail.data.order.customerNote || "",
      items: detail.data.items.map(item => ({
        id: item.id,
        quantity: item.quantity,
        note: item.note || "",
      })),
    });
    setWhatsappDraftUrl("");
  }, [selectedOrderId, detail.data?.order.updatedAt]);
  useEffect(() => {
    const store = data?.store;
    if (!store || settingsHydrated) return;
    setSettingsDraft({
      name: store.name,
      tagline: store.tagline,
      phone: store.phone,
      address: store.address,
      logoUrl: store.logoUrl || "",
      bannerUrl: store.bannerUrl || "",
      brandColor: store.brandColor,
      timeZone: store.timeZone,
      businessHours: store.businessHours || "",
      paymentMethods: catalog.data?.paymentMethods ?? [
        "pix",
        "cash",
        "card_delivery",
        "card_pickup",
      ],
      averageDeliveryMinutes: String(store.averageDeliveryMinutes),
      deliveryFee: (store.deliveryFeeCents / 100).toFixed(2),
      minimumOrder: (store.minimumOrderCents / 100).toFixed(2),
      isOpen: store.isOpen,
      closedMessage: store.closedMessage,
    });
    setSettingsHydrated(true);
  }, [data?.store, settingsHydrated]);

  function advanceOrder(id: number, status: Status) {
    statusMutation.mutate({ id, status });
  }
  function saveOrderEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrderId) return;
    if (
      !window.confirm(
        "Confirma a alteração dos dados/itens? Após salvar, abriremos o WhatsApp com uma mensagem informando a atualização. Você ainda precisará conferir e tocar em Enviar."
      )
    )
      return;
    const whatsappWindow = window.open("about:blank", "_blank");
    editOrderMutation.mutate(
      { id: selectedOrderId, ...orderEditDraft },
      {
        onSuccess: result => {
          if (whatsappWindow) whatsappWindow.location.href = result.whatsappUrl;
          else setWhatsappDraftUrl(result.whatsappUrl);
        },
        onError: () => whatsappWindow?.close(),
      }
    );
  }
  function downloadSalesCsv() {
    if (!sales.data) return;
    const rows = [
      ["Data", "Pedidos entregues", "Vendas brutas (centavos)"],
      ...sales.data.series.map(day => [
        day.date,
        String(day.orders),
        String(day.revenueCents),
      ]),
    ];
    const csv = rows
      .map(row =>
        row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vendas-${salesDays}-dias.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function editProduct(product: NonNullable<typeof data>["products"][number]) {
    const productOptions =
      data?.options.filter(option => option.productId === product.id) ?? [];
    setProductDraft({
      categoryId: String(product.categoryId),
      name: product.name,
      description: product.description || "",
      price: (product.priceCents / 100).toFixed(2),
      imageUrl: product.imageUrl || "",
      isPromotion: product.isPromotion,
      promotionPrice:
        product.promotionPriceCents == null
          ? ""
          : (product.promotionPriceCents / 100).toFixed(2),
      isAvailable: product.isAvailable,
      isFeatured: product.isFeatured,
      options: productOptions
        .map(option => `${option.name}|${(option.priceCents / 100).toFixed(2)}`)
        .join("\n"),
    });
    setEditingProductId(product.id);
    setProductFormOpen(true);
  }
  function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedOptions = productDraft.options
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [name, price = "0"] = line.split("|");
        return {
          name: name.trim(),
          priceCents: Math.round(Number(price.replace(",", ".")) * 100),
          isAvailable: true,
        };
      });
    const payload = {
      categoryId: Number(productDraft.categoryId),
      name: productDraft.name,
      description: productDraft.description,
      imageUrl: productDraft.imageUrl,
      priceCents: Math.round(
        Number(productDraft.price.replace(",", ".")) * 100
      ),
      isPromotion: productDraft.isPromotion,
      promotionPriceCents: productDraft.isPromotion
        ? Math.round(
            Number(productDraft.promotionPrice.replace(",", ".")) * 100
          )
        : null,
      isAvailable: productDraft.isAvailable,
      isFeatured: productDraft.isFeatured,
      sortOrder: editingProductId
        ? (data?.products.find(item => item.id === editingProductId)
            ?.sortOrder ?? 0)
        : (data?.products.length ?? 0),
      options: parsedOptions,
    };
    if (
      !Number.isFinite(payload.priceCents) ||
      payload.priceCents < 1 ||
      (payload.isPromotion &&
        (payload.promotionPriceCents == null ||
          payload.promotionPriceCents < 1 ||
          payload.promotionPriceCents >= payload.priceCents)) ||
      !payload.categoryId
    ) {
      toast.error("Confira preço normal, preço promocional e categoria.");
      return;
    }
    if (editingProductId)
      updateProduct.mutate({ ...payload, id: editingProductId });
    else createProduct.mutate(payload);
  }
  function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateStore.mutate({
      phone: settingsDraft.phone,
      address: settingsDraft.address,
      timeZone: settingsDraft.timeZone,
      businessHours: settingsDraft.businessHours,
      paymentMethods: settingsDraft.paymentMethods,
      averageDeliveryMinutes: Number(settingsDraft.averageDeliveryMinutes),
      deliveryFeeCents: Math.round(
        Number(settingsDraft.deliveryFee.replace(",", ".")) * 100
      ),
      minimumOrderCents: Math.round(
        Number(settingsDraft.minimumOrder.replace(",", ".")) * 100
      ),
      closedMessage: settingsDraft.closedMessage,
    });
  }

  return (
    <div className="admin-shell">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">PAINEL PRIVADO DA LOJA</span>
          <h1>{sectionTitle}</h1>
        </div>
        <div className="admin-toolbar">
          {isOwner && data?.store && (
            <div className="admin-store-quick-control">
              <span
                className={`store-live-indicator ${data.store.isOpen ? "is-open" : ""}`}
              />
              <b>
                {storePaused
                  ? "Em pausa"
                  : data.store.isOpen
                    ? "Aberta"
                    : "Fechada"}
              </b>
              <button
                type="button"
                className={
                  data.store.isOpen ? "outline-button" : "primary-button"
                }
                disabled={setStoreOpen.isPending}
                onClick={() =>
                  setStoreOpen.mutate({ isOpen: !data.store!.isOpen })
                }
              >
                {data.store.isOpen ? "Fechar" : "Abrir loja"}
              </button>
              {storePaused ? (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => pauseStore.mutate({ paused: false })}
                >
                  Retomar
                </button>
              ) : (
                <button
                  type="button"
                  className="outline-button"
                  disabled={!data.store.isOpen || pauseStore.isPending}
                  onClick={() => pauseStore.mutate({ paused: true })}
                >
                  <Pause size={14} /> Pausa 1h
                </button>
              )}
            </div>
          )}
          <div className="admin-live">
            <i /> Atualiza automaticamente{" "}
            <Link href="/" target="_blank">
              Ver loja <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
      {isFinance ? (
        <section className="admin-content finance-page">
          <div className="admin-section-heading">
            <div>
              <span className="eyebrow">VISÃO DO PROPRIETÁRIO</span>
              <h2>Vendas brutas concluídas</h2>
              <p>
                Considera pedidos marcados como entregues no fuso horário
                configurado para a loja. Não é cálculo de lucro.
              </p>
            </div>
            <div className="finance-actions">
              <label>
                Período{" "}
                <select
                  value={salesDays}
                  onChange={event =>
                    setSalesDays(Number(event.target.value) as 7 | 30 | 90)
                  }
                >
                  <option value={7}>7 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={downloadSalesCsv}
                disabled={!sales.data}
              >
                <ArrowDownToLine size={16} /> Baixar CSV
              </button>
            </div>
          </div>
          <div className="finance-summary">
            <article>
              <small>Vendas brutas</small>
              <strong>{formatBRL(sales.data?.revenueCents ?? 0)}</strong>
            </article>
            <article>
              <small>Pedidos entregues</small>
              <strong>{sales.data?.orderCount ?? 0}</strong>
            </article>
            <article>
              <small>Ticket médio</small>
              <strong>{formatBRL(sales.data?.averageTicketCents ?? 0)}</strong>
            </article>
          </div>
          {sales.isLoading ? (
            <div className="admin-loading">
              <LoaderCircle className="spin" />
            </div>
          ) : sales.data?.series.length ? (
            <div className="finance-list">
              {sales.data.series.map(day => (
                <div className="finance-day" key={day.date}>
                  <time>
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                      {
                        timeZone: sales.data.timeZone,
                        day: "2-digit",
                        month: "short",
                      }
                    )}
                  </time>
                  <div className="finance-bar">
                    <i
                      style={{
                        width: `${Math.max(3, (day.revenueCents / Math.max(...sales.data!.series.map(entry => entry.revenueCents))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span>
                    {day.orders} {day.orders === 1 ? "pedido" : "pedidos"}
                  </span>
                  <strong>{formatBRL(day.revenueCents)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty">
              <span>—</span>
              <h3>Sem pedidos entregues neste período</h3>
              <p>
                Os dados aparecem aqui assim que a equipe conclui os primeiros
                pedidos.
              </p>
            </div>
          )}
          <p className="finance-disclaimer">
            Os valores representam vendas brutas registradas. Configure
            conciliação, taxas, impostos e custos com suas ferramentas
            contábeis; este painel não substitui controle de lucro ou
            escrituração.
          </p>
        </section>
      ) : isMenu ? (
        <section className="admin-content">
          <div className="admin-section-heading">
            <div>
              <span className="eyebrow">CATÁLOGO</span>
              <h2>Produtos e categorias</h2>
              <p>Atualize o que aparece no cardápio em tempo real.</p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setProductDraft(initialProduct);
                setEditingProductId(null);
                setProductFormOpen(true);
              }}
            >
              <Plus size={16} /> Novo produto
            </button>
          </div>
          <div className="category-manager">
            <div className="admin-card-heading">
              <div>
                <span className="eyebrow">ORGANIZAÇÃO</span>
                <h3>Categorias</h3>
              </div>
            </div>
            <form
              className="category-create"
              onSubmit={event => {
                event.preventDefault();
                createCategory.mutate({ name: categoryName });
              }}
            >
              <input
                value={categoryName}
                onChange={event => setCategoryName(event.target.value)}
                placeholder="Nome da categoria"
                minLength={2}
                required
              />
              <button
                className="outline-button"
                disabled={createCategory.isPending}
              >
                <Plus size={15} /> Criar
              </button>
            </form>
            <div className="category-list">
              {data?.categories.map(category => (
                <div className="category-admin-row" key={category.id}>
                  <span className="category-dot">
                    {category.isActive ? "●" : "○"}
                  </span>
                  <input
                    defaultValue={category.name}
                    aria-label={`Nome de ${category.name}`}
                    onBlur={event => {
                      if (event.target.value.trim() !== category.name)
                        updateCategory.mutate({
                          id: category.id,
                          name: event.target.value.trim(),
                          sortOrder: category.sortOrder,
                        });
                    }}
                  />
                  <span className="category-status">
                    {category.isActive ? "Visível" : "Oculta"}
                  </span>
                  <button
                    className="icon-button"
                    title="Subir categoria"
                    disabled={category.sortOrder === 0}
                    onClick={() =>
                      updateCategory.mutate({
                        id: category.id,
                        name: category.name,
                        sortOrder: Math.max(0, category.sortOrder - 1),
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    title={
                      category.isActive
                        ? "Ocultar categoria do cliente"
                        : "Mostrar categoria para o cliente"
                    }
                    onClick={() =>
                      toggleCategory.mutate({
                        id: category.id,
                        isActive: !category.isActive,
                      })
                    }
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    title="Excluir categoria"
                    onClick={() => {
                      if (
                        window.confirm(`Excluir a categoria ${category.name}?`)
                      )
                        deleteCategory.mutate({ id: category.id });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="product-admin-list">
            <div className="admin-card-heading">
              <div>
                <span className="eyebrow">NO CARDÁPIO</span>
                <h3>{data?.products.length ?? 0} produtos</h3>
              </div>
              <span className="subtle-tag">Preço em R$</span>
            </div>
            {catalog.isLoading && (
              <div className="admin-loading">
                <LoaderCircle className="spin" />
              </div>
            )}
            {data?.products.map(product => {
              const category = data.categories.find(
                item => item.id === product.categoryId
              );
              return (
                <div
                  className={`product-admin-row ${!product.isAvailable ? "unavailable" : ""}`}
                  key={product.id}
                >
                  <div className="product-admin-thumb">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" />
                    ) : (
                      <span>🍽️</span>
                    )}
                  </div>
                  <div className="product-admin-info">
                    <b>{product.name}</b>
                    <small>
                      {category?.name} ·{" "}
                      {product.isPromotion ? "Promoção do dia" : "Preço normal"}{" "}
                      · {product.isFeatured ? "Favorito" : "Padrão"}
                    </small>
                    <span>{product.description}</span>
                    <span className="inventory-status">
                      {product.isAvailable
                        ? "Disponível para pedido"
                        : "Sem estoque · oculto do cardápio"}
                    </span>
                  </div>
                  <strong
                    className={product.isPromotion ? "product-promo-price" : ""}
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
                  <button
                    className="icon-button"
                    onClick={() => editProduct(product)}
                    title="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() =>
                      availability.mutate({
                        id: product.id,
                        isAvailable: !product.isAvailable,
                      })
                    }
                    title={
                      product.isAvailable
                        ? "Marcar indisponível (sem estoque)"
                        : "Voltar a disponibilizar"
                    }
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    onClick={() => {
                      if (window.confirm(`Excluir ${product.name}?`))
                        deleteProduct.mutate({ id: product.id });
                    }}
                    title="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          {productFormOpen && (
            <div
              className="overlay modal-overlay"
              onClick={() => setProductFormOpen(false)}
            >
              <section
                className="admin-modal"
                onClick={event => event.stopPropagation()}
              >
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">
                      {editingProductId ? "EDIÇÃO" : "NOVO NO CARDÁPIO"}
                    </span>
                    <h2>
                      {editingProductId
                        ? "Editar produto"
                        : "Adicionar produto"}
                    </h2>
                  </div>
                  <button
                    className="icon-close"
                    onClick={() => setProductFormOpen(false)}
                  >
                    <X />
                  </button>
                </div>
                <form onSubmit={saveProduct} className="admin-form">
                  <label>
                    Nome do produto
                    <input
                      required
                      minLength={2}
                      value={productDraft.name}
                      onChange={event =>
                        setProductDraft({
                          ...productDraft,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      Categoria
                      <select
                        required
                        value={productDraft.categoryId}
                        onChange={event =>
                          setProductDraft({
                            ...productDraft,
                            categoryId: event.target.value,
                          })
                        }
                      >
                        <option value="">Escolha…</option>
                        {data?.categories.map(category => (
                          <option value={category.id} key={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Preço (R$)
                      <input
                        required
                        inputMode="decimal"
                        value={productDraft.price}
                        onChange={event =>
                          setProductDraft({
                            ...productDraft,
                            price: event.target.value,
                          })
                        }
                        placeholder="29,90"
                      />
                    </label>
                  </div>
                  <div className="promotion-editor">
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={productDraft.isPromotion}
                        onChange={event =>
                          setProductDraft({
                            ...productDraft,
                            isPromotion: event.target.checked,
                            promotionPrice: event.target.checked
                              ? productDraft.promotionPrice
                              : "",
                          })
                        }
                      />
                      Promoção do dia
                    </label>
                    {productDraft.isPromotion && (
                      <label>
                        Preço promocional (R$)
                        <input
                          required
                          inputMode="decimal"
                          value={productDraft.promotionPrice}
                          onChange={event =>
                            setProductDraft({
                              ...productDraft,
                              promotionPrice: event.target.value,
                            })
                          }
                          placeholder="Ex.: 24,90"
                        />
                        <small>Precisa ser menor que o preço normal.</small>
                      </label>
                    )}
                  </div>
                  <label>
                    Descrição
                    <textarea
                      value={productDraft.description}
                      onChange={event =>
                        setProductDraft({
                          ...productDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Escolher imagem criada para a demonstração
                    <select
                      value={
                        productDraft.imageUrl.startsWith("/assets/food/")
                          ? productDraft.imageUrl
                          : "__url__"
                      }
                      onChange={event =>
                        setProductDraft({
                          ...productDraft,
                          imageUrl:
                            event.target.value === "__url__"
                              ? ""
                              : event.target.value,
                        })
                      }
                    >
                      <option value="__url__">Usar URL externa abaixo</option>
                      <option value="">Sem imagem</option>
                      <option value="/assets/food/burger.jpg">
                        Hambúrguer artesanal
                      </option>
                      <option value="/assets/food/combo-1.jpg">Combo 1</option>
                      <option value="/assets/food/combo-2.jpg">Combo 2</option>
                      <option value="/assets/food/combo-3.jpg">Combo 3</option>
                      <option value="/assets/food/acai-bowl.jpg">Açaí</option>
                      <option value="/assets/food/natural-juice.jpg">
                        Suco natural
                      </option>
                      <option value="/assets/food/marmitex.jpg">
                        Marmitex
                      </option>
                      <option value="/assets/food/hero.jpg">
                        Banner de destaque
                      </option>
                    </select>
                  </label>
                  <label>
                    URL de outra imagem (opcional; apenas HTTPS)
                    <input
                      type="url"
                      value={
                        productDraft.imageUrl.startsWith("/assets/food/")
                          ? ""
                          : productDraft.imageUrl
                      }
                      onChange={event =>
                        setProductDraft({
                          ...productDraft,
                          imageUrl: event.target.value,
                        })
                      }
                      placeholder="https://…"
                    />
                    <small>
                      O upload para armazenamento externo não foi ativado;
                      escolha uma foto já incluída no projeto ou cole uma URL
                      HTTPS.
                    </small>
                  </label>
                  {productDraft.imageUrl && (
                    <img
                      className="product-image-preview"
                      src={productDraft.imageUrl}
                      alt="Prévia do produto"
                    />
                  )}
                  <label>
                    Adicionais{" "}
                    <small>um por linha: nome|preço (ex.: Bacon|5,00)</small>
                    <textarea
                      rows={3}
                      value={productDraft.options}
                      onChange={event =>
                        setProductDraft({
                          ...productDraft,
                          options: event.target.value,
                        })
                      }
                      placeholder={"Queijo extra|3,00\nBacon|5,00"}
                    />
                  </label>
                  <div className="product-flags">
                    <label>
                      <input
                        type="checkbox"
                        checked={productDraft.isAvailable}
                        onChange={event =>
                          setProductDraft({
                            ...productDraft,
                            isAvailable: event.target.checked,
                          })
                        }
                      />{" "}
                      Disponível
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={productDraft.isFeatured}
                        onChange={event =>
                          setProductDraft({
                            ...productDraft,
                            isFeatured: event.target.checked,
                          })
                        }
                      />{" "}
                      Destaque da casa
                    </label>
                  </div>
                  <button
                    className="primary-button"
                    disabled={
                      createProduct.isPending || updateProduct.isPending
                    }
                  >
                    {editingProductId ? "Salvar alterações" : "Criar produto"}{" "}
                    <Check size={16} />
                  </button>
                </form>
              </section>
            </div>
          )}
        </section>
      ) : isStore ? (
        <section className="admin-content store-settings-layout">
          <div className="settings-intro">
            <span className="settings-illustration">
              <Store size={25} />
            </span>
            <span className="eyebrow">OPERAÇÃO DA LOJA</span>
            <h2>Controle o funcionamento da casa.</h2>
            <p>
              A marca, o nome, o logotipo, o banner e as cores são definidos na
              implantação. Aqui ficam apenas as condições operacionais.
            </p>
            <div className="settings-note">
              <Clock3 size={17} /> Tempo e taxa são exibidos antes do cliente
              confirmar o pedido.
            </div>
          </div>
          <form className="settings-card" onSubmit={saveSettings}>
            <div className="settings-card-head">
              <div>
                <span className="eyebrow">DADOS DA LOJA</span>
                <h3>Informações gerais</h3>
              </div>
            </div>
            <div className="store-operations">
              <div>
                <span
                  className={`store-live-indicator ${data?.store?.isOpen ? "is-open" : ""}`}
                />
                <div>
                  <b>{data?.store?.isOpen ? "Loja aberta" : "Loja fechada"}</b>
                  <small>
                    {data?.store?.isOpen
                      ? "Aceitando novos pedidos"
                      : data?.store?.closedMessage ||
                        "Não está recebendo pedidos"}
                  </small>
                </div>
              </div>
              <div className="store-operation-actions">
                <button
                  type="button"
                  className={
                    data?.store?.isOpen ? "outline-button" : "primary-button"
                  }
                  disabled={setStoreOpen.isPending || !data?.store}
                  onClick={() =>
                    setStoreOpen.mutate({ isOpen: !data?.store?.isOpen })
                  }
                >
                  {data?.store?.isOpen ? (
                    <>
                      <X size={15} /> Fechar agora
                    </>
                  ) : (
                    <>
                      <Play size={15} /> Abrir loja
                    </>
                  )}
                </button>
                {data?.store?.pauseUntil &&
                new Date(data.store.pauseUntil).getTime() > Date.now() ? (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={pauseStore.isPending}
                    onClick={() => pauseStore.mutate({ paused: false })}
                  >
                    <Play size={15} /> Encerrar pausa
                  </button>
                ) : (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={pauseStore.isPending || !data?.store?.isOpen}
                    onClick={() => pauseStore.mutate({ paused: true })}
                    title={
                      !data?.store?.isOpen
                        ? "Abra a loja para iniciar a pausa"
                        : undefined
                    }
                  >
                    <Pause size={15} /> Pausa de 1 hora
                  </button>
                )}
              </div>
              {data?.store?.pauseUntil &&
                new Date(data.store.pauseUntil).getTime() > Date.now() && (
                  <small className="store-pause-expiry">
                    Pedidos pausados até{" "}
                    {new Date(data.store.pauseUntil).toLocaleTimeString(
                      "pt-BR",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: data.store.timeZone || "America/Sao_Paulo",
                      }
                    )}
                    . A reabertura é automática.
                  </small>
                )}
              <small>
                Marca, nome, logotipo, banner e cores são definidos na
                implantação desta loja e não podem ser alterados por este
                perfil.
              </small>
            </div>
            <div className="field-grid">
              <label>
                Fuso horário IANA
                <input
                  required
                  value={settingsDraft.timeZone}
                  onChange={event =>
                    setSettingsDraft({
                      ...settingsDraft,
                      timeZone: event.target.value,
                    })
                  }
                  placeholder="America/Sao_Paulo"
                />
              </label>
            </div>
            <label>
              Horários de atendimento
              <textarea
                value={settingsDraft.businessHours}
                maxLength={500}
                onChange={event =>
                  setSettingsDraft({
                    ...settingsDraft,
                    businessHours: event.target.value,
                  })
                }
                placeholder="Seg–Sáb · 18h às 23h"
              />
            </label>
            <fieldset className="payment-method-settings">
              <legend>Formas de pagamento aceitas</legend>
              {(
                [
                  { id: "pix", label: "Pix" },
                  { id: "cash", label: "Dinheiro" },
                  { id: "card_delivery", label: "Cartão na entrega" },
                  { id: "card_pickup", label: "Cartão na retirada" },
                ] as const
              ).map(method => (
                <label key={method.id}>
                  <input
                    type="checkbox"
                    checked={settingsDraft.paymentMethods.includes(method.id)}
                    onChange={event =>
                      setSettingsDraft({
                        ...settingsDraft,
                        paymentMethods: event.target.checked
                          ? [...settingsDraft.paymentMethods, method.id]
                          : settingsDraft.paymentMethods.filter(
                              value => value !== method.id
                            ),
                      })
                    }
                  />
                  {method.label}
                </label>
              ))}
            </fieldset>
            <label>
              Telefone / WhatsApp
              <input
                required
                value={settingsDraft.phone}
                onChange={event =>
                  setSettingsDraft({
                    ...settingsDraft,
                    phone: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Endereço da loja
              <input
                value={settingsDraft.address}
                onChange={event =>
                  setSettingsDraft({
                    ...settingsDraft,
                    address: event.target.value,
                  })
                }
              />
            </label>
            <div className="field-grid">
              <label>
                Previsão média (min)
                <input
                  type="number"
                  min="5"
                  max="240"
                  value={settingsDraft.averageDeliveryMinutes}
                  onChange={event =>
                    setSettingsDraft({
                      ...settingsDraft,
                      averageDeliveryMinutes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Taxa de entrega (R$)
                <input
                  inputMode="decimal"
                  value={settingsDraft.deliveryFee}
                  onChange={event =>
                    setSettingsDraft({
                      ...settingsDraft,
                      deliveryFee: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Pedido mínimo (R$)
                <input
                  inputMode="decimal"
                  value={settingsDraft.minimumOrder}
                  onChange={event =>
                    setSettingsDraft({
                      ...settingsDraft,
                      minimumOrder: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Mensagem quando fechada
                <input
                  value={settingsDraft.closedMessage}
                  onChange={event =>
                    setSettingsDraft({
                      ...settingsDraft,
                      closedMessage: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="settings-card-foot">
              <span>
                As alterações são aplicadas ao cardápio imediatamente.
              </span>
              <button
                className="primary-button"
                disabled={updateStore.isPending}
              >
                {updateStore.isPending ? "Salvando…" : "Salvar configurações"}{" "}
                <Check size={16} />
              </button>
            </div>
          </form>
        </section>
      ) : isTeam ? (
        <section className="admin-content team-access-section">
          <div className="admin-section-heading">
            <div>
              <span className="eyebrow">PERMISSÕES</span>
              <h2>Dono e funcionários</h2>
              <p>
                O proprietário controla catálogo, configurações, financeiro e
                acessos. Funcionários acessam apenas a operação de pedidos.
              </p>
            </div>
          </div>
          <div className="team-invite-card">
            <div>
              <span className="eyebrow">NOVO FUNCIONÁRIO</span>
              <p>
                Crie uma conta individual. A senha temporária aparece uma única
                vez e deve ser entregue diretamente ao funcionário.
              </p>
              <form
                className="team-create-form"
                onSubmit={event => {
                  event.preventDefault();
                  createStaff.mutate(employeeDraft);
                }}
              >
                <input
                  required
                  minLength={2}
                  maxLength={140}
                  placeholder="Nome completo"
                  value={employeeDraft.name}
                  onChange={event =>
                    setEmployeeDraft({
                      ...employeeDraft,
                      name: event.target.value,
                    })
                  }
                />
                <input
                  required
                  type="email"
                  maxLength={320}
                  placeholder="E-mail de acesso"
                  value={employeeDraft.email}
                  onChange={event =>
                    setEmployeeDraft({
                      ...employeeDraft,
                      email: event.target.value,
                    })
                  }
                />
                <button
                  className="primary-button"
                  disabled={createStaff.isPending}
                >
                  <Plus size={15} /> Criar acesso
                </button>
              </form>
            </div>
          </div>
          {temporaryPassword && (
            <div className="temporary-password-card">
              <div>
                <b>Senha temporária — copie agora</b>
                <code>{temporaryPassword}</code>
                <small>
                  Ela não será exibida novamente. No primeiro acesso, o
                  funcionário deverá criar uma senha pessoal de pelo menos 12
                  caracteres.
                </small>
              </div>
              <button
                className="outline-button"
                onClick={() => {
                  void navigator.clipboard.writeText(temporaryPassword);
                  toast.success("Senha copiada.");
                }}
              >
                Copiar senha
              </button>
              <button
                className="icon-button"
                aria-label="Ocultar senha"
                onClick={() => setTemporaryPassword("")}
              >
                ×
              </button>
            </div>
          )}
          <div className="team-user-list">
            <div className="admin-card-heading">
              <div>
                <span className="eyebrow">CONTAS COM ACESSO</span>
                <h3>Funcionários e contas pendentes</h3>
              </div>
            </div>
            {teamQuery.isLoading && (
              <div className="admin-loading">
                <LoaderCircle className="spin" /> Carregando contas…
              </div>
            )}
            {teamQuery.data?.length
              ? teamQuery.data.map(member => (
                  <article className="team-user-row" key={member.id}>
                    <div className="team-user-avatar">
                      {(member.name || member.email || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <div className="team-user-info">
                      <b>
                        {member.name || "Conta sem nome"}{" "}
                        {!member.isActive && "· acesso desativado"}
                      </b>
                      <small>{member.email || "E-mail não informado"}</small>
                      <small>
                        Último acesso:{" "}
                        {new Date(member.lastSignedIn).toLocaleDateString(
                          "pt-BR"
                        )}
                      </small>
                    </div>
                    <div className="team-role-control">
                      <span>
                        {member.isActive ? "Acesso ativo" : "Acesso desativado"}
                      </span>
                      <button
                        className="outline-button"
                        onClick={() =>
                          setStaffActive.mutate({
                            id: member.id,
                            isActive: !member.isActive,
                          })
                        }
                      >
                        {member.isActive ? "Desativar" : "Reativar"}
                      </button>
                      <button
                        className="outline-button"
                        disabled={
                          !member.isActive || resetStaffPassword.isPending
                        }
                        onClick={() =>
                          resetStaffPassword.mutate({ id: member.id })
                        }
                      >
                        Nova senha
                      </button>
                    </div>
                  </article>
                ))
              : !teamQuery.isLoading && (
                  <p className="team-empty">
                    Nenhum funcionário cadastrado. Crie a primeira conta acima.
                  </p>
                )}
          </div>
        </section>
      ) : (
        <section className="admin-content">
          {isOwner && (
            <div className="stats-grid">
              <article className="stat-card">
                <span className="stat-icon amber">
                  <ShoppingBag size={19} />
                </span>
                <span>Novos pedidos</span>
                <strong>{stats.data?.counts.received ?? 0}</strong>
                <small>aguardando confirmação</small>
              </article>
              <article className="stat-card">
                <span className="stat-icon orange">
                  <ChefHat size={19} />
                </span>
                <span>Em preparo</span>
                <strong>
                  {(stats.data?.counts.preparing ?? 0) +
                    (stats.data?.counts.confirmed ?? 0)}
                </strong>
                <small>na cozinha</small>
              </article>
              <article className="stat-card">
                <span className="stat-icon green">
                  <PackageCheck size={19} />
                </span>
                <span>Prontos</span>
                <strong>{stats.data?.counts.ready ?? 0}</strong>
                <small>para saída ou retirada</small>
              </article>
              <article className="stat-card revenue-card">
                <span className="stat-icon violet">
                  <CircleDollarSign size={19} />
                </span>
                <span>Vendas entregues hoje</span>
                <strong>{formatBRL(stats.data?.revenueTodayCents ?? 0)}</strong>
                <small>pedidos finalizados</small>
              </article>
            </div>
          )}
          <div className="orders-toolbar">
            <div>
              <span className="eyebrow">ACOMPANHAMENTO AO VIVO</span>
              <h2>Pedidos da loja</h2>
            </div>
            <div className="toolbar-actions">
              <span className="refresh-tag">
                <i /> Atualiza a cada 6s
              </span>
              <button
                className="outline-button"
                onClick={() => {
                  orderQuery.refetch();
                  stats.refetch();
                }}
              >
                <Clock3 size={15} /> Atualizar
              </button>
            </div>
          </div>
          <div className="kanban-board">
            {stages.map(stage => (
              <section className="kanban-column" key={stage.key}>
                <div className={`kanban-title ${stage.color}`}>
                  <span>{stage.title}</span>
                  <b>{grouped[stage.key]?.length ?? 0}</b>
                </div>
                <div className="kanban-stack">
                  {(grouped[stage.key] ?? []).map(({ order, customer }) => (
                    <article className="order-card" key={order.id}>
                      <div className="order-card-head">
                        <b>#{order.orderNumber}</b>
                        <small>
                          {new Date(order.createdAt).toLocaleTimeString(
                            "pt-BR",
                            { hour: "2-digit", minute: "2-digit" }
                          )}
                        </small>
                      </div>
                      <h3>{customer.name}</h3>
                      <p>
                        {order.deliveryType === "pickup"
                          ? "Retirada"
                          : "Entrega"}{" "}
                        · {paymentNames[order.paymentMethod]}
                      </p>
                      <div className="order-card-total">
                        <strong>{formatBRL(order.totalCents)}</strong>
                        <span>
                          {order.streetNumber ? `Nº ${order.streetNumber}` : ""}
                        </span>
                      </div>
                      <div className="order-card-actions">
                        <button
                          className="order-open"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <Eye size={14} /> Abrir
                        </button>
                        {stage.next && (
                          <button
                            className="advance-order"
                            onClick={() =>
                              advanceOrder(
                                order.id,
                                stage.key === "ready" &&
                                  order.deliveryType === "pickup"
                                  ? "delivered"
                                  : stage.next!
                              )
                            }
                            title={`Avançar: ${statusNames[stage.key === "ready" && order.deliveryType === "pickup" ? "delivered" : stage.next]}`}
                          >
                            <span>
                              {stage.key === "ready" &&
                              order.deliveryType === "pickup"
                                ? "Entregue"
                                : stage.next === "confirmed"
                                  ? "Confirmar"
                                  : stage.next === "preparing"
                                    ? "Preparar"
                                    : stage.next === "ready"
                                      ? "Marcar pronto"
                                      : stage.next === "out_for_delivery"
                                        ? "Saiu"
                                        : "Entregue"}
                            </span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {!grouped[stage.key]?.length && (
                  <div className="kanban-empty">Sem pedidos</div>
                )}
              </section>
            ))}
          </div>
        </section>
      )}
      {selectedOrderId !== null && (
        <div
          className="overlay modal-overlay"
          onClick={() => setSelectedOrderId(null)}
        >
          <section
            className="order-detail-modal"
            onClick={event => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DETALHES DO PEDIDO</span>
                <h2>#{detail.data?.order.orderNumber || "…"}</h2>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="icon-close"
                  title="Imprimir nota de entrega (sem observações internas)"
                  disabled={!detail.data}
                  onClick={() =>
                    detail.data &&
                    printServiceTicket(
                      detail.data.order,
                      detail.data.customer,
                      detail.data.items,
                      detail.data.storeName
                    )
                  }
                >
                  <Printer />
                </button>
                <button
                  className="icon-close"
                  title="Imprimir comanda interna Epson (inclui observações internas)"
                  disabled={!detail.data}
                  onClick={() =>
                    detail.data &&
                    printInternalKitchenTicket(
                      detail.data.order,
                      detail.data.customer,
                      detail.data.items,
                      detail.data.internalNotes,
                      detail.data.storeName
                    )
                  }
                >
                  <ChefHat />
                </button>
                <button
                  className="icon-close"
                  onClick={() => setSelectedOrderId(null)}
                >
                  <X />
                </button>
              </div>
            </div>
            {detail.isLoading || !detail.data ? (
              <div className="admin-loading">
                <LoaderCircle className="spin" /> Carregando pedido…
              </div>
            ) : (
              <div className="order-detail-scroll">
                <div className="order-customer-block">
                  <b>{detail.data.customer.name}</b>
                  <span>{detail.data.customer.phone}</span>
                  <span>
                    {detail.data.order.deliveryType === "pickup"
                      ? "Retirada na loja"
                      : `${detail.data.order.street}, ${detail.data.order.streetNumber} · ${detail.data.order.neighborhood}, ${detail.data.order.city}`}
                  </span>
                  {detail.data.order.postalCode && (
                    <span>CEP: {detail.data.order.postalCode}</span>
                  )}
                  {detail.data.order.complement && (
                    <span>Complemento: {detail.data.order.complement}</span>
                  )}
                  {detail.data.order.reference && (
                    <span>Referência: {detail.data.order.reference}</span>
                  )}
                  <div className="customer-contact-actions">
                    <a
                      href={`https://wa.me/${detail.data.customer.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={15} /> Abrir WhatsApp
                    </a>
                    <a
                      href={`tel:+${detail.data.customer.phone.replace(/\D/g, "")}`}
                    >
                      <Phone size={15} /> Ligar
                    </a>
                  </div>
                </div>
                {isOwner && (
                  <form className="order-edit-form" onSubmit={saveOrderEdit}>
                    <div className="admin-card-heading">
                      <div>
                        <span className="eyebrow">EDIÇÃO OPERACIONAL</span>
                        <h3>Dados do pedido</h3>
                      </div>
                      <span className="subtle-tag">Somente proprietário</span>
                    </div>
                    <div className="order-edit-grid">
                      <label>
                        Nome
                        <input
                          required
                          maxLength={140}
                          value={orderEditDraft.customerName}
                          onChange={event =>
                            setOrderEditDraft({
                              ...orderEditDraft,
                              customerName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Telefone / WhatsApp
                        <input
                          required
                          maxLength={32}
                          value={orderEditDraft.phone}
                          onChange={event =>
                            setOrderEditDraft({
                              ...orderEditDraft,
                              phone: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    {detail.data.order.deliveryType === "delivery" && (
                      <div className="order-edit-grid">
                        <label>
                          CEP
                          <input
                            required
                            maxLength={9}
                            value={orderEditDraft.postalCode}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                postalCode: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Rua
                          <input
                            required
                            maxLength={180}
                            value={orderEditDraft.street}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                street: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Número
                          <input
                            required
                            maxLength={32}
                            value={orderEditDraft.streetNumber}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                streetNumber: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Complemento
                          <input
                            maxLength={140}
                            value={orderEditDraft.complement}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                complement: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Bairro
                          <input
                            required
                            maxLength={120}
                            value={orderEditDraft.neighborhood}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                neighborhood: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Cidade
                          <input
                            required
                            maxLength={120}
                            value={orderEditDraft.city}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                city: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Referência
                          <input
                            maxLength={200}
                            value={orderEditDraft.reference}
                            onChange={event =>
                              setOrderEditDraft({
                                ...orderEditDraft,
                                reference: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                    <label>
                      Observação do cliente
                      <textarea
                        maxLength={500}
                        value={orderEditDraft.customerNote}
                        onChange={event =>
                          setOrderEditDraft({
                            ...orderEditDraft,
                            customerNote: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="editable-lines">
                      <b>Itens e quantidades</b>
                      {orderEditDraft.items.map((item, index) => {
                        const original = detail.data!.items.find(
                          line => line.id === item.id
                        );
                        return (
                          <div className="editable-line" key={item.id}>
                            <span>{original?.productName || "Item"}</span>
                            <label>
                              Qtd.
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={item.quantity}
                                onChange={event =>
                                  setOrderEditDraft({
                                    ...orderEditDraft,
                                    items: orderEditDraft.items.map(
                                      (line, lineIndex) =>
                                        lineIndex === index
                                          ? {
                                              ...line,
                                              quantity: Number(
                                                event.target.value
                                              ),
                                            }
                                          : line
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Nota do item
                              <input
                                maxLength={500}
                                value={item.note}
                                onChange={event =>
                                  setOrderEditDraft({
                                    ...orderEditDraft,
                                    items: orderEditDraft.items.map(
                                      (line, lineIndex) =>
                                        lineIndex === index
                                          ? {
                                              ...line,
                                              note: event.target.value,
                                            }
                                          : line
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="primary-button"
                      disabled={
                        editOrderMutation.isPending ||
                        ["delivered", "cancelled", "rejected"].includes(
                          detail.data.order.status
                        )
                      }
                    >
                      {editOrderMutation.isPending
                        ? "Salvando…"
                        : "Salvar edição e recalcular total"}{" "}
                      <Check size={15} />
                    </button>
                    <small className="finance-disclaimer">
                      Os preços unitários e adicionais são os registrados no
                      pedido. Para evitar alterações indevidas, valores não
                      podem ser modificados por este formulário.
                    </small>
                  </form>
                )}
                {!isOwner && (
                  <p className="staff-readonly-note">
                    O perfil de atendente pode acompanhar o pedido, avançar o
                    status, falar com o cliente e registrar observações
                    internas. Somente o proprietário pode alterar dados ou
                    itens.
                  </p>
                )}
                <div className="detail-item-list">
                  {detail.data.items.map(item => (
                    <div className="detail-order-item" key={item.id}>
                      <div>
                        <b>
                          {item.quantity}× {item.productName}
                        </b>
                        {item.options.map(option => (
                          <small key={option.id}>
                            + {option.optionName} ·{" "}
                            {formatBRL(option.priceCents)}
                          </small>
                        ))}
                        {item.note && <small>Obs.: {item.note}</small>}
                      </div>
                      <strong>
                        {formatBRL(
                          item.unitPriceCents * item.quantity +
                            item.options.reduce(
                              (sum, option) => sum + option.priceCents,
                              0
                            ) *
                              item.quantity
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="detail-payment">
                  <span>{paymentNames[detail.data.order.paymentMethod]}</span>
                  <b>{formatBRL(detail.data.order.totalCents)}</b>
                </div>
                {detail.data.order.customerNote && (
                  <p className="customer-note">
                    <b>Observação do cliente</b>
                    {detail.data.order.customerNote}
                  </p>
                )}
                <label className="note-label">
                  Nova observação interna
                  <textarea
                    value={internalNote}
                    onChange={event => setInternalNote(event.target.value)}
                    placeholder="Só a equipe da loja pode ver…"
                    maxLength={500}
                  />
                </label>
                <button
                  className="outline-button full-width"
                  onClick={() => {
                    const note = internalNote.trim();
                    if (!note) {
                      toast.error("Escreva uma observação antes de salvar.");
                      return;
                    }
                    noteMutation.mutate(
                      { id: selectedOrderId, note },
                      { onSuccess: () => setInternalNote("") }
                    );
                  }}
                  disabled={noteMutation.isPending || !internalNote.trim()}
                >
                  Adicionar observação interna
                </button>
                <div className="internal-note-list">
                  <h3>
                    Observações da equipe{" "}
                    <small>privadas · incluídas apenas na comanda Epson</small>
                  </h3>
                  {detail.data.internalNotes.length ? (
                    detail.data.internalNotes.map(note => (
                      <article key={note.id}>
                        <div>
                          <b>{note.authorName}</b>
                          <time>
                            {new Date(note.createdAt).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </time>
                        </div>
                        <p>{note.note}</p>
                      </article>
                    ))
                  ) : (
                    <p className="empty-internal-notes">
                      Nenhuma observação interna ainda.
                    </p>
                  )}
                </div>
                {whatsappDraftUrl && isOwner && (
                  <a
                    className="outline-button full-width whatsapp-followup"
                    href={whatsappDraftUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={16} /> Abrir mensagem de pedido
                    alterado no WhatsApp
                  </a>
                )}
                <div className="detail-history">
                  <h3>Histórico</h3>
                  {detail.data.history.map(item => (
                    <div key={item.id}>
                      <span className="history-dot" />
                      <b>{statusNames[item.status as Status] || item.status}</b>
                      <small>
                        {new Date(item.createdAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        · {item.changedBy || "Loja"}
                      </small>
                    </div>
                  ))}
                </div>
                <div className="detail-status-actions">
                  {stages.findIndex(
                    stage => stage.key === detail.data?.order.status
                  ) >= 0 &&
                    stages.find(
                      stage => stage.key === detail.data?.order.status
                    )?.next && (
                      <button
                        className="primary-button"
                        onClick={() =>
                          advanceOrder(
                            selectedOrderId,
                            stages.find(
                              stage => stage.key === detail.data?.order.status
                            )!.next!
                          )
                        }
                      >
                        {`Avançar: ${statusNames[stages.find(stage => stage.key === detail.data?.order.status)!.next!]}`}{" "}
                        <ArrowRight size={16} />
                      </button>
                    )}
                  <button
                    className="cancel-order"
                    onClick={() => advanceOrder(selectedOrderId, "cancelled")}
                  >
                    Cancelar pedido
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
