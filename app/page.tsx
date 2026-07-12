"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type MenuItem = { id: string; name: string; description: string | null; ingredients: string | null; price: number; photo_url: string | null };
type Sale = { id: string; item_name: string; category: string; unit_price: number; quantity: number; sold_at: string };

const TABS = [
  { id: "pricing", label: "Precificação" },
  { id: "builder", label: "Simulador de pedido" },
  { id: "menu", label: "Cardápio" },
  { id: "admin", label: "Painel" },
  { id: "assistant", label: "Assistente IA" },
] as const;

function fmt(n: number) {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mantém só dígitos e formata como reais enquanto digita (ex: "2250" -> "22,50")
function formatPriceInput(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pricing");
  const [shopName, setShopName] = useState("Norte House Burger");

  // ---- pricing calculator state (local, não salva no banco) ----
  const [ingredients, setIngredients] = useState([
    { name: "Pão brioche", qty: 1, unit: "un", cost: 1.2 },
    { name: "Carne 150g", qty: 1, unit: "un", cost: 6.5 },
    { name: "Queijo cheddar", qty: 2, unit: "fatia", cost: 0.8 },
    { name: "Molho da casa", qty: 20, unit: "g", cost: 0.05 },
  ]);
  const [marginPct, setMarginPct] = useState(150);
  const [fixedCost, setFixedCost] = useState(1.5);

  // ---- order builder state (local) ----
  const orderBases = [
    { id: "classico", name: "Clássico", desc: "150g, queijo, alface, tomate.", price: 22 },
    { id: "duplo", name: "Duplo carne", desc: "2x150g, queijo duplo.", price: 32 },
    { id: "vegetariano", name: "Vegetariano", desc: "Hambúrguer de grão-de-bico.", price: 24 },
  ];
  const orderAddons = [
    { id: "bacon", name: "Bacon extra", price: 5 },
    { id: "cheddar", name: "Cheddar extra", price: 4 },
    { id: "ovo", name: "Ovo frito", price: 3 },
    { id: "onion", name: "Onion rings", price: 6 },
    { id: "molho", name: "Molho especial", price: 2 },
  ];
  const orderSides = [
    { id: "batata", name: "Batata frita", price: 10 },
    { id: "refri", name: "Refrigerante lata", price: 6 },
    { id: "suco", name: "Suco natural", price: 8 },
  ];
  const [orderBase, setOrderBase] = useState("classico");
  const [orderSelectedAddons, setOrderSelectedAddons] = useState<Set<string>>(new Set());
  const [orderSelectedSides, setOrderSelectedSides] = useState<Set<string>>(new Set());

  // ---- menu state ----
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIngredients, setNewIngredients] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  // ---- sales state ----
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItemId, setSaleItemId] = useState("");
  const [saleQty, setSaleQty] = useState(1);

  // ---- assistant state ----
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const chatSuggestions = [
    "Essa margem tá boa para esse item?",
    "Sugira um nome criativo para um novo hambúrguer",
    "Escreva uma descrição de cardápio pro item atual",
    "Como precificar um combo com batata e bebida?",
  ];

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
    setMenuError(null);
    const priceNum = parseFloat(newPrice.replace(",", "."));
    if (!newName.trim() || !newPrice || isNaN(priceNum)) {
      setMenuError("Preencha ao menos o nome e o preço do item.");
      return;
    }
    setSavingItem(true);
    try {
      let photo_url: string | null = null;

      if (newPhotoFile) {
        const filePath = `${Date.now()}-${newPhotoFile.name}`;
        const { error: uploadError } = await supabase.storage.from("menu-photos").upload(filePath, newPhotoFile);
        if (uploadError) {
          setMenuError(`Falha ao enviar a foto: ${uploadError.message}. Verifique se o bucket "menu-photos" existe e é público.`);
        } else {
          const { data: publicUrl } = supabase.storage.from("menu-photos").getPublicUrl(filePath);
          photo_url = publicUrl.publicUrl;
        }
      }

      const { error: insertError } = await supabase.from("menu_items").insert({
        name: newName.trim(),
        price: priceNum,
        description: newDesc.trim() || null,
        ingredients: newIngredients.trim() || null,
        photo_url,
      });

      if (insertError) {
        setMenuError(`Falha ao salvar o item: ${insertError.message}`);
        return;
      }

      setNewName("");
      setNewPrice("");
      setNewDesc("");
      setNewIngredients("");
      setNewPhotoFile(null);
      setNewPhotoPreview(null);
      loadMenu();
    } catch (err: any) {
      setMenuError(`Erro inesperado: ${err.message || err}`);
    } finally {
      setSavingItem(false);
    }
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

  async function sendChatMessage(overrideText?: string) {
    const text = (overrideText ?? chatInput).trim();
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

  // pricing calc
  const ingredientsCost = ingredients.reduce((s, i) => s + i.qty * i.cost, 0);
  const totalItemCost = ingredientsCost + fixedCost;
  const suggestedPrice = totalItemCost * (1 + marginPct / 100);

  function updateIngredient(i: number, field: string, value: string) {
    setIngredients((prev) => prev.map((ing, idx) => idx === i ? { ...ing, [field]: field === "qty" || field === "cost" ? parseFloat(value) || 0 : value } : ing));
  }
  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  // order builder calc
  const chosenBase = orderBases.find((b) => b.id === orderBase)!;
  const chosenAddons = orderAddons.filter((a) => orderSelectedAddons.has(a.id));
  const chosenSides = orderSides.filter((s) => orderSelectedSides.has(s.id));
  const orderTotal = chosenBase.price + chosenAddons.reduce((s, a) => s + a.price, 0) + chosenSides.reduce((s, i) => s + i.price, 0);
  function toggleSet(setFn: (fn: (prev: Set<string>) => Set<string>) => void, id: string) {
    setFn((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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

        {tab === "pricing" && (
          <div className="panel">
            <div className="section-head"><h2>Ingredientes do item</h2><div className="rule" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 90px 32px", gap: 10, fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 1, padding: "0 0 10px", borderBottom: "1px solid var(--ink-dim)" }}>
              <span>Ingrediente</span><span>Qtd</span><span>Unid.</span><span>Custo (R$)</span><span></span>
            </div>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 90px 32px", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <input value={ing.name} onChange={(e) => updateIngredient(i, "name", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }} />
                <input type="number" value={ing.qty} step="0.1" onChange={(e) => updateIngredient(i, "qty", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }} />
                <input value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }} />
                <input type="number" value={ing.cost} step="0.01" onChange={(e) => updateIngredient(i, "cost", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }} />
                <button onClick={() => removeIngredient(i)} style={{ background: "none", border: "none", color: "var(--ink-dim)", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            ))}
            <button onClick={() => setIngredients((prev) => [...prev, { name: "Novo ingrediente", qty: 1, unit: "un", cost: 0 }])}
              style={{ marginTop: 14, background: "none", border: "1px dashed var(--ink-dim)", color: "var(--ink-dim)", padding: "10px 16px", fontSize: 13, cursor: "pointer", borderRadius: 3 }}>
              + adicionar ingrediente
            </button>

            <div className="section-head"><h2>Margem & custos fixos</h2><div className="rule" /></div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Margem de lucro desejada</label>
                <input type="range" min={20} max={300} step={5} value={marginPct} onChange={(e) => setMarginPct(parseInt(e.target.value))} style={{ width: "100%" }} />
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 20, marginTop: 10, color: "var(--mustard)" }}>{marginPct}%</div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Custo fixo por unidade (embalagem, gás)</label>
                <input type="range" min={0} max={10} step={0.1} value={fixedCost} onChange={(e) => setFixedCost(parseFloat(e.target.value))} style={{ width: "100%" }} />
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 20, marginTop: 10, color: "var(--mustard)" }}>{fmt(fixedCost)}</div>
              </div>
            </div>

            <div style={{ marginTop: 24, background: "linear-gradient(135deg,#3a2e1f,var(--charcoal-2))", border: "1px solid var(--mustard)", padding: 26, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Custo total do item</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontWeight: 500, fontSize: 32, color: "var(--mustard)" }}>{fmt(totalItemCost)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Preço de venda sugerido</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontWeight: 500, fontSize: 32, color: "var(--mustard)" }}>{fmt(suggestedPrice)}</div>
                <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>lucro de {fmt(suggestedPrice - totalItemCost)} por unidade</div>
              </div>
            </div>
            <div className="footer-note"><b>Dica —</b> depois de calcular, use esse valor no campo de preço ao cadastrar o item na aba Cardápio.</div>
          </div>
        )}

        {tab === "builder" && (
          <div className="panel">
            <div className="section-head"><h2>Base do pedido</h2><div className="rule" /></div>
            <div className="cards">
              {orderBases.map((b) => (
                <div key={b.id} className={`card ${orderBase === b.id ? "active" : ""}`} onClick={() => setOrderBase(b.id)}>
                  <div className="top-row"><span className="name">{b.name}</span><span className="dot" /></div>
                  <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{b.desc}</div>
                  <span className="price">+ {fmt(b.price)}</span>
                </div>
              ))}
            </div>

            <div className="section-head"><h2>Adicionais</h2><div className="rule" /></div>
            <div className="cards">
              {orderAddons.map((a) => (
                <div key={a.id} className={`card ${orderSelectedAddons.has(a.id) ? "active" : ""}`} onClick={() => toggleSet(setOrderSelectedAddons, a.id)}>
                  <div className="top-row"><span className="name">{a.name}</span><span className="dot" /></div>
                  <span className="price">+ {fmt(a.price)}</span>
                </div>
              ))}
            </div>

            <div className="section-head"><h2>Bebida & acompanhamento</h2><div className="rule" /></div>
            <div className="cards">
              {orderSides.map((s) => (
                <div key={s.id} className={`card ${orderSelectedSides.has(s.id) ? "active" : ""}`} onClick={() => toggleSet(setOrderSelectedSides, s.id)}>
                  <div className="top-row"><span className="name">{s.name}</span><span className="dot" /></div>
                  <span className="price">+ {fmt(s.price)}</span>
                </div>
              ))}
            </div>

            <div className="ledger">
              <div className="ledger-head"><span>Composição do pedido</span><span>{1 + chosenAddons.length + chosenSides.length} itens</span></div>
              <div className="line"><span>{chosenBase.name}</span><span className="l-price">{fmt(chosenBase.price)}</span></div>
              {chosenAddons.map((a) => <div key={a.id} className="line"><span>{a.name}</span><span className="l-price">{fmt(a.price)}</span></div>)}
              {chosenSides.map((s) => <div key={s.id} className="line"><span>{s.name}</span><span className="l-price">{fmt(s.price)}</span></div>)}
              <div className="total-bar"><span className="label">Total do pedido</span><span className="amount">{fmt(orderTotal)}</span></div>
            </div>
          </div>
        )}

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
                  <div style={{ flex: 1, position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)", fontSize: 14, pointerEvents: "none" }}>R$</span>
                    <input
                      placeholder="0,00"
                      inputMode="numeric"
                      value={newPrice}
                      onChange={(e) => setNewPrice(formatPriceInput(e.target.value))}
                      style={{ width: "100%", background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: "10px 10px 10px 32px", borderRadius: 3 }}
                    />
                  </div>
                  <input placeholder="Descrição curta" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                    style={{ flex: 2, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
                </div>
                <textarea placeholder="Ingredientes (ex: pão brioche, 150g carne, cheddar, molho da casa)" value={newIngredients} onChange={(e) => setNewIngredients(e.target.value)}
                  rows={2}
                  style={{ background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3, resize: "vertical" }} />
                {menuError && <div style={{ color: "var(--burnt)", fontSize: 13 }}>{menuError}</div>}
                <button onClick={handleAddMenuItem} disabled={savingItem} style={{ alignSelf: "flex-start", background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "10px 22px", borderRadius: 3, cursor: savingItem ? "default" : "pointer", opacity: savingItem ? 0.6 : 1 }}>
                  {savingItem ? "Salvando..." : "Adicionar ao cardápio"}
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
                    {item.ingredients && <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8, lineHeight: 1.5 }}>{item.ingredients}</div>}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {chatSuggestions.map((s) => (
                <button key={s} onClick={() => sendChatMessage(s)}
                  style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink-dim)", fontSize: 12, padding: "8px 12px", borderRadius: 20, cursor: "pointer" }}>
                  {s}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder="Ex: essa margem tá boa pro clássico?"
                style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 12, borderRadius: 3 }} />
              <button onClick={() => sendChatMessage()} style={{ background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "0 22px", borderRadius: 3, cursor: "pointer" }}>Enviar</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 60, padding: "24px 24px", textAlign: "center", fontSize: 12, color: "var(--ink-dim)" }}>
        {shopName} — painel de gestão interno. Desenvolvido por Kauã Gonçalves.
      </div>
    </div>
  );
}