import { useState } from "react";

export default function ComposeBox({ placeholder = "What's happening?", buttonLabel = "Tweet", onSubmit }) {
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(content.trim());
      setContent("");
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="compose-box" onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={280}
        rows={3}
      />
      <div className="compose-box__footer">
        <span className="compose-box__count">{content.length}/280</span>
        <button type="submit" disabled={pending || !content.trim()}>
          {pending ? "Posting..." : buttonLabel}
        </button>
      </div>
      {error && <p className="compose-box__error">{error}</p>}
    </form>
  );
}
