import { describe, expect, it } from "vitest";
import { buildInternalKitchenTicketHtml, buildServiceTicketHtml } from "../client/src/lib/printTicket";

const order = {
  orderNumber: "BP-1234",
  createdAt: new Date("2026-09-25T17:00:00.000Z"),
  deliveryType: "delivery" as const,
  street: "Rua das Flores",
  streetNumber: "42",
  neighborhood: "Centro",
  paymentMethod: "cash",
  changeForCents: 10000,
  subtotalCents: 5000,
  deliveryFeeCents: 700,
  totalCents: 5700,
  customerNote: "Sem cebola",
};
const customer = { name: "Ana Silva", phone: "+55 11 99999-9999" };
const items = [{ quantity: 2, productName: "Brasa Clássico", unitPriceCents: 2000, note: "Bem passado", options: [{ optionName: "Queijo extra", priceCents: 500 }] }];

describe("service ticket", () => {
  it("renders delivery, payment, items and add-on totals", () => {
    const html = buildServiceTicketHtml(order, customer, items);
    expect(html).toContain("BP-1234");
    expect(html).toContain("Brasa Clássico");
    expect(html).toContain("+ Queijo extra");
    expect(html).toContain("R$ 50,00");
    expect(html).toContain("Troco para: R$ 100,00");
    expect(html).toContain("Rua das Flores, 42 — Centro");
    expect(html).toMatch(/não é documento fiscal/i);
  });

  it("renders the configured store name safely in the receipt header", () => {
    const html = buildServiceTicketHtml(order, customer, items, "Lanchonete da Família & Filhos");
    expect(html).toContain("Lanchonete da Família &amp; Filhos");
    expect(html).not.toContain("BRASA &amp; PONTO");
  });

  it("escapes customer-controlled content instead of injecting markup", () => {
    const html = buildServiceTicketHtml({ ...order, customerNote: "<img src=x onerror=alert(1)> & 'ok' \"yes\"" }, { name: "<script>alert(1)</script>", phone: "<b>999</b>" }, [{ ...items[0]!, productName: "<svg onload=alert(1)>", note: "<b>bad</b>", options: [{ optionName: "<img src=x>", priceCents: 0 }] }]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<svg onload=alert(1)>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&amp;");
  });

  it("formats pickup orders without a delivery fee or address", () => {
    const html = buildServiceTicketHtml({ ...order, deliveryType: "pickup", street: null, streetNumber: null, neighborhood: null, paymentMethod: "pix", changeForCents: null }, customer, []);
    expect(html).toContain("Retirada na loja");
    expect(html).toContain("Grátis");
    expect(html).not.toContain("Troco para:");
  });

  it("keeps internal notes out of the customer ticket and includes authors on the kitchen ticket", () => {
    const notes = [{ authorName: "Bruna Costa", note: "Conferir troco", createdAt: new Date("2026-09-25T17:15:00.000Z") }];
    const customerHtml = buildServiceTicketHtml(order, customer, items);
    const kitchenHtml = buildInternalKitchenTicketHtml(order, customer, items, notes);
    expect(customerHtml).not.toContain("Conferir troco");
    expect(customerHtml).not.toContain("Bruna Costa");
    expect(kitchenHtml).toContain("USO INTERNO DA EQUIPE");
    expect(kitchenHtml).toContain("Bruna Costa");
    expect(kitchenHtml).toContain("Conferir troco");
  });
});
