import { NavLink } from "react-router-dom";
import { useUser } from "../context/UserContext";

const LINKS = [
  { to: "/", label: "Timeline", end: true },
  { to: "/search", label: "Search" },
  { to: "/notifications", label: "Notifications" },
  { to: "/follow", label: "Follow" },
];

export default function Sidebar() {
  const { currentUser, switchUser } = useUser();
  if (!currentUser) return null;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar__logo" end>
        Twitter Lab
      </NavLink>

      <nav className="sidebar__nav">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {link.label}
          </NavLink>
        ))}
        <NavLink
          to={`/users/${currentUser.id}`}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Profile
        </NavLink>
      </nav>

      <div className="sidebar__user">
        {currentUser.avatar_url ? (
          <img src={currentUser.avatar_url} alt="" className="sidebar__avatar" />
        ) : (
          <div className="sidebar__avatar sidebar__avatar--placeholder">
            {currentUser.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="sidebar__identity">
          <strong>{currentUser.display_name}</strong>
          <span>@{currentUser.username}</span>
        </div>
        <button type="button" onClick={switchUser}>
          Switch user
        </button>
      </div>
    </aside>
  );
}
