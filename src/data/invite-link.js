const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function inviteToken(value) {
  const text = value.trim();
  if (uuid.test(text)) return text;
  try {
    const token = new URLSearchParams(new URL(text).hash.slice(1)).get(
      "invite",
    );
    return token && uuid.test(token) ? token : "";
  } catch {
    return "";
  }
}
export function pendingInvite() {
  const token = new URLSearchParams(location.hash.slice(1)).get("invite");
  try {
    if (token && uuid.test(token)) {
      sessionStorage.setItem("notebook.pending-invite", token);
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#overview",
      );
      return token;
    }
    return sessionStorage.getItem("notebook.pending-invite") || "";
  } catch {
    return token && uuid.test(token) ? token : "";
  }
}
export function clearInvite() {
  try {
    sessionStorage.removeItem("notebook.pending-invite");
  } catch {
    /* Optional navigation state. */
  }
}
export function inviteLink(token) {
  return location.origin + location.pathname + "#invite=" + token;
}
