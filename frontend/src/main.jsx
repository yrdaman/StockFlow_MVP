import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
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
      <h2>{product ? "Edit product" : "Add product"}</h2>
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

function Inventory({ user, onLogout }) {
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
    <main className="inventory-page">
      <header className="topbar">
        <div><h1 className="title">StockFlow</h1><p>{user.organization.name} · {user.email}</p></div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </header>
      <section className="content">
        <div className="toolbar">
          <input aria-label="Search products" placeholder="Search by name or SKU" value={search} onChange={(event) => { setSearch(event.target.value); loadProducts(event.target.value); }} />
          <button onClick={() => { setEditing(null); setShowForm(true); }}>Add product</button>
        </div>
        {showForm && <ProductForm product={editing} onSave={saved} onCancel={() => { setShowForm(false); setEditing(null); }} />}
        {error && <p className="error">{error}</p>}
        {loading ? <p>Loading products...</p> : products.length === 0 ? <p className="empty">No products found.</p> : (
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
    <h1 className="title">{mode === "login" ? "Sign in" : "Create account"}</h1>
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
  return user ? <Inventory user={user} onLogout={logout} /> : <Auth onAuthenticated={setUser} />;
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
