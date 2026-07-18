import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { getUnreadNotificationCount } from "../api/client";
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

const UNREAD_POLL_INTERVAL_MS = 20000;

export default function Sidebar() {
  const { currentUser, switchUser } = useUser();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    async function refresh() {
      try {
        const { unread_count } = await getUnreadNotificationCount(currentUser.id);
        if (!cancelled) setUnreadCount(unread_count);
      } catch {
        // Best-effort — a failed poll just leaves the last known badge count showing.
      }
    }

    // Also fires on every route change so the badge clears right away once
    // the Notifications page marks things read, instead of waiting for the
    // next interval tick — this app has no push infra, so polling is the
    // whole mechanism and it's worth not making it feel laggier than it has to.
    refresh();
    const interval = setInterval(refresh, UNREAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, location.pathname]);

  if (!currentUser) return null;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar__logo" end>
        Twitter Lab
      </NavLink>

      <nav className="sidebar__nav">
        {LINKS.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="sidebar__icon-wrap">
              <Icon className="sidebar__icon" />
              {to === "/notifications" && unreadCount > 0 && (
                <span className="sidebar__badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </span>
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
