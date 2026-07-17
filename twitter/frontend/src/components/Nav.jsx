import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";

export default function Nav() {
  const { currentUser, switchUser } = useUser();
  if (!currentUser) return null;

  return (
    <nav className="nav">
      <Link to="/" className="nav__logo">
        Twitter Lab
      </Link>
      <div className="nav__right">
        <Link to={`/users/${currentUser.id}`}>@{currentUser.username}</Link>
        <button type="button" onClick={switchUser}>
          Switch user
        </button>
      </div>
    </nav>
  );
}
