export default function Notifications() {
  return (
    <div className="page">
      <h2>Notifications</h2>
      <p className="placeholder-note">
        Not built yet — there's no notification system in the backend. This is a real
        system-design feature on its own (likely event-driven, hooking into likes, replies,
        and follows the same way the timeline's fan-out worker does), worth its own design
        pass rather than bolting on here.
      </p>
    </div>
  );
}
