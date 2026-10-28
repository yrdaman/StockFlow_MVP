import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "./style.css";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", organizationName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function getCsrfToken() {
    const response = await fetch(`${apiUrl}/api/auth/csrf-token`, { credentials: "include" });
    return (await response.json()).csrfToken;
  }

  useEffect(() => {
    fetch(`${apiUrl}/api/auth/me`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`${apiUrl}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUser(data.user);
    } catch (requestError) {
      setError(requestError.message || "Unable to complete request.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const csrfToken = await getCsrfToken();
    await fetch(`${apiUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      credentials: "include",
    });
    setUser(null);
  }

  if (loading) return <main className="page">Loading...</main>;
  if (user) {
    return (
      <main className="page">
        <section className="card">
          <h1 className="title">StockFlow</h1>
          <p>Signed in as {user.email}</p>
          <p>Organization: {user.organization.name}</p>
          <button onClick={logout}>Log out</button>
        </section>
      </main>
    );
  }
  return (
    <main className="page">
      <form className="card" onSubmit={submit}>
        <h1 className="title">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <input required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input required minLength="8" type="password" placeholder="Password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        {mode === "signup" && <input required placeholder="Organization name" value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} />}
        {error && <p className="error">{error}</p>}
        <button disabled={loading} type="submit">{loading ? "Working..." : mode === "login" ? "Sign in" : "Sign up"}</button>
        <button className="link" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
