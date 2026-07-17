import { Link } from "react-router-dom";
import Avatar from "./Avatar";
import EmptyState from "./EmptyState";

export default function PeopleList({ people, followingIds, pendingId, onToggle, emptyLabel, viewerId }) {
  if (people.length === 0) return <EmptyState message={emptyLabel} />;

  return (
    <ul className="people-list">
      {people.map((person) => (
        <li key={person.id}>
          <Link to={`/users/${person.id}`} className="people-list__identity">
            <Avatar user={person} size={40} />
            <span className="people-list__names">
              <strong>{person.display_name}</strong>
              <span>@{person.username}</span>
            </span>
          </Link>
          {person.id !== viewerId && (
            <button type="button" onClick={() => onToggle(person.id)} disabled={pendingId === person.id}>
              {followingIds.has(person.id) ? "Unfollow" : "Follow"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
