"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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
const CHART_COLORS = { mustard: "#e0ab48", kraft: "#efe6d2", ink: "#f6f1e8", inkDim: "#a79c8c", surface2: "#241d17", border: "rgba(255,255,255,0.1)" };

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
  const [orderBaseQtys, setOrderBaseQtys] = useState<Record<string, number>>({});
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
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9.\-_]/g, "-");
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
      category: item.category,
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

  const totalRevenue = revenue + extraRevenue;
  const totalOrders = count + extraCount;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const profitMarginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayKey = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const dayTotal = sales
      .filter((s) => new Date(s.sold_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) === dayKey)
      .reduce((sum, s) => sum + s.unit_price * s.quantity, 0);
    return { dia: dayKey, faturamento: dayTotal };
  });

  const revenueByItem: Record<string, number> = {};
  sales.forEach((s) => { revenueByItem[s.item_name] = (revenueByItem[s.item_name] || 0) + s.unit_price * s.quantity; });
  const topItemsByRevenue = Object.entries(revenueByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ nome: name.length > 14 ? name.slice(0, 14) + "…" : name, total }));

  const splitData = [
    { name: "Hambúrgueres", value: revenue },
    { name: "Bebidas/Acomp.", value: extraRevenue },
  ];
  const SPLIT_COLORS = [CHART_COLORS.mustard, CHART_COLORS.kraft];

  const itemPerformance = menuItems.map((item) => {
    const itemSales = burgerSales.filter((l) => l.item_id === item.id || l.item_name === item.name);
    const qty = itemSales.reduce((s, l) => s + l.quantity, 0);
    const itemRevenue = itemSales.reduce((s, l) => s + l.unit_price * l.quantity, 0);
    const itemCostTotal = item.cost != null ? item.cost * qty : null;
    const itemProfit = itemCostTotal != null ? itemRevenue - itemCostTotal : itemRevenue * 0.6;
    const marginPctReal = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;
    return { name: item.name, qty, revenue: itemRevenue, cost: itemCostTotal, profit: itemProfit, marginPctReal, hasCost: item.cost != null };
  }).sort((a, b) => b.revenue - a.revenue);

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

  const orderAddonsList = extras.filter((e) => e.category === "addon");
  const orderSidesList = extras.filter((e) => e.category === "drink");
  const chosenBases = menuItems
    .filter((m) => (orderBaseQtys[m.id] || 0) > 0)
    .map((m) => ({ ...m, qty: orderBaseQtys[m.id] }));
  const chosenAddons = orderAddonsList.filter((a) => orderSelectedAddons.has(a.id));
  const chosenSides = orderSidesList.filter((s) => orderSelectedSides.has(s.id));
  const orderTotal =
    chosenBases.reduce((s, b) => s + b.price * b.qty, 0) +
    chosenAddons.reduce((s, a) => s + a.price, 0) +
    chosenSides.reduce((s, i) => s + i.price, 0);
  const orderItemCount = chosenBases.reduce((s, b) => s + b.qty, 0) + chosenAddons.length + chosenSides.length;

  function setBaseQty(id: string, qty: number) {
    setOrderBaseQtys((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }
  function toggleBase(id: string) {
    setOrderBaseQtys((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  }
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
        <div className="mark-row">
          <img src="/logo.jpg" alt={shopName} className="logo-img" />
          <span className="mark">{shopName}</span>
        </div>
        <span>{new Date().toLocaleDateString("pt-BR")}</span>
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
            <div className="scroll-x">
              <div className="ingredient-row-grid head">
                <span>Ingrediente</span><span>Qtd</span><span>Unid.</span><span>Custo (R$)</span><span></span>
              </div>
              {ingredients.map((ing, i) => (
                <div key={i} className="ingredient-row-grid">
                  <input className="input" value={ing.name} onChange={(e) => updateIngredient(i, "name", e.target.value)} />
                  <input className="input" type="number" value={ing.qty === 0 ? "" : ing.qty} step="0.1" onChange={(e) => updateIngredient(i, "qty", e.target.value)} />
                  <select className="select input" value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)}>
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input className="input" type="number" value={ing.cost === 0 ? "" : ing.cost} step="0.01" onChange={(e) => updateIngredient(i, "cost", e.target.value)} />
                  <button className="icon-btn" onClick={() => removeIngredient(i)} style={{ fontSize: 18 }}>×</button>
                </div>
              ))}
            </div>
            <button className="btn-dashed" style={{ marginTop: 14 }}
              onClick={() => setIngredients((prev) => [...prev, { name: "Novo ingrediente", qty: 1, unit: "un", cost: 0 }])}>
              + adicionar ingrediente
            </button>

            <div className="section-head"><h2>Margem & custos fixos</h2><div className="rule" /></div>
            <div className="form-panel" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <label className="field-label">Margem de lucro desejada</label>
                <input type="range" min={20} max={300} step={5} value={marginPct} onChange={(e) => setMarginPct(parseInt(e.target.value))} style={{ width: "100%" }} />
                <div className="stat-value" style={{ marginTop: 10 }}>{marginPct}%</div>
              </div>
              <div>
                <label className="field-label">Custo fixo por unidade (embalagem, gás)</label>
                <input type="range" min={0} max={10} step={0.1} value={fixedCost} onChange={(e) => setFixedCost(parseFloat(e.target.value))} style={{ width: "100%" }} />
                <div className="stat-value" style={{ marginTop: 10 }}>{fmt(fixedCost)}</div>
              </div>
            </div>

            <div className="result-card">
              <div>
                <div className="r-label">Custo total do item</div>
                <div className="r-amount">{fmt(totalItemCost)}</div>
              </div>
              <div>
                <div className="r-label">Preço de venda sugerido</div>
                <div className="r-amount">{fmt(suggestedPrice)}</div>
                <div className="r-sub">lucro de {fmt(suggestedPrice - totalItemCost)} por unidade</div>
              </div>
            </div>
            <p className="hint" style={{ marginTop: 14 }}><b style={{ color: "var(--mustard)" }}>Dica —</b> depois de calcular, use esse valor no campo de preço ao cadastrar o item na aba Cardápio.</p>
          </div>
        )}

        {tab === "builder" && (
          <div className="panel">
            <div className="section-head"><h2>Base do pedido (itens do seu cardápio)</h2><div className="rule" /></div>
            <div className="cards">
              {menuItems.map((b) => {
                const qty = orderBaseQtys[b.id] || 0;
                return (
                  <div key={b.id} className={`card static ${qty > 0 ? "active" : ""}`}>
                    <div onClick={() => toggleBase(b.id)} style={{ cursor: "pointer" }}>
                      <div className="top-row"><span className="name">{b.name}</span><span className="dot" /></div>
                      {b.description && <div className="desc">{b.description}</div>}
                      <span className="price">{fmt(b.price)}</span>
                    </div>
                    {qty > 0 && (
                      <div className="qty-row">
                        <button className="qty-btn" onClick={() => setBaseQty(b.id, qty - 1)}>−</button>
                        <span className="qty-val">{qty}</span>
                        <button className="qty-btn" onClick={() => setBaseQty(b.id, qty + 1)}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {menuItems.length === 0 && <p className="hint">Cadastre itens na aba Cardápio primeiro.</p>}

            <div className="section-head"><h2>Gerenciar adicionais & bebidas</h2><div className="rule" /></div>
            <div className="form-panel form-row">
              <input className="input grow" placeholder="Nome (ex: Bacon extra)" value={newExtraName} onChange={(e) => setNewExtraName(e.target.value)} />
              <input className="input" placeholder="0,00" inputMode="numeric" value={newExtraPrice} onChange={(e) => setNewExtraPrice(formatPriceInput(e.target.value))} style={{ width: 100 }} />
              <select className="select" value={newExtraCategory} onChange={(e) => setNewExtraCategory(e.target.value as "addon" | "drink")}>
                <option value="addon">Adicional</option>
                <option value="drink">Bebida/acompanhamento</option>
              </select>
              <button className="btn btn-primary" onClick={handleAddExtra}>Adicionar</button>
            </div>

            <div className="section-head"><h2>Adicionais</h2><div className="rule" /></div>
            <div className="cards">
              {orderAddonsList.map((a) => (
                <div key={a.id} className={`card pad-right ${orderSelectedAddons.has(a.id) ? "active" : ""}`}>
                  <div onClick={() => toggleSet(setOrderSelectedAddons, a.id)}>
                    <div className="top-row"><span className="name">{a.name}</span><span className="dot" /></div>
                    <span className="price">+ {fmt(a.price)}</span>
                  </div>
                  <button className="remove-btn" onClick={(e) => { e.stopPropagation(); handleDeleteExtra(a.id); }}>✕</button>
                </div>
              ))}
            </div>
            {orderAddonsList.length === 0 && <p className="hint">Nenhum adicional cadastrado ainda.</p>}

            <div className="section-head"><h2>Bebida & acompanhamento</h2><div className="rule" /></div>
            <div className="cards">
              {orderSidesList.map((s) => (
                <div key={s.id} className={`card pad-right ${orderSelectedSides.has(s.id) ? "active" : ""}`}>
                  <div onClick={() => toggleSet(setOrderSelectedSides, s.id)}>
                    <div className="top-row"><span className="name">{s.name}</span><span className="dot" /></div>
                    <span className="price">+ {fmt(s.price)}</span>
                  </div>
                  <button className="remove-btn" onClick={(e) => { e.stopPropagation(); handleDeleteExtra(s.id); }}>✕</button>
                </div>
              ))}
            </div>
            {orderSidesList.length === 0 && <p className="hint">Nenhuma bebida/acompanhamento cadastrado ainda.</p>}

            {chosenBases.length > 0 && (
              <div className="ledger">
                <div className="ledger-head"><span>Composição do pedido</span><span>{orderItemCount} itens</span></div>
                {chosenBases.map((b) => <div key={b.id} className="line"><span>{b.qty}x {b.name}</span><span className="l-price">{fmt(b.price * b.qty)}</span></div>)}
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
            <div className="menu-form-grid">
              <div>
                <label className="field-label">Foto</label>
                <label className="photo-drop">
                  {newPhotoPreview ? (
                    <img src={newPhotoPreview} />
                  ) : (
                    <span className="photo-drop-label">clique para<br />enviar foto</span>
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
              <div className="menu-form-fields">
                <input className="input" placeholder="Nome do item" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <div className="price-desc-row">
                  <div className="input-prefixed">
                    <span className="prefix">R$</span>
                    <input className="input" placeholder="0,00" inputMode="numeric" value={newPrice} onChange={(e) => setNewPrice(formatPriceInput(e.target.value))} />
                  </div>
                  <input className="input flex-2" placeholder="Descrição curta" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                </div>
                <div className="input-prefixed wide" style={{ maxWidth: 200 }}>
                  <span className="prefix">Custo R$</span>
                  <input className="input" placeholder="0,00" inputMode="numeric" value={newCost} onChange={(e) => setNewCost(formatPriceInput(e.target.value))} />
                </div>
                <p className="hint">Opcional — use o valor calculado na aba Precificação para o painel mostrar o lucro real deste item.</p>
                <textarea className="textarea" placeholder="Ingredientes (ex: pão brioche, 150g carne, cheddar, molho da casa)" value={newIngredients} onChange={(e) => setNewIngredients(e.target.value)} rows={2} />
                {menuError && <div className="error-text">{menuError}</div>}
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={handleAddMenuItem} disabled={savingItem}>
                  {savingItem ? "Salvando..." : "Adicionar ao cardápio"}
                </button>
              </div>
            </div>

            <div className="section-head"><h2>Vitrine</h2><div className="rule" /></div>
            <div className="cards">
              {menuItems.map((item) => (
                <div key={item.id} className="card static showcase-card" style={{ position: "relative" }}>
                  <div className="showcase-photo">
                    {item.photo_url ? <img src={item.photo_url} /> : <span>sem foto</span>}
                  </div>
                  <div className="showcase-body">
                    <div className="showcase-title-row">
                      <span className="name">{item.name}</span>
                      <span className="perf-mono" style={{ color: "var(--mustard)" }}>{fmt(item.price)}</span>
                    </div>
                    {item.description && <div className="showcase-desc">{item.description}</div>}
                    {item.ingredients && <div className="showcase-ingredients">{item.ingredients}</div>}
                    {item.cost != null && (
                      <div className="showcase-cost">Custo: {fmt(item.cost)} · Lucro/unid.: {fmt(item.price - item.cost)}</div>
                    )}
                  </div>
                  <button className="remove-btn" onClick={() => handleDeleteMenuItem(item.id)}>×</button>
                </div>
              ))}
            </div>
            {menuItems.length === 0 && <p className="hint">Nenhum item adicionado ainda.</p>}
          </div>
        )}

        {tab === "admin" && (
          <div className="panel">
            <div className="section-head"><h2>Análises</h2><div className="rule" /></div>
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              <div className="stat-card"><div className="stat-label">Faturamento total</div><div className="stat-value">{fmt(totalRevenue)}</div></div>
              <div className="stat-card"><div className="stat-label">Ticket médio</div><div className="stat-value">{fmt(avgTicket)}</div></div>
              <div className="stat-card"><div className="stat-label">Total de pedidos</div><div className="stat-value">{totalOrders}</div></div>
              <div className="stat-card"><div className="stat-label">Margem (hambúrgueres)</div><div className="stat-value">{profitMarginPct.toFixed(0)}%</div></div>
            </div>

            <div className="charts-grid" style={{ marginBottom: 20 }}>
              <div className="chart-card">
                <div className="chart-title">Faturamento — últimos 7 dias</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={last7Days}>
                    <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: CHART_COLORS.inkDim, fontSize: 12 }} axisLine={{ stroke: CHART_COLORS.border }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_COLORS.inkDim, fontSize: 11 }} width={50} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={{ background: CHART_COLORS.surface2, border: `1px solid ${CHART_COLORS.border}`, borderRadius: 8, color: CHART_COLORS.ink }}
                      labelStyle={{ color: CHART_COLORS.inkDim }}
                      cursor={{ stroke: CHART_COLORS.mustard, strokeWidth: 1, strokeDasharray: "3 3" }}
                    />
                    <Line type="monotone" dataKey="faturamento" stroke={CHART_COLORS.mustard} strokeWidth={2.5} dot={{ fill: CHART_COLORS.mustard, r: 3.5 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <div className="chart-title">Hambúrguer × Bebida/Acomp.</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={splitData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} stroke="none">
                      {splitData.map((_, i) => <Cell key={i} fill={SPLIT_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: CHART_COLORS.surface2, border: `1px solid ${CHART_COLORS.border}`, borderRadius: 8, color: CHART_COLORS.ink }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  {splitData.map((d, i) => (
                    <div key={d.name}>
                      <span className="chart-legend-dot" style={{ background: SPLIT_COLORS[i] }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="section-head"><h2>Custo e lucro por item do cardápio</h2><div className="rule" /></div>
            <div className="ledger scroll-x" style={{ marginBottom: 20 }}>
              <div className="perf-table-row head">
                <span>Item</span><span>Qtd.</span><span>Faturamento</span><span>Custo total</span><span>Lucro</span><span>Margem</span>
              </div>
              {itemPerformance.length === 0 && <div className="line empty">Nenhum item cadastrado ainda.</div>}
              {itemPerformance.map((p) => (
                <div key={p.name} className="perf-table-row">
                  <span>{p.name}</span>
                  <span style={{ color: "var(--ink-dim)" }}>{p.qty}</span>
                  <span className="perf-mono">{fmt(p.revenue)}</span>
                  <span className="perf-mono" style={{ color: "var(--ink-dim)" }}>{p.cost != null ? fmt(p.cost) : "estimado"}</span>
                  <span className="perf-mono" style={{ color: "var(--jungle)" }}>{fmt(p.profit)}</span>
                  <span style={{ color: p.hasCost ? "var(--jungle)" : "var(--ink-dim)" }}>{p.marginPctReal.toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: -8, marginBottom: 20 }}>
              <b style={{ color: "var(--mustard)" }}>Nota —</b> itens sem custo cadastrado usam uma estimativa de 60% de margem. Cadastre o custo real na aba Cardápio para números exatos.
            </p>

            <div className="section-head"><h2>Visão geral</h2><div className="rule" /></div>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Faturamento (hambúrgueres)</div><div className="stat-value">{fmt(revenue)}</div></div>
              <div className="stat-card"><div className="stat-label">Lucro estimado</div><div className="stat-value">{fmt(profit)}</div></div>
              <div className="stat-card"><div className="stat-label">Pedidos registrados</div><div className="stat-value">{count}</div></div>
              <div className="stat-card"><div className="stat-label">Mais vendido</div><div className="stat-value small">{ranked[0]?.[0] || "—"}</div></div>
              <div className="stat-card"><div className="stat-label">Bebidas/acomp. vendidos</div><div className="stat-value alt">{extraCount}</div></div>
              <div className="stat-card"><div className="stat-label">Faturamento bebidas/acomp.</div><div className="stat-value alt">{fmt(extraRevenue)}</div></div>
            </div>

            <div className="section-head"><h2>Registrar venda — hambúrguer</h2><div className="rule" /></div>
            <div className="form-panel form-row">
              <select className="select grow" value={saleItemId} onChange={(e) => setSaleItemId(e.target.value)}>
                <option value="">selecione um item</option>
                {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name} — {fmt(m.price)}</option>)}
              </select>
              <input className="input" type="number" min={1} value={saleQty} onChange={(e) => setSaleQty(parseInt(e.target.value) || 1)} style={{ width: 90 }} />
              <button className="btn btn-primary" onClick={handleRegisterSale}>Registrar venda</button>
            </div>

            <div className="section-head"><h2>Registrar venda — bebida/acompanhamento</h2><div className="rule" /></div>
            <div className="form-panel form-row">
              <select className="select grow" value={extraSaleId} onChange={(e) => setExtraSaleId(e.target.value)}>
                <option value="">selecione um item</option>
                {extras.map((ex) => <option key={ex.id} value={ex.id}>{ex.name} — {fmt(ex.price)} ({ex.category === "drink" ? "bebida" : "adicional"})</option>)}
              </select>
              <input className="input" type="number" min={1} value={extraSaleQty} onChange={(e) => setExtraSaleQty(parseInt(e.target.value) || 1)} style={{ width: 90 }} />
              <button className="btn btn-secondary" onClick={handleRegisterExtraSale}>Registrar venda</button>
            </div>

            <div className="section-head"><h2>Ranking de hambúrgueres</h2><div className="rule" /></div>
            {ranked.length === 0 && <p className="hint">Nenhuma venda registrada ainda.</p>}
            {ranked.map(([name, qty]) => {
              const pct = Math.round((qty / (ranked[0][1] || 1)) * 100);
              return (
                <div key={name} className="rank-row">
                  <span className="rank-name">{name}</span>
                  <div className="rank-track"><div className="rank-fill" style={{ width: `${pct}%`, background: "var(--mustard)" }} /></div>
                  <span className="rank-qty">{qty} und.</span>
                </div>
              );
            })}

            <div className="section-head"><h2>Ranking de bebidas & acompanhamentos</h2><div className="rule" /></div>
            {extraRanked.length === 0 && <p className="hint">Nenhuma venda de bebida/acompanhamento registrada ainda.</p>}
            {extraRanked.map(([name, qty]) => {
              const pct = Math.round((qty / (extraRanked[0][1] || 1)) * 100);
              return (
                <div key={name} className="rank-row">
                  <span className="rank-name">{name}</span>
                  <div className="rank-track"><div className="rank-fill" style={{ width: `${pct}%`, background: "var(--kraft)" }} /></div>
                  <span className="rank-qty">{qty} und.</span>
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
                  <span className="line-actions">
                    <span className="l-price">{fmt(s.unit_price * s.quantity)}</span>
                    <button className="icon-btn" onClick={() => handleDeleteSale(s.id)}>×</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "assistant" && (
          <div className="panel">
            <div className="section-head"><h2>Assistente de precificação</h2><div className="rule" /></div>
            <p className="hint">Pergunte sobre margem, peça sugestão de nome/descrição, ou tire dúvidas de precificação.</p>
            <div className="chat-log">
              {chatHistory.map((m, i) => (
                <div key={i} className={`chat-bubble ${m.role === "user" ? "user" : "assistant"}`}>{m.content}</div>
              ))}
              {chatLoading && <div className="chat-thinking">Pensando...</div>}
            </div>
            <div className="chat-suggestions">
              {chatSuggestions.map((s) => (
                <button key={s} className="chip" onClick={() => sendChatMessage(s)}>{s}</button>
              ))}
            </div>
            <div className="chat-input-row">
              <input className="input" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder="Ex: essa margem tá boa pro clássico?" />
              <button className="btn btn-primary" onClick={() => sendChatMessage()}>Enviar</button>
            </div>
          </div>
        )}
      </div>

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-message">{confirmModal.message}</div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmModal(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}>Remover</button>
            </div>
          </div>
        </div>
      )}

      <div className="site-footer">
        {shopName} — painel de gestão interno. Desenvolvido por Kauã Gonçalves.
      </div>
    </div>
  );
}