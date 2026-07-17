import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useUser } from "../context/UserContext";
import Avatar from "./Avatar";
import ConfirmDialog from "./ConfirmDialog";
import { BellIcon, HomeIcon, LogOutIcon, PeopleIcon, PersonIcon, SearchIcon } from "./icons";

const LINKS = [
  { to: "/", label: "Timeline", end: true, Icon: HomeIcon },
  { to: "/search", label: "Search", Icon: SearchIcon },
  { to: "/notifications", label: "Notifications", Icon: BellIcon },
  { to: "/follow", label: "Follow", Icon: PeopleIcon },
];

export default function Sidebar() {
  const { currentUser, switchUser } = useUser();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  if (!currentUser) return null;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar__logo" end>
        Twitter Lab
      </NavLink>

      <nav className="sidebar__nav">
        {LINKS.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon className="sidebar__icon" />
            <span className="sidebar__label">{label}</span>
          </NavLink>
        ))}
        <NavLink
          to={`/users/${currentUser.id}`}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          <PersonIcon className="sidebar__icon" />
          <span className="sidebar__label">Profile</span>
        </NavLink>
        <button type="button" onClick={() => setConfirmingLogout(true)}>
          <LogOutIcon className="sidebar__icon" />
          <span className="sidebar__label">Log out</span>
        </button>
      </nav>

      <Link to={`/users/${currentUser.id}`} className="sidebar__user">
        <Avatar user={currentUser} size={40} />
        <div className="sidebar__identity">
          <strong>{currentUser.display_name}</strong>
          <span>@{currentUser.username}</span>
        </div>
      </Link>

      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        message={`You'll need to pick @${currentUser.username} (or another user) again to get back in.`}
        confirmLabel="Log out"
        onConfirm={switchUser}
        onCancel={() => setConfirmingLogout(false)}
      />
    </aside>
  );
}
