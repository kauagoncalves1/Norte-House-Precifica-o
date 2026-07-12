"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type MenuItem = { id: string; name: string; description: string | null; price: number; photo_url: string | null };
type Sale = { id: string; item_name: string; category: string; unit_price: number; quantity: number; sold_at: string };

const TABS = [
  { id: "menu", label: "Cardápio" },
  { id: "admin", label: "Painel" },
  { id: "assistant", label: "Assistente IA" },
] as const;

function fmt(n: number) {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("menu");
  const [shopName, setShopName] = useState("Norte House Burger");

  // ---- menu state ----
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);

  // ---- sales state ----
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItemId, setSaleItemId] = useState("");
  const [saleQty, setSaleQty] = useState(1);

  // ---- assistant state ----
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    loadMenu();
    loadSales();
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data } = await supabase.from("shop_settings").select("*").eq("id", 1).single();
    if (data?.name) setShopName(data.name);
  }

  async function loadMenu() {
    const { data } = await supabase.from("menu_items").select("*").order("created_at", { ascending: false });
    if (data) setMenuItems(data as MenuItem[]);
  }

  async function loadSales() {
    const { data } = await supabase.from("sales").select("*").order("sold_at", { ascending: false });
    if (data) setSales(data as Sale[]);
  }

  async function handleAddMenuItem() {
    if (!newName.trim() || !newPrice) {
      alert("Preencha ao menos o nome e o preço do item.");
      return;
    }
    let photo_url: string | null = null;

    if (newPhotoFile) {
      const filePath = `${Date.now()}-${newPhotoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("menu-photos").upload(filePath, newPhotoFile);
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from("menu-photos").getPublicUrl(filePath);
        photo_url = publicUrl.publicUrl;
      }
    }

    await supabase.from("menu_items").insert({
      name: newName.trim(),
      price: parseFloat(newPrice),
      description: newDesc.trim() || null,
      photo_url,
    });

    setNewName("");
    setNewPrice("");
    setNewDesc("");
    setNewPhotoFile(null);
    setNewPhotoPreview(null);
    loadMenu();
  }

  async function handleDeleteMenuItem(id: string) {
    await supabase.from("menu_items").delete().eq("id", id);
    loadMenu();
  }

  async function handleRegisterSale() {
    const item = menuItems.find((m) => m.id === saleItemId);
    if (!item) {
      alert("Escolha um item do cardápio.");
      return;
    }
    await supabase.from("sales").insert({
      item_id: item.id,
      item_name: item.name,
      category: "burger",
      unit_price: item.price,
      quantity: saleQty,
    });
    setSaleQty(1);
    loadSales();
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text) return;
    const newHistory = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);

    const revenue = sales.reduce((s, l) => s + l.unit_price * l.quantity, 0);
    const context = `Contexto atual da hamburgueria ${shopName} (uso interno, não mostre ao usuário): ${menuItems.length} itens no cardápio, faturamento total registrado ${fmt(revenue)}. Responda de forma direta e prática em português do Brasil, como um consultor de precificação para pequenos negócios de alimentação.`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory, context }),
      });
      const data = await res.json();
      const reply = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || "Não consegui responder agora.";
      setChatHistory([...newHistory, { role: "assistant", content: reply }]);
    } catch {
      setChatHistory([...newHistory, { role: "assistant", content: "Erro ao conectar com o assistente." }]);
    } finally {
      setChatLoading(false);
    }
  }

  const revenue = sales.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const profit = sales.reduce((s, l) => s + l.unit_price * 0.6 * l.quantity, 0);
  const count = sales.reduce((s, l) => s + l.quantity, 0);
  const tally: Record<string, number> = {};
  sales.forEach((l) => { tally[l.item_name] = (tally[l.item_name] || 0) + l.quantity; });
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mark">{shopName}</span>
        </div>
        <div>{new Date().toLocaleDateString("pt-BR")}</div>
      </div>

      <div className="wrap">
        <div className="hero">
          <div className="eyebrow">Painel de gestão</div>
          <h1>Bem-vindo de volta.</h1>
          <p>Precificação, cardápio e vendas da {shopName}.</p>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "menu" && (
          <div className="panel">
            <div className="section-head"><h2>Novo item do cardápio</h2><div className="rule" /></div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: 22, display: "grid", gridTemplateColumns: "140px 1fr", gap: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--ink-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Foto</label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 140, height: 140, border: "1px dashed var(--ink-dim)", borderRadius: 4, cursor: "pointer", overflow: "hidden", background: "var(--charcoal-2)" }}>
                  {newPhotoPreview ? (
                    <img src={newPhotoPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--ink-dim)", textAlign: "center", padding: 10 }}>clique para<br />enviar foto</span>
                  )}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setNewPhotoFile(f);
                    const reader = new FileReader();
                    reader.onload = () => setNewPhotoPreview(reader.result as string);
                    reader.readAsDataURL(f);
                  }} />
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <input placeholder="Nome do item" value={newName} onChange={(e) => setNewName(e.target.value)}
                  style={{ background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
                <div style={{ display: "flex", gap: 14 }}>
                  <input placeholder="Preço (R$)" type="number" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
                    style={{ flex: 1, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
                  <input placeholder="Descrição curta" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                    style={{ flex: 2, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
                </div>
                <button onClick={handleAddMenuItem} style={{ alignSelf: "flex-start", background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "10px 22px", borderRadius: 3, cursor: "pointer" }}>
                  Adicionar ao cardápio
                </button>
              </div>
            </div>

            <div className="section-head"><h2>Vitrine</h2><div className="rule" /></div>
            <div className="cards">
              {menuItems.map((item) => (
                <div key={item.id} className="card" style={{ cursor: "default", position: "relative", padding: 0, overflow: "hidden" }}>
                  <div style={{ width: "100%", aspectRatio: "4/3", background: "var(--charcoal-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {item.photo_url ? <img src={item.photo_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>sem foto</span>}
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="name">{item.name}</span>
                      <span style={{ fontFamily: "DM Mono, monospace", color: "var(--mustard)" }}>{fmt(item.price)}</span>
                    </div>
                    {item.description && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 6 }}>{item.description}</div>}
                  </div>
                  <button onClick={() => handleDeleteMenuItem(item.id)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", color: "var(--ink)", width: 24, height: 24, borderRadius: "50%", cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
            {menuItems.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-dim)", fontStyle: "italic" }}>Nenhum item adicionado ainda.</p>}
          </div>
        )}

        {tab === "admin" && (
          <div className="panel">
            <div className="section-head"><h2>Visão geral</h2><div className="rule" /></div>
            <div className="cards">
              <div className="stat-card"><div className="stat-label">Faturamento total</div><div className="stat-value">{fmt(revenue)}</div></div>
              <div className="stat-card"><div className="stat-label">Lucro estimado</div><div className="stat-value">{fmt(profit)}</div></div>
              <div className="stat-card"><div className="stat-label">Pedidos registrados</div><div className="stat-value">{count}</div></div>
              <div className="stat-card"><div className="stat-label">Mais vendido</div><div style={{ fontSize: 15, fontWeight: 600 }}>{ranked[0]?.[0] || "—"}</div></div>
            </div>

            <div className="section-head"><h2>Registrar venda</h2><div className="rule" /></div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: 20, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <select value={saleItemId} onChange={(e) => setSaleItemId(e.target.value)} style={{ flex: 2, minWidth: 180 }}>
                <option value="">selecione um item</option>
                {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name} — {fmt(m.price)}</option>)}
              </select>
              <input type="number" min={1} value={saleQty} onChange={(e) => setSaleQty(parseInt(e.target.value) || 1)}
                style={{ width: 90, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
              <button onClick={handleRegisterSale} style={{ background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "11px 22px", borderRadius: 3, cursor: "pointer" }}>Registrar venda</button>
            </div>

            <div className="section-head"><h2>Ranking de mais vendidos</h2><div className="rule" /></div>
            {ranked.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-dim)", fontStyle: "italic" }}>Nenhuma venda registrada ainda.</p>}
            {ranked.map(([name, qty]) => {
              const pct = Math.round((qty / (ranked[0][1] || 1)) * 100);
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 140, fontSize: 13 }}>{name}</span>
                  <div style={{ flex: 1, background: "var(--charcoal-2)", height: 10, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--mustard)" }} />
                  </div>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: "var(--ink-dim)", width: 60, textAlign: "right" }}>{qty} und.</span>
                </div>
              );
            })}

            <div className="section-head"><h2>Histórico de pedidos</h2><div className="rule" /></div>
            <div className="ledger">
              <div className="ledger-head"><span>Pedidos</span><span>{sales.length} registros</span></div>
              {sales.length === 0 && <div className="line empty">Nenhum pedido registrado ainda.</div>}
              {sales.map((s) => (
                <div key={s.id} className="line">
                  <span>{new Date(s.sold_at).toLocaleString("pt-BR")} — {s.quantity}x {s.item_name}</span>
                  <span className="l-price">{fmt(s.unit_price * s.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "assistant" && (
          <div className="panel">
            <div className="section-head"><h2>Assistente de precificação</h2><div className="rule" /></div>
            <p style={{ fontSize: 13, color: "var(--ink-dim)" }}>Pergunte sobre margem, peça sugestão de nome/descrição, ou tire dúvidas de precificação.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "20px 0", maxHeight: 420, overflowY: "auto" }}>
              {chatHistory.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  background: m.role === "user" ? "var(--mustard)" : "var(--card)",
                  color: m.role === "user" ? "var(--charcoal)" : "var(--ink)",
                  border: "1px solid var(--line)", padding: "12px 16px", borderRadius: 8, fontSize: 14, whiteSpace: "pre-wrap",
                }}>{m.content}</div>
              ))}
              {chatLoading && <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>Pensando...</div>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder="Ex: essa margem tá boa pro clássico?"
                style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 12, borderRadius: 3 }} />
              <button onClick={sendChatMessage} style={{ background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "0 22px", borderRadius: 3, cursor: "pointer" }}>Enviar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
