import { useEffect, useRef, useState } from "react";
import { notebookDb, isDemo } from "../data/client";
import { createTeamAccessStore } from "../data/team-access-store";
import { inviteLink } from "../data/invite-link";

const store = createTeamAccessStore(notebookDb);

// Managers create shareable links, revoke them, and change existing members' roles.
export default function TeamAccess({ management, notebookActions }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [invites, setInvites] = useState([]);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const epoch = useRef(0);
  const busy = useRef(false);
  const member = management.member;
  const isManager = management.isManager;

  const errorMessage = (error) =>
    ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code)
      ? "Team access isn't set up yet. Run the team-invitations SQL in Supabase."
      : error.message || "Could not update team access. Try again.";

  useEffect(() => {
    const request = ++epoch.current;
    busy.current = false;
    setWorking(false);
    setInvites([]);
    setLink("");
    setMessage("");
    if (expanded && isManager && member) {
      busy.current = true;
      setWorking(true);
      store
        .list(member.team_id)
        .then((items) => {
          if (epoch.current === request) setInvites(items);
        })
        .catch((error) => {
          if (epoch.current === request) setMessage(errorMessage(error));
        })
        .finally(() => {
          if (epoch.current === request) {
            busy.current = false;
            setWorking(false);
          }
        });
    }
    return () => {
      ++epoch.current;
    };
  }, [
    expanded,
    isManager,
    member?.team_id,
    member?.user_id,
    management.members,
  ]);

  async function run(operation) {
    if (busy.current || !isManager) return;
    const request = epoch.current;
    busy.current = true;
    setWorking(true);
    setMessage("");
    try {
      await operation(() => epoch.current === request);
      if (epoch.current !== request) return;
      const items = await store.list(member.team_id);
      if (epoch.current === request) setInvites(items);
    } catch (error) {
      if (epoch.current === request) setMessage(errorMessage(error));
    } finally {
      if (epoch.current === request) {
        busy.current = false;
        setWorking(false);
      }
    }
  }

  if (!isManager || isDemo) return null;
  const pending = invites.filter(
    (item) =>
      !item.revoked_at &&
      !item.accepted_at &&
      new Date(item.expires_at) > new Date(),
  );
  return (
    <details
      className="team-access"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Manage team</summary>
      <div className="team-access-content">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(async (current) => {
              const token = await store.invite(email, role);
              if (current()) {
                setLink(inviteLink(token));
                setEmail("");
              }
            });
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              disabled={working}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Access
            <select
              aria-label="Invite access"
              value={role}
              disabled={working}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <button className="notebook-button" disabled={working}>
            Create invite
          </button>
        </form>
        {link && (
          <div className="invite-result">
            <label>
              Invite link
              <input
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMessage("Link copied. Share it with the invited person.");
                } catch {
                  setMessage("Select and copy the invite link above.");
                }
              }}
            >
              Copy link
            </button>
            <small>For the invited email only. Expires in 7 days.</small>
          </div>
        )}
        {pending.length > 0 && (
          <ul className="team-invites">
            {pending.map((item) => (
              <li key={item.id}>
                <span>
                  {item.email}
                  <small>{item.role}</small>
                </span>
                <div className="invite-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={working}
                    aria-label={`Show invite link for ${item.email}`}
                    onClick={() => setLink(inviteLink(item.token))}
                  >
                    Link
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={working}
                    aria-label={`Revoke invite for ${item.email}`}
                    onClick={() =>
                      run(async (current) => {
                        await store.revoke(item.id);
                        if (current()) {
                          setLink("");
                          setMessage("Invitation revoked.");
                        }
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="team-access-members">
          {management.members.map((person) => (
            <div key={person.user_id} className="team-member-access">
              <label>
                {person.display_name}
                <select
                  aria-label={`Access for ${person.display_name}`}
                  value={person.role}
                  disabled={working || management.busy}
                  onChange={(event) => {
                    const nextRole = event.target.value;
                    if (
                      nextRole === "manager" &&
                      !window.confirm(
                        `Give ${person.display_name} manager access? They will be able to invite people and change team access.`,
                      )
                    )
                      return;
                    if (
                      person.user_id === member.user_id &&
                      nextRole === "member" &&
                      !window.confirm(
                        "Change your own access to member? You will lose team management controls.",
                      )
                    )
                      return;
                    run(async (current) => {
                      await store.setRole(person, nextRole);
                      if (!current()) return;
                      setMessage("Access updated.");
                      if (person.user_id === member.user_id)
                        await notebookActions.retry();
                      else await management.refresh();
                    });
                  }}
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
              <button
                type="button"
                className="text-button danger"
                disabled={working || management.busy}
                aria-label={`Remove ${person.display_name} from team`}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Remove ${person.display_name} from this team? They will lose access. Team documents will be kept.`,
                    )
                  )
                    return;
                  run(async (current) => {
                    await store.removeMember(person);
                    if (!current()) return;
                    if (person.user_id === member.user_id)
                      await notebookActions.retry();
                    else await management.refresh();
                  });
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </details>
  );
}
