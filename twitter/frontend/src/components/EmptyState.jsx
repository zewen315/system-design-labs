export default function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 120 120" className="empty-state__illustration">
        <circle cx="60" cy="60" r="46" fill="none" stroke="#d4d4d8" strokeWidth="2" strokeDasharray="6 8" />
        <circle cx="46" cy="54" r="4" fill="#a1a1aa" />
        <circle cx="74" cy="54" r="4" fill="#a1a1aa" />
        <path d="M46 74c4 6 24 6 28 0" stroke="#a1a1aa" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
      <p>{message}</p>
    </div>
  );
}
