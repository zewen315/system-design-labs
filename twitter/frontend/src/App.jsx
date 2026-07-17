import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { UserProvider, useUser } from "./context/UserContext";
import Sidebar from "./components/Sidebar";
import IdentityGate from "./pages/IdentityGate";
import Timeline from "./pages/Timeline";
import Profile from "./pages/Profile";
import Follow from "./pages/Follow";
import Search from "./pages/Search";
import Notifications from "./pages/Notifications";

function Gated() {
  const { currentUser } = useUser();
  if (!currentUser) return <IdentityGate />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Timeline />} />
          <Route path="/search" element={<Search />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/follow" element={<Follow />} />
          <Route path="/users/:userId" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Gated />
      </BrowserRouter>
    </UserProvider>
  );
}
