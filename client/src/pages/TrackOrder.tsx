import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Check, Clock3, Flame, MapPin, PackageCheck, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "../../../shared/pricing";

const statusOrder = ["received", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"] as const;
const labels: Record<string, string> = { received: "Pedido recebido", confirmed: "Pedido confirmado", preparing: "Em preparação", ready: "Pronto para retirada", out_for_delivery: "Saiu para entrega", delivered: "Entregue", cancelled: "Cancelado", rejected: "Recusado" };
const payment: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card_delivery: "Cartão na entrega", card_pickup: "Cartão na retirada" };

export default function TrackOrder() {
  const [, params] = useRoute("/pedido/:publicId");
  const [manualId, setManualId] = useState("");
  const publicId = params?.publicId || manualId.trim();
  const validId = /^[a-f0-9]{24}$/.test(publicId);
  const query = trpc.delivery.orders.track.useQuery({ publicId: validId ? publicId : "000000000000000000000000" }, { enabled: validId, refetchInterval: 5000, refetchOnWindowFocus: true });
  const order = query.data;
  const terminal = order?.order.status === "cancelled" || order?.order.status === "rejected";
  const currentIndex = order ? statusOrder.indexOf(order.order.status as typeof statusOrder[number]) : -1;

  return <main className="track-page"><header className="track-header"><Link href="/" className="brand"><span className="brand-mark"><Flame size={19} fill="currentColor" /></span><span><b>Brasa & Ponto</b><small>BURGER HOUSE</small></span></Link><Link href="/" className="back-link"><ArrowLeft size={15} /> Cardápio</Link></header>
    {!publicId && <section className="track-search-card"><span className="track-big-icon"><PackageCheck size={28} /></span><span className="eyebrow">ACOMPANHAMENTO</span><h1>Onde está seu pedido?</h1><p>Digite o identificador de acompanhamento que recebeu ao finalizar sua compra.</p><form onSubmit={event => { event.preventDefault(); }}><input value={manualId} onChange={event => setManualId(event.target.value.toLowerCase())} placeholder="Ex.: 24 caracteres" maxLength={24} /><button className="primary-button" type="submit">Acompanhar</button></form><Link href="/" className="text-button">Ainda não fez um pedido? Ver o cardápio</Link></section>}
    {publicId && !validId && <section className="track-search-card"><span className="track-big-icon warning-icon">!</span><h1>Esse link parece incompleto.</h1><p>Confira o link de acompanhamento ou volte ao cardápio para fazer um pedido.</p><Link href="/" className="primary-button">Voltar ao cardápio</Link></section>}
    {validId && query.isLoading && <section className="track-search-card"><div className="track-spinner"><RefreshCw size={22} /></div><h1>Buscando seu pedido…</h1></section>}
    {validId && query.error && <section className="track-search-card"><span className="track-big-icon warning-icon">!</span><h1>Não encontramos esse pedido.</h1><p>Confira o identificador e tente novamente.</p><Link href="/pedido" className="primary-button">Tentar outro código</Link></section>}
    {order && <section className="tracking-card"><div className="tracking-top"><div><span className="eyebrow">PEDIDO {order.order.orderNumber}</span><h1>{terminal ? labels[order.order.status] : labels[order.order.status] || "Pedido em andamento"}</h1><p>{terminal ? "Entre em contato com a loja caso precise de ajuda." : "A gente já está cuidando de tudo."}</p></div><span className={`tracking-badge ${terminal ? "cancelled" : ""}`}><i />{labels[order.order.status]}</span></div>
      {!terminal && <div className="tracking-timeline">{statusOrder.map((status, index) => {
        const matching = order.history.find(entry => entry.status === status);
        const done = currentIndex >= index;
        return <div className={`timeline-item ${done ? "done" : ""} ${currentIndex === index ? "current" : ""}`} key={status}><div className="timeline-marker">{done ? <Check size={13} /> : <span />}</div><div className="timeline-copy"><b>{labels[status]}</b>{matching && <small>{new Date(matching.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>}</div></div>;
      })}</div>}
      {terminal && <div className="terminal-message">{order.history[0] && <small>Atualizado em {new Date(order.order.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>}</div>}
      <div className="track-divider" /><section className="track-details"><div className="track-detail-heading"><h2>Resumo do pedido</h2><button onClick={() => query.refetch()} aria-label="Atualizar status"><RefreshCw size={15} /> Atualizar</button></div>{order.items.map(item => { const lineTotal = (item.unitPriceCents * item.quantity) + item.options.reduce((sum, option) => sum + option.priceCents, 0) * item.quantity; return <div className="track-item" key={item.id}><span>{item.quantity}×</span><div><b>{item.productName}</b>{item.options.length > 0 && <small>{item.options.map(option => option.optionName).join(", ")}</small>}{item.note && <small>Obs.: {item.note}</small>}</div><strong>{formatBRL(lineTotal)}</strong></div>; })}<div className="track-price-line"><span>Subtotal</span><b>{formatBRL(order.order.subtotalCents)}</b></div><div className="track-price-line"><span>Entrega</span><b>{order.order.deliveryType === "pickup" ? "Grátis" : formatBRL(order.order.deliveryFeeCents)}</b></div><div className="track-price-line track-total"><span>Total</span><b>{formatBRL(order.order.totalCents)}</b></div></section>
      <div className="track-bottom"><span><Clock3 size={16} /> Previsão: 30–45 min</span><span><MapPin size={16} /> {order.order.deliveryType === "pickup" ? "Retirada na loja" : `${order.order.street}, ${order.order.streetNumber} · ${order.order.neighborhood}`}</span><span><PackageCheck size={16} /> {payment[order.order.paymentMethod]}</span></div><p className="refresh-note">Status atualizado automaticamente a cada 5 segundos.</p>
    </section>}
  </main>;
}
