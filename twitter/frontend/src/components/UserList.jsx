import { Link } from "react-router-dom";
import Avatar from "./Avatar";

export default function UserList({ users, emptyLabel = "No users yet." }) {
  if (users.length === 0) return <p className="user-list__empty">{emptyLabel}</p>;

  return (
    <ul className="user-list">
      {users.map((user) => (
        <li key={user.id}>
          <Link to={`/users/${user.id}`}>
            <Avatar user={user} size={40} />
            <span className="user-list__names">
              <strong>{user.display_name}</strong>
              <span>@{user.username}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
