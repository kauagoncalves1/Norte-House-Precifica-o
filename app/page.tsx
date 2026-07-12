"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type MenuItem = { id: string; name: string; description: string | null; ingredients: string | null; price: number; cost: number | null; photo_url: string | null };
type Sale = { id: string; item_id: string | null; item_name: string; category: string; unit_price: number; quantity: number; sold_at: string };
type Extra = { id: string; name: string; price: number; category: "addon" | "drink" };

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

const UNIT_OPTIONS = ["un", "g", "kg", "ml", "l", "fatia", "dente", "colher", "xícara", "pitada"];

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

  // ---- order builder: base vem do cardápio real (menuItems), adicionais/bebidas vêm da tabela "extras" ----
  const [extras, setExtras] = useState<Extra[]>([]);
  const [orderBaseId, setOrderBaseId] = useState<string>("");
  const [orderSelectedAddons, setOrderSelectedAddons] = useState<Set<string>>(new Set());
  const [orderSelectedSides, setOrderSelectedSides] = useState<Set<string>>(new Set());

  // ---- form para cadastrar novo adicional/bebida ----
  const [newExtraName, setNewExtraName] = useState("");
  const [newExtraPrice, setNewExtraPrice] = useState("");
  const [newExtraCategory, setNewExtraCategory] = useState<"addon" | "drink">("addon");

  // ---- menu state ----
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newIngredients, setNewIngredients] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  function askConfirm(message: string, onConfirm: () => void) {
    setConfirmModal({ message, onConfirm });
  }

  // ---- sales state ----
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItemId, setSaleItemId] = useState("");
  const [saleQty, setSaleQty] = useState(1);
  const [extraSaleId, setExtraSaleId] = useState("");
  const [extraSaleQty, setExtraSaleQty] = useState(1);

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
    loadExtras();
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

  async function loadExtras() {
    const { data } = await supabase.from("extras").select("*").order("created_at", { ascending: false });
    if (data) setExtras(data as Extra[]);
  }

  async function handleAddExtra() {
    const priceNum = parseFloat(newExtraPrice.replace(",", "."));
    if (!newExtraName.trim() || isNaN(priceNum)) return;
    await supabase.from("extras").insert({ name: newExtraName.trim(), price: priceNum, category: newExtraCategory });
    setNewExtraName("");
    setNewExtraPrice("");
    loadExtras();
  }

  async function handleDeleteExtra(id: string) {
    askConfirm("Tem certeza que deseja remover este adicional/bebida?", async () => {
      const { error } = await supabase.from("extras").delete().eq("id", id);
      if (error) {
        alert(`Falha ao remover: ${error.message}`);
        return;
      }
      loadExtras();
    });
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
        const safeName = newPhotoFile.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
          .replace(/[^a-zA-Z0-9.\-_]/g, "-"); // troca qualquer outro caractere especial/espaço por "-"
        const filePath = `${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("menu-photos").upload(filePath, newPhotoFile);
        if (uploadError) {
          setMenuError(`Falha ao enviar a foto: ${uploadError.message}. Verifique se o bucket "menu-photos" existe e é público.`);
          return;
        } else {
          const { data: publicUrl } = supabase.storage.from("menu-photos").getPublicUrl(filePath);
          photo_url = publicUrl.publicUrl;
        }
      }

      const costNum = newCost ? parseFloat(newCost.replace(",", ".")) : null;
      const { error: insertError } = await supabase.from("menu_items").insert({
        name: newName.trim(),
        price: priceNum,
        cost: costNum,
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
      setNewCost("");
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
    askConfirm("Tem certeza que deseja remover este item do cardápio?", async () => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) {
        alert(`Falha ao remover: ${error.message}`);
        return;
      }
      loadMenu();
    });
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

  async function handleRegisterExtraSale() {
    const item = extras.find((e) => e.id === extraSaleId);
    if (!item) {
      alert("Escolha um adicional ou bebida.");
      return;
    }
    await supabase.from("sales").insert({
      item_name: item.name,
      category: item.category, // 'addon' ou 'drink'
      unit_price: item.price,
      quantity: extraSaleQty,
    });
    setExtraSaleQty(1);
    loadSales();
  }

  async function handleDeleteSale(id: string) {
    askConfirm("Tem certeza que deseja remover este pedido do histórico?", async () => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) {
        alert(`Falha ao remover: ${error.message}`);
        return;
      }
      loadSales();
    });
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

  const burgerSales = sales.filter((l) => l.category === "burger");
  const extraSales = sales.filter((l) => l.category !== "burger");

  const revenue = burgerSales.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  // usa o custo real do item quando cadastrado; senão, cai para a estimativa de 60% de margem
  const profit = burgerSales.reduce((s, l) => {
    const menuItem = menuItems.find((m) => m.id === l.item_id || m.name === l.item_name);
    const realCost = menuItem?.cost;
    const unitProfit = realCost != null ? l.unit_price - realCost : l.unit_price * 0.6;
    return s + unitProfit * l.quantity;
  }, 0);
  const count = burgerSales.reduce((s, l) => s + l.quantity, 0);
  const tally: Record<string, number> = {};
  burgerSales.forEach((l) => { tally[l.item_name] = (tally[l.item_name] || 0) + l.quantity; });
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);

  const extraRevenue = extraSales.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const extraCount = extraSales.reduce((s, l) => s + l.quantity, 0);
  const extraTally: Record<string, number> = {};
  extraSales.forEach((l) => { extraTally[l.item_name] = (extraTally[l.item_name] || 0) + l.quantity; });
  const extraRanked = Object.entries(extraTally).sort((a, b) => b[1] - a[1]);

  // ---- análises pro dashboard ----
  const totalRevenue = revenue + extraRevenue;
  const totalOrders = count + extraCount;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const profitMarginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  // faturamento nos últimos 7 dias (combinando hambúrguer + bebida)
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayKey = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const dayTotal = sales
      .filter((s) => new Date(s.sold_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) === dayKey)
      .reduce((sum, s) => sum + s.unit_price * s.quantity, 0);
    return { dia: dayKey, faturamento: dayTotal };
  });

  // top 5 itens por faturamento (não só por quantidade), somando hambúrguer + bebida
  const revenueByItem: Record<string, number> = {};
  sales.forEach((s) => { revenueByItem[s.item_name] = (revenueByItem[s.item_name] || 0) + s.unit_price * s.quantity; });
  const topItemsByRevenue = Object.entries(revenueByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ nome: name.length > 14 ? name.slice(0, 14) + "…" : name, total }));

  // divisão hambúrguer x bebida/acompanhamento
  const splitData = [
    { name: "Hambúrgueres", value: revenue },
    { name: "Bebidas/Acomp.", value: extraRevenue },
  ];
  const SPLIT_COLORS = ["#d4a843", "#e8dcc8"];

  // desempenho por item do cardápio: quantidade, faturamento, custo total, lucro, margem %
  const itemPerformance = menuItems.map((item) => {
    const itemSales = burgerSales.filter((l) => l.item_id === item.id || l.item_name === item.name);
    const qty = itemSales.reduce((s, l) => s + l.quantity, 0);
    const itemRevenue = itemSales.reduce((s, l) => s + l.unit_price * l.quantity, 0);
    const itemCostTotal = item.cost != null ? item.cost * qty : null;
    const itemProfit = itemCostTotal != null ? itemRevenue - itemCostTotal : itemRevenue * 0.6;
    const marginPctReal = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;
    return { name: item.name, qty, revenue: itemRevenue, cost: itemCostTotal, profit: itemProfit, marginPctReal, hasCost: item.cost != null };
  }).sort((a, b) => b.revenue - a.revenue);

  // pricing calc
  const ingredientsCost = ingredients.reduce((s, i) => s + i.qty * i.cost, 0);
  const totalItemCost = ingredientsCost + fixedCost;
  const suggestedPrice = totalItemCost * (1 + marginPct / 100);

  function updateIngredient(i: number, field: string, value: string) {
    setIngredients((prev) => prev.map((ing, idx) => {
      if (idx !== i) return ing;
      if (field === "qty" || field === "cost") {
        return { ...ing, [field]: value === "" ? 0 : parseFloat(value) };
      }
      return { ...ing, [field]: value };
    }));
  }
  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  // order builder calc — base vem do cardápio real, adicionais/bebidas da tabela extras
  const orderAddonsList = extras.filter((e) => e.category === "addon");
  const orderSidesList = extras.filter((e) => e.category === "drink");
  const chosenBase = menuItems.find((m) => m.id === orderBaseId) || menuItems[0];
  const chosenAddons = orderAddonsList.filter((a) => orderSelectedAddons.has(a.id));
  const chosenSides = orderSidesList.filter((s) => orderSelectedSides.has(s.id));
  const orderTotal = (chosenBase?.price || 0) + chosenAddons.reduce((s, a) => s + a.price, 0) + chosenSides.reduce((s, i) => s + i.price, 0);
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
                <input type="number" value={ing.qty === 0 ? "" : ing.qty} step="0.1" onChange={(e) => updateIngredient(i, "qty", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }} />
                <select value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }}>
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" value={ing.cost === 0 ? "" : ing.cost} step="0.01" onChange={(e) => updateIngredient(i, "cost", e.target.value)} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)", padding: 8, borderRadius: 3 }} />
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
            <div className="section-head"><h2>Base do pedido (itens do seu cardápio)</h2><div className="rule" /></div>
            <div className="cards">
              {menuItems.map((b) => (
                <div key={b.id} className={`card ${orderBaseId === b.id ? "active" : ""}`} onClick={() => setOrderBaseId(b.id)}>
                  <div className="top-row"><span className="name">{b.name}</span><span className="dot" /></div>
                  {b.description && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{b.description}</div>}
                  <span className="price">{fmt(b.price)}</span>
                </div>
              ))}
            </div>
            {menuItems.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-dim)", fontStyle: "italic" }}>Cadastre itens na aba Cardápio primeiro.</p>}

            <div className="section-head"><h2>Gerenciar adicionais & bebidas</h2><div className="rule" /></div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input placeholder="Nome (ex: Bacon extra)" value={newExtraName} onChange={(e) => setNewExtraName(e.target.value)}
                style={{ flex: 2, minWidth: 160, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
              <input placeholder="0,00" inputMode="numeric" value={newExtraPrice} onChange={(e) => setNewExtraPrice(formatPriceInput(e.target.value))}
                style={{ width: 100, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
              <select value={newExtraCategory} onChange={(e) => setNewExtraCategory(e.target.value as "addon" | "drink")}>
                <option value="addon">Adicional</option>
                <option value="drink">Bebida/acompanhamento</option>
              </select>
              <button onClick={handleAddExtra} style={{ background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "10px 18px", borderRadius: 3, cursor: "pointer" }}>Adicionar</button>
            </div>

            <div className="section-head"><h2>Adicionais</h2><div className="rule" /></div>
            <div className="cards">
              {orderAddonsList.map((a) => (
                <div key={a.id} className={`card ${orderSelectedAddons.has(a.id) ? "active" : ""}`} style={{ position: "relative", paddingRight: 34 }}>
                  <div onClick={() => toggleSet(setOrderSelectedAddons, a.id)}>
                    <div className="top-row"><span className="name">{a.name}</span><span className="dot" /></div>
                    <span className="price">+ {fmt(a.price)}</span>
                  </div>
                  <button className="remove-btn" onClick={(e) => { e.stopPropagation(); handleDeleteExtra(a.id); }}>✕</button>
                </div>
              ))}
            </div>
            {orderAddonsList.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-dim)", fontStyle: "italic" }}>Nenhum adicional cadastrado ainda.</p>}

            <div className="section-head"><h2>Bebida & acompanhamento</h2><div className="rule" /></div>
            <div className="cards">
              {orderSidesList.map((s) => (
                <div key={s.id} className={`card ${orderSelectedSides.has(s.id) ? "active" : ""}`} style={{ position: "relative", paddingRight: 34 }}>
                  <div onClick={() => toggleSet(setOrderSelectedSides, s.id)}>
                    <div className="top-row"><span className="name">{s.name}</span><span className="dot" /></div>
                    <span className="price">+ {fmt(s.price)}</span>
                  </div>
                  <button className="remove-btn" onClick={(e) => { e.stopPropagation(); handleDeleteExtra(s.id); }}>✕</button>
                </div>
              ))}
            </div>
            {orderSidesList.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-dim)", fontStyle: "italic" }}>Nenhuma bebida/acompanhamento cadastrado ainda.</p>}

            {chosenBase && (
              <div className="ledger">
                <div className="ledger-head"><span>Composição do pedido</span><span>{1 + chosenAddons.length + chosenSides.length} itens</span></div>
                <div className="line"><span>{chosenBase.name}</span><span className="l-price">{fmt(chosenBase.price)}</span></div>
                {chosenAddons.map((a) => <div key={a.id} className="line"><span>{a.name}</span><span className="l-price">{fmt(a.price)}</span></div>)}
                {chosenSides.map((s) => <div key={s.id} className="line"><span>{s.name}</span><span className="l-price">{fmt(s.price)}</span></div>)}
                <div className="total-bar"><span className="label">Total do pedido</span><span className="amount">{fmt(orderTotal)}</span></div>
              </div>
            )}
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
                <div style={{ position: "relative", maxWidth: 200 }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)", fontSize: 14, pointerEvents: "none" }}>Custo R$</span>
                  <input
                    placeholder="0,00"
                    inputMode="numeric"
                    value={newCost}
                    onChange={(e) => setNewCost(formatPriceInput(e.target.value))}
                    style={{ width: "100%", background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: "10px 10px 10px 68px", borderRadius: 3 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-dim)" }}>Opcional — use o valor calculado na aba Precificação para o painel mostrar o lucro real deste item.</div>
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
                    {item.cost != null && (
                      <div style={{ fontSize: 11, color: "var(--jungle)", marginTop: 8 }}>
                        Custo: {fmt(item.cost)} · Lucro/unid.: {fmt(item.price - item.cost)}
                      </div>
                    )}
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
            <div className="section-head"><h2>Análises</h2><div className="rule" /></div>
            <div className="cards" style={{ marginBottom: 20 }}>
              <div className="stat-card"><div className="stat-label">Faturamento total</div><div className="stat-value">{fmt(totalRevenue)}</div></div>
              <div className="stat-card"><div className="stat-label">Ticket médio</div><div className="stat-value">{fmt(avgTicket)}</div></div>
              <div className="stat-card"><div className="stat-label">Total de pedidos</div><div className="stat-value">{totalOrders}</div></div>
              <div className="stat-card"><div className="stat-label">Margem (hambúrgueres)</div><div className="stat-value">{profitMarginPct.toFixed(0)}%</div></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
              <div className="stat-card" style={{ padding: 20 }}>
                <div className="stat-label" style={{ marginBottom: 14 }}>Faturamento — últimos 7 dias</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={last7Days}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                    <XAxis dataKey="dia" tick={{ fill: "var(--ink-dim)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "var(--ink-dim)", fontSize: 11 }} width={50} />
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={{ background: "var(--charcoal-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--ink)" }}
                    />
                    <Line type="monotone" dataKey="faturamento" stroke="var(--mustard)" strokeWidth={2} dot={{ fill: "var(--mustard)", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="stat-card" style={{ padding: 20 }}>
                <div className="stat-label" style={{ marginBottom: 14 }}>Hambúrguer × Bebida/Acomp.</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={splitData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {splitData.map((_, i) => <Cell key={i} fill={SPLIT_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--charcoal-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--ink)" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>
                  {splitData.map((d, i) => (
                    <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: SPLIT_COLORS[i], display: "inline-block" }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="stat-card" style={{ padding: 20, marginBottom: 20 }}>
              <div className="stat-label" style={{ marginBottom: 14 }}>Top 5 itens por faturamento</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItemsByRevenue}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="nome" tick={{ fill: "var(--ink-dim)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--ink-dim)", fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--charcoal-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--ink)" }} />
                  <Bar dataKey="total" fill="var(--mustard)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="section-head"><h2>Custo e lucro por item do cardápio</h2><div className="rule" /></div>
            <div className="ledger" style={{ marginBottom: 20, overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.7fr 1fr 1fr 1fr 0.8fr", gap: 10, padding: "12px 22px", fontSize: 11, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid var(--line)" }}>
                <span>Item</span><span>Qtd.</span><span>Faturamento</span><span>Custo total</span><span>Lucro</span><span>Margem</span>
              </div>
              {itemPerformance.length === 0 && <div className="line empty">Nenhum item cadastrado ainda.</div>}
              {itemPerformance.map((p) => (
                <div key={p.name} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.7fr 1fr 1fr 1fr 0.8fr", gap: 10, padding: "12px 22px", fontSize: 13, borderBottom: "1px solid var(--line)" }}>
                  <span>{p.name}</span>
                  <span style={{ color: "var(--ink-dim)" }}>{p.qty}</span>
                  <span style={{ fontFamily: "DM Mono, monospace" }}>{fmt(p.revenue)}</span>
                  <span style={{ fontFamily: "DM Mono, monospace", color: "var(--ink-dim)" }}>{p.cost != null ? fmt(p.cost) : "estimado"}</span>
                  <span style={{ fontFamily: "DM Mono, monospace", color: "var(--jungle)" }}>{fmt(p.profit)}</span>
                  <span style={{ color: p.hasCost ? "var(--jungle)" : "var(--ink-dim)" }}>{p.marginPctReal.toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div className="footer-note" style={{ marginTop: -8, marginBottom: 20 }}>
              <b>Nota —</b> itens sem custo cadastrado usam uma estimativa de 60% de margem. Cadastre o custo real na aba Cardápio para números exatos.
            </div>

            <div className="section-head"><h2>Visão geral</h2><div className="rule" /></div>
            <div className="cards">
              <div className="stat-card"><div className="stat-label">Faturamento (hambúrgueres)</div><div className="stat-value">{fmt(revenue)}</div></div>
              <div className="stat-card"><div className="stat-label">Lucro estimado</div><div className="stat-value">{fmt(profit)}</div></div>
              <div className="stat-card"><div className="stat-label">Pedidos registrados</div><div className="stat-value">{count}</div></div>
              <div className="stat-card"><div className="stat-label">Mais vendido</div><div style={{ fontSize: 15, fontWeight: 600 }}>{ranked[0]?.[0] || "—"}</div></div>
              <div className="stat-card"><div className="stat-label">Bebidas/acomp. vendidos</div><div className="stat-value" style={{ color: "var(--kraft)" }}>{extraCount}</div></div>
              <div className="stat-card"><div className="stat-label">Faturamento bebidas/acomp.</div><div className="stat-value" style={{ color: "var(--kraft)" }}>{fmt(extraRevenue)}</div></div>
            </div>

            <div className="section-head"><h2>Registrar venda — hambúrguer</h2><div className="rule" /></div>

            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: 20, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <select value={saleItemId} onChange={(e) => setSaleItemId(e.target.value)} style={{ flex: 2, minWidth: 180 }}>
                <option value="">selecione um item</option>
                {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name} — {fmt(m.price)}</option>)}
              </select>
              <input type="number" min={1} value={saleQty} onChange={(e) => setSaleQty(parseInt(e.target.value) || 1)}
                style={{ width: 90, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
              <button onClick={handleRegisterSale} style={{ background: "var(--mustard)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "11px 22px", borderRadius: 3, cursor: "pointer" }}>Registrar venda</button>
            </div>

            <div className="section-head"><h2>Registrar venda — bebida/acompanhamento</h2><div className="rule" /></div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: 20, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <select value={extraSaleId} onChange={(e) => setExtraSaleId(e.target.value)} style={{ flex: 2, minWidth: 180 }}>
                <option value="">selecione um item</option>
                {extras.map((ex) => <option key={ex.id} value={ex.id}>{ex.name} — {fmt(ex.price)} ({ex.category === "drink" ? "bebida" : "adicional"})</option>)}
              </select>
              <input type="number" min={1} value={extraSaleQty} onChange={(e) => setExtraSaleQty(parseInt(e.target.value) || 1)}
                style={{ width: 90, background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink)", padding: 10, borderRadius: 3 }} />
              <button onClick={handleRegisterExtraSale} style={{ background: "var(--kraft)", border: "none", color: "var(--charcoal)", fontWeight: 600, padding: "11px 22px", borderRadius: 3, cursor: "pointer" }}>Registrar venda</button>
            </div>

            <div className="section-head"><h2>Ranking de hambúrgueres</h2><div className="rule" /></div>
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

            <div className="section-head"><h2>Ranking de bebidas & acompanhamentos</h2><div className="rule" /></div>
            {extraRanked.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-dim)", fontStyle: "italic" }}>Nenhuma venda de bebida/acompanhamento registrada ainda.</p>}
            {extraRanked.map(([name, qty]) => {
              const pct = Math.round((qty / (extraRanked[0][1] || 1)) * 100);
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 140, fontSize: 13 }}>{name}</span>
                  <div style={{ flex: 1, background: "var(--charcoal-2)", height: 10, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--kraft)" }} />
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
                <div key={s.id} className="line" style={{ alignItems: "center" }}>
                  <span>{new Date(s.sold_at).toLocaleString("pt-BR")} — {s.quantity}x {s.item_name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="l-price">{fmt(s.unit_price * s.quantity)}</span>
                    <button onClick={() => handleDeleteSale(s.id)} style={{ background: "none", border: "none", color: "var(--ink-dim)", cursor: "pointer", fontSize: 16 }}>×</button>
                  </span>
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

      {confirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setConfirmModal(null)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card)", border: "1px solid var(--mustard)", borderRadius: 6, padding: "28px 30px", maxWidth: 360, width: "90%", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.6, marginBottom: 22 }}>{confirmModal.message}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setConfirmModal(null)}
                style={{ background: "var(--charcoal-2)", border: "1px solid var(--line)", color: "var(--ink-dim)", padding: "9px 18px", borderRadius: 3, cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                style={{ background: "var(--burnt)", border: "none", color: "var(--ink)", fontWeight: 600, padding: "9px 18px", borderRadius: 3, cursor: "pointer", fontSize: 13 }}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 60, padding: "24px 24px", textAlign: "center", fontSize: 12, color: "var(--ink-dim)" }}>
        {shopName} — painel de gestão interno. Desenvolvido por Kauã Gonçalves.
      </div>
    </div>
  );
}