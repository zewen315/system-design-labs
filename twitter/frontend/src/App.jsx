import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { UserProvider, useUser } from "./context/UserContext";
import Nav from "./components/Nav";
import IdentityGate from "./pages/IdentityGate";
import Timeline from "./pages/Timeline";
import TweetDetail from "./pages/TweetDetail";
import Profile from "./pages/Profile";

function Gated() {
  const { currentUser } = useUser();
  if (!currentUser) return <IdentityGate />;

  return (
    <>
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Timeline />} />
          <Route path="/tweets/:tweetId" element={<TweetDetail />} />
          <Route path="/users/:userId" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
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
