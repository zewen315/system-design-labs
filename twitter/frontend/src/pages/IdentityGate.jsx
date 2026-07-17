import { useState } from "react";
import { createUser, getUserByUsername } from "../api/client";
import { useUser } from "../context/UserContext";

export default function IdentityGate() {
  const { setCurrentUser } = useUser();
  const [mode, setMode] = useState("existing");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleExisting(e) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const user = await getUserByUsername(username.trim());
      setCurrentUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const user = await createUser({ username: username.trim(), displayName: displayName.trim() });
      setCurrentUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="identity-gate">
      <div className="identity-card">
        <h1>Twitter Lab</h1>
        <p className="identity-subtitle">
          No real auth here — pick an existing username or create a new one.
        </p>

        <div className="identity-tabs">
          <button
            className={mode === "existing" ? "active" : ""}
            onClick={() => setMode("existing")}
            type="button"
          >
            Use existing user
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
            type="button"
          >
            Create new user
          </button>
        </div>

        {mode === "existing" ? (
          <form onSubmit={handleExisting}>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. carol"
                required
              />
            </label>
            <button type="submit" disabled={pending}>
              {pending ? "Loading..." : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate}>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. carol"
                required
              />
            </label>
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Carol Danvers"
                required
              />
            </label>
            <button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create & continue"}
            </button>
          </form>
        )}

        {error && <p className="identity-error">{error}</p>}
      </div>
    </div>
  );
}
