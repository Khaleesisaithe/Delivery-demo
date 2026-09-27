import { formatBRL } from "../../../shared/pricing";

type TicketOrder = {
  orderNumber: string | null;
  createdAt: string | Date;
  deliveryType: "delivery" | "pickup";
  street: string | null;
  streetNumber: string | null;
  neighborhood: string | null;
  paymentMethod: string;
  changeForCents: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  customerNote: string | null;
};
type TicketCustomer = { name: string; phone: string };
type TicketItem = {
  quantity: number;
  productName: string;
  unitPriceCents: number;
  note: string | null;
  options: { optionName: string; priceCents: number }[];
};
type InternalNote = {
  authorName: string;
  note: string;
  createdAt: string | Date;
};

const paymentLabels: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card_delivery: "Cartão na entrega",
  card_pickup: "Cartão na retirada",
};
const escapeHtml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!
  );

export function buildServiceTicketHtml(
  order: TicketOrder,
  customer: TicketCustomer,
  items: TicketItem[],
  storeName = "Sua loja"
) {
  const itemsHtml = items
    .map(item => {
      const lineTotal =
        (item.unitPriceCents +
          item.options.reduce((sum, option) => sum + option.priceCents, 0)) *
        item.quantity;
      const optionsHtml = item.options.length
        ? `<div class="st-sub">+ ${item.options.map(option => escapeHtml(option.optionName)).join(", ")}</div>`
        : "";
      const noteHtml = item.note
        ? `<div class="st-sub">Obs.: ${escapeHtml(item.note)}</div>`
        : "";
      return `<div class="st-row"><span>${item.quantity}x ${escapeHtml(item.productName)}</span><span>${formatBRL(lineTotal)}</span></div>${optionsHtml}${noteHtml}`;
    })
    .join("");
  const street = [order.street, order.streetNumber].filter(Boolean).join(", ");
  const address =
    order.deliveryType === "pickup"
      ? "Retirada na loja"
      : [street, order.neighborhood].filter(Boolean).join(" — ");
  const changeLine =
    order.paymentMethod === "cash" && order.changeForCents
      ? `<div>Troco para: ${formatBRL(order.changeForCents)}</div>`
      : "";
  const customerNote = order.customerNote
    ? `<div><b>Obs. do cliente:</b> ${escapeHtml(order.customerNote)}</div>`
    : "";

  return `
    <div style="text-align:center;margin-bottom:6px"><b style="font-size:15px">${escapeHtml(storeName)}</b><br><span style="font-size:9.5px">Nota de serviço — não é documento fiscal</span></div>
    <hr>
    <div>Pedido: <b>${escapeHtml(order.orderNumber ?? "")}</b></div>
    <div>${escapeHtml(new Date(order.createdAt).toLocaleString("pt-BR"))}</div>
    <hr>
    ${itemsHtml}
    <hr>
    <div class="st-row"><span>Subtotal</span><span>${formatBRL(order.subtotalCents)}</span></div>
    <div class="st-row"><span>Entrega</span><span>${order.deliveryType === "pickup" ? "Grátis" : formatBRL(order.deliveryFeeCents)}</span></div>
    <div class="st-row" style="font-weight:bold"><span>TOTAL</span><span>${formatBRL(order.totalCents)}</span></div>
    <hr>
    <div><b>Cliente:</b> ${escapeHtml(customer.name)}</div>
    <div><b>Telefone:</b> ${escapeHtml(customer.phone)}</div>
    <div><b>${order.deliveryType === "pickup" ? "Retirada na loja" : "Entrega"}</b>${order.deliveryType === "pickup" ? "" : `: ${escapeHtml(address)}`}</div>
    <div><b>Pagamento:</b> ${escapeHtml(paymentLabels[order.paymentMethod] || order.paymentMethod)}</div>
    ${changeLine}
    ${customerNote}
    <hr>
    <div style="text-align:center;font-size:9.5px">Obrigado pela preferência!</div>
  `;
}

export function printServiceTicket(
  order: TicketOrder,
  customer: TicketCustomer,
  items: TicketItem[],
  storeName = "Sua loja"
) {
  const area = document.getElementById("service-ticket");
  if (!area) return;
  area.innerHTML = buildServiceTicketHtml(order, customer, items, storeName);
  printOnly("service");
}

export function buildInternalKitchenTicketHtml(
  order: TicketOrder,
  customer: TicketCustomer,
  items: TicketItem[],
  internalNotes: InternalNote[],
  storeName = "Sua loja"
) {
  const notesHtml = internalNotes.length
    ? `<hr><div><b>USO INTERNO DA EQUIPE</b></div>${internalNotes.map(note => `<div class="st-sub"><b>${escapeHtml(note.authorName)}</b> · ${escapeHtml(new Date(note.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}<br>${escapeHtml(note.note)}</div>`).join("")}`
    : `<hr><div><b>USO INTERNO DA EQUIPE</b><br>Sem observações internas.</div>`;
  return `${buildServiceTicketHtml(order, customer, items, storeName)}${notesHtml}`;
}

export function printInternalKitchenTicket(
  order: TicketOrder,
  customer: TicketCustomer,
  items: TicketItem[],
  internalNotes: InternalNote[],
  storeName = "Sua loja"
) {
  const area = document.getElementById("internal-ticket");
  if (!area) return;
  area.innerHTML = buildInternalKitchenTicketHtml(
    order,
    customer,
    items,
    internalNotes,
    storeName
  );
  printOnly("internal");
}

function printOnly(ticket: "service" | "internal") {
  const oldTicket = document.body.dataset.ticketPrint;
  document.body.dataset.ticketPrint = ticket;
  window.addEventListener(
    "afterprint",
    () => {
      if (oldTicket) document.body.dataset.ticketPrint = oldTicket;
      else delete document.body.dataset.ticketPrint;
    },
    { once: true }
  );
  window.print();
}
