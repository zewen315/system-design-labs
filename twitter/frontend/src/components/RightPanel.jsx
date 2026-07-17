import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { followUser, getRandomUsers, listFollowing, unfollowUser } from "../api/client";
import { useUser } from "../context/UserContext";
import PeopleList from "./PeopleList";
import { GitHubIcon, GlobeIcon, LinkedInIcon } from "./icons";

const GITHUB_REPO_URL = "https://github.com/zewen315/system-design-labs";
const DEVELOPER_SITE_URL = "https://zewenw.com/";
const DEVELOPER_GITHUB_URL = "https://github.com/zewen315/";
const DEVELOPER_LINKEDIN_URL = "https://www.linkedin.com/in/zewenw/";

export default function RightPanel() {
  const { currentUser } = useUser();
  const [suggested, setSuggested] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [pendingId, setPendingId] = useState(null);

  const load = useCallback(async () => {
    const following = await listFollowing(currentUser.id);
    const idSet = new Set(following.map((u) => u.id));
    setFollowingIds(idSet);
    setSuggested(await getRandomUsers({ limit: 3, exclude: [currentUser.id, ...idSet] }));
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFollow(userId) {
    setPendingId(userId);
    try {
      if (followingIds.has(userId)) {
        await unfollowUser(currentUser.id, userId);
      } else {
        await followUser(currentUser.id, userId);
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <aside className="right-panel">
      <div className="widget-card">
        <h3>About this site</h3>
        <p className="widget-card__text">
          Twitter Lab is a system design practice project — a handful of microservices, an
          event-driven timeline fan-out, and self-hosted object storage, all built to demonstrate
          real architectural trade-offs.
        </p>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="widget-card__link">
          <GitHubIcon className="widget-card__icon" />
          View the code
        </a>
      </div>

      <div className="widget-card">
        <h3>Developer</h3>
        <p className="widget-card__text">
          Zewen Wang is a software engineer building backend systems, infrastructure tools, and
          small runnable experiments — previously a Production Engineer at Meta, working across
          software engineering, networking, reliability, and production infrastructure.
        </p>
        <a href={DEVELOPER_SITE_URL} target="_blank" rel="noreferrer" className="widget-card__link">
          <GlobeIcon className="widget-card__icon" />
          zewenw.com
        </a>
        <a href={DEVELOPER_GITHUB_URL} target="_blank" rel="noreferrer" className="widget-card__link">
          <GitHubIcon className="widget-card__icon" />
          GitHub
        </a>
        <a href={DEVELOPER_LINKEDIN_URL} target="_blank" rel="noreferrer" className="widget-card__link">
          <LinkedInIcon className="widget-card__icon" />
          LinkedIn
        </a>
      </div>

      <div className="widget-card">
        <h3>Who to follow</h3>
        <PeopleList
          people={suggested}
          followingIds={followingIds}
          pendingId={pendingId}
          onToggle={toggleFollow}
          emptyLabel="No one new to suggest right now."
          viewerId={currentUser.id}
        />
        <Link to="/follow" className="widget-card__more">
          Show more
        </Link>
      </div>
    </aside>
  );
}
