import { useEffect, useState } from "react";
import { createUser, getRandomUsers, getUserByUsername } from "../api/client";
import { useUser } from "../context/UserContext";
import Avatar from "../components/Avatar";

export default function IdentityGate() {
  const { setCurrentUser } = useUser();
  const [mode, setMode] = useState("existing");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  useEffect(() => {
    getRandomUsers({ limit: 3 })
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, []);

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
          No real auth here — pick an existing user ID or create a new one.
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
          <>
            {!suggestionsLoading && suggestions.length > 0 && (
              <>
                <p className="identity-random-note">3 users, picked at random:</p>
                <ul className="identity-suggestions">
                  {suggestions.map((user) => (
                    <li key={user.id}>
                      <button type="button" onClick={() => setCurrentUser(user)}>
                        <Avatar user={user} size={36} />
                        <span className="identity-suggestions__names">
                          <strong>{user.display_name}</strong>
                          <span>@{user.username}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="identity-divider">
              {suggestionsLoading || suggestions.length > 0
                ? "Or enter a user ID directly"
                : "No users yet — enter a user ID"}
            </p>

            <form onSubmit={handleExisting}>
              <label>
                User ID
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
          </>
        ) : (
          <form onSubmit={handleCreate}>
            <label>
              User ID
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
