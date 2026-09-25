import type { Order } from "../drizzle/schema";

const statusCopy: Record<Order["status"], string> = {
  received: "Pedido recebido",
  confirmed: "Pedido confirmado",
  preparing: "Em preparação",
  ready: "Pedido pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Pedido entregue",
  cancelled: "Pedido cancelado",
  rejected: "Pedido recusado",
};

export function buildWhatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export async function notifyOrderStatus(orderNumber: string, phone: string, status: Order["status"]) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) return { delivered: false, reason: "not_configured" as const };

  const recipient = phone.replace(/\D/g, "");
  const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: `#${orderNumber}` }, { type: "text", text: statusCopy[status] }] }],
      },
    }),
  });
  if (!response.ok) {
    const safeDetails = await response.text().catch(() => "");
    console.error("[WhatsAppService] Status notification failed", response.status, safeDetails.slice(0, 300));
    return { delivered: false, reason: "provider_error" as const };
  }
  return { delivered: true, reason: "sent" as const };
}
