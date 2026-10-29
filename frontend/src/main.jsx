import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const apiUrl = import.meta.env.PROD
  ? "https://stockflow-mvp-jve2.onrender.com"
  : (import.meta.env.VITE_API_URL || "http://localhost:3000");
const emptyProduct = {
  name: "",
  sku: "",
  description: "",
  quantity: 0,
  costPrice: "",
  sellingPrice: "",
  lowStockThreshold: "",
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include", ...options });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || "Request failed.");
  return body;
}

async function csrfToken() {
  return (await apiRequest("/api/auth/csrf-token")).csrfToken;
}

function ProductForm({ product, onSave, onCancel }) {
  const [form, setForm] = useState(product || emptyProduct);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const token = await csrfToken();
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        costPrice: form.costPrice === "" ? null : Number(form.costPrice),
        sellingPrice: form.sellingPrice === "" ? null : Number(form.sellingPrice),
        lowStockThreshold: form.lowStockThreshold === "" ? null : Number(form.lowStockThreshold),
      };
      const result = await apiRequest(product ? `/api/products/${product.id}` : "/api/products", {
        method: product ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(payload),
      });
      onSave(result.product);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel product-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <p className="eyebrow">{product ? "Product details" : "New inventory item"}</p>
          <h2>{product ? "Edit product" : "Add product"}</h2>
        </div>
      </div>
      <label>Name<input required maxLength="200" value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
      <label>SKU<input required maxLength="100" value={form.sku} onChange={(event) => update("sku", event.target.value)} /></label>
      <label>Description<textarea maxLength="2000" value={form.description || ""} onChange={(event) => update("description", event.target.value)} /></label>
      <div className="form-grid">
        <label>Quantity<input required min="0" step="1" type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} /></label>
        <label>Low-stock threshold<input min="0" step="1" type="number" value={form.lowStockThreshold ?? ""} onChange={(event) => update("lowStockThreshold", event.target.value)} /></label>
        <label>Cost price<input min="0" step="0.01" type="number" value={form.costPrice ?? ""} onChange={(event) => update("costPrice", event.target.value)} /></label>
        <label>Selling price<input min="0" step="0.01" type="number" value={form.sellingPrice ?? ""} onChange={(event) => update("sellingPrice", event.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button disabled={saving} type="submit">{saving ? "Saving..." : "Save product"}</button>
        {onCancel && <button className="secondary" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function Navigation({ view, setView }) {
  return <nav className="navigation">
    <button className={view === "dashboard" ? "nav-active" : "secondary"} onClick={() => setView("dashboard")}>Dashboard</button>
    <button className={view === "inventory" ? "nav-active" : "secondary"} onClick={() => setView("inventory")}>Inventory</button>
    <button className={view === "settings" ? "nav-active" : "secondary"} onClick={() => setView("settings")}>Settings</button>
  </nav>;
}

function Dashboard({ user, onLogout, setView }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/api/dashboard")
      .then(setData)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="brand">StockFlow</p><p className="account-context">{user.organization.name} <span>·</span> {user.email}</p></div>
      <button className="secondary" onClick={onLogout}>Log out</button>
    </header>
    <Navigation view="dashboard" setView={setView} />
    <section className="content">
      <div className="page-heading"><p className="eyebrow">Overview</p><h1>Dashboard</h1><p className="page-description">A quick view of your organization’s current inventory.</p></div>
      {loading && <p className="status-message">Loading dashboard...</p>}
      {error && <p className="error status-message">{error}</p>}
      {data && <><div className="stats-grid">
        <div className="stat-card"><span className="metric-label">Total products</span><strong>{data.totalProducts}</strong><span className="metric-note">Across your catalog</span></div>
        <div className="stat-card"><span className="metric-label">Total stock quantity</span><strong>{data.totalQuantity}</strong><span className="metric-note">Units currently on hand</span></div>
        <div className="stat-card"><span className="metric-label">Low-stock products</span><strong className={data.lowStockCount ? "metric-alert" : ""}>{data.lowStockCount}</strong><span className="metric-note">{data.lowStockCount ? "Needs attention" : "Everything looks healthy"}</span></div>
      </div>
      <section className="panel low-stock-panel">
        <div className="section-heading"><div><p className="eyebrow">Inventory health</p><h2>Low-stock products</h2></div><span className="section-count">{data.lowStockCount} items</span></div>
        {data.lowStockProducts.length === 0 ? <p className="empty status-message">No low-stock products.</p> : <div className="table-wrap">
          <table><thead><tr><th>Name</th><th>SKU</th><th>Quantity</th><th>Effective threshold</th></tr></thead>
            <tbody>{data.lowStockProducts.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.sku}</td><td>{product.quantity}</td><td>{product.effectiveThreshold}</td></tr>)}</tbody>
          </table>
        </div>}
      </section></>}
    </section>
  </main>;
}

function Inventory({ user, onLogout, setView }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadProducts(value = search) {
    setLoading(true);
    try {
      const result = await apiRequest(`/api/products${value ? `?search=${encodeURIComponent(value)}` : ""}`);
      setProducts(result.products);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProducts(""); }, []);

  async function changeQuantity(product) {
    const quantity = window.prompt("New quantity", String(product.quantity));
    if (quantity === null) return;
    try {
      const token = await csrfToken();
      const result = await apiRequest(`/api/products/${product.id}/quantity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ quantity: Number(quantity) }),
      });
      setProducts(products.map((item) => item.id === product.id ? result.product : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function remove(product) {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    try {
      const token = await csrfToken();
      await apiRequest(`/api/products/${product.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": token },
      });
      setProducts(products.filter((item) => item.id !== product.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function saved(product) {
    setProducts(editing ? products.map((item) => item.id === product.id ? product : item) : [product, ...products]);
    setEditing(null);
    setShowForm(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="brand">StockFlow</p><p className="account-context">{user.organization.name} <span>·</span> {user.email}</p></div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </header>
      <Navigation view="inventory" setView={setView} />
      <section className="content">
          <div className="page-heading"><p className="eyebrow">Catalog</p><h1>Inventory</h1><p className="page-description">Manage products, quantities, and stock health in one place.</p></div>
          <div className="toolbar">
            <div className="search-wrap"><span className="search-icon">⌕</span><input aria-label="Search products" placeholder="Search by name or SKU" value={search} onChange={(event) => { setSearch(event.target.value); loadProducts(event.target.value); }} /></div>
            <button className="primary-action" onClick={() => { setEditing(null); setShowForm(true); }}>Add product</button>
          </div>
          {showForm && <ProductForm product={editing} onSave={saved} onCancel={() => { setShowForm(false); setEditing(null); }} />}
          {error && <p className="error status-message">{error}</p>}
          {loading ? <p className="status-message">Loading products...</p> : products.length === 0 ? <p className="empty status-message">{search ? "No products match your search." : "No products found yet."}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>SKU</th><th>Quantity</th><th>Stock</th><th>Selling price</th><th>Actions</th></tr></thead>
              <tbody>{products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td><td>{product.sku}</td><td>{product.quantity}</td>
                  <td><span className={product.isLowStock ? "badge low" : "badge"}>{product.isLowStock ? "Low stock" : "In stock"}</span></td>
                  <td>{product.sellingPrice == null ? "—" : product.sellingPrice.toFixed(2)}</td>
                  <td className="row-actions"><button onClick={() => changeQuantity(product)}>Quantity</button><button onClick={() => { setEditing(product); setShowForm(true); }}>Edit</button><button className="danger" onClick={() => remove(product)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Settings({ user, onLogout, setView }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/api/settings")
      .then((result) => setValue(String(result.defaultThreshold)))
      .catch((requestError) => setError(requestError.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const token = await csrfToken();
      const result = await apiRequest("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ defaultThreshold: Number(value) }),
      });
      setValue(String(result.defaultThreshold));
      setMessage("Saved.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="brand">StockFlow</p><p className="account-context">{user.organization.name} <span>·</span> {user.email}</p></div>
      <button className="secondary" onClick={onLogout}>Log out</button>
    </header>
    <Navigation view="settings" setView={setView} />
    <section className="content">
      <div className="page-heading"><p className="eyebrow">Preferences</p><h1>Settings</h1><p className="page-description">Used when a product has no threshold of its own.</p></div>
      <form className="panel product-form" onSubmit={save}>
        <label>Default low-stock threshold
          <input required min="0" step="1" type="number" value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        {message && <p className="status-message">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="actions"><button type="submit">Save</button></div>
      </form>
    </section>
  </main>;
}

function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", organizationName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const token = await csrfToken();
      const result = await apiRequest(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(form),
      });
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return <main className="page"><form className="panel auth-form" onSubmit={submit}>
    <p className="brand">StockFlow</p><h1 className="title">{mode === "login" ? "Sign in" : "Create account"}</h1>
    <input required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
    <input required minLength="8" type="password" placeholder="Password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
    {mode === "signup" && <input required placeholder="Organization name" value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} />}
    {error && <p className="error">{error}</p>}
    <button disabled={loading} type="submit">{loading ? "Working..." : mode === "login" ? "Sign in" : "Sign up"}</button>
    <button className="link" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "Need an account?" : "Already have an account?"}</button>
  </form></main>;
}

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/api/auth/me").then((result) => setUser(result.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function logout() {
    const token = await csrfToken();
    await apiRequest("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": token } });
    setUser(null);
  }

  if (loading) return <main className="page">Loading...</main>;
  if (!user) return <Auth onAuthenticated={(authenticatedUser) => { setUser(authenticatedUser); setView("dashboard"); }} />;
  if (view === "dashboard") return <Dashboard user={user} onLogout={logout} setView={setView} />;
  if (view === "settings") return <Settings user={user} onLogout={logout} setView={setView} />;
  return <Inventory user={user} onLogout={logout} setView={setView} />;
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);