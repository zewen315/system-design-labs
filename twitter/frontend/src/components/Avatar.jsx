export default function Avatar({ user, size = 40 }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (user.avatar_url) {
    return <img src={user.avatar_url} alt="" className="avatar" style={style} />;
  }

  return (
    <div className="avatar avatar--placeholder" style={style}>
      {user.display_name.charAt(0).toUpperCase()}
    </div>
  );
}
