// Loads and saves tasks/resources. Components call these actions instead of making database requests.
import { useCallback, useEffect, useRef, useState } from "react";
import { notebookDb } from "../data/client";
import { createManagementStore } from "../data/management-store";

const store = createManagementStore(notebookDb);
const empty = {
  members: [],
  items: [],
  ready: false,
  busy: false,
  message: "",
  error: false,
};

export function useManagement(member) {
  const [state, setState] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState("");
  const epoch = useRef(0);
  const busy = useRef(false);
  const currentMember = useRef(member);
  // Update during render as well, so a request cannot publish into a new session.
  currentMember.current = member;
  const effectiveMember =
    state.members.find((person) => person.user_id === member?.user_id) ||
    member;
  const isManager = effectiveMember?.role === "manager";
  const canEditTask = (task) =>
    Boolean(member && (isManager || task?.data.assignee === member.user_id));

  const refresh = useCallback(async () => {
    if (!member || busy.current) return;
    const requestEpoch = epoch.current;
    busy.current = true;
    setState((s) => ({
      ...s,
      busy: true,
      message: "Loading your team's plan…",
      error: false,
    }));
    try {
      const [members, items] = await Promise.all([
        store.members(member.team_id),
        store.list(member.team_id),
      ]);
      if (epoch.current !== requestEpoch || currentMember.current !== member)
        return;
      if (!members.some((person) => person.user_id === member.user_id))
        throw new Error(
          "Your team membership changed. Sign out and sign in again.",
        );
      setState({
        members,
        items,
        ready: true,
        busy: false,
        message: "",
        error: false,
      });
    } catch (error) {
      if (epoch.current !== requestEpoch || currentMember.current !== member)
        return;
      setState((s) => ({
        ...s,
        busy: false,
        error: true,
        message: ["PGRST205", "42P01"].includes(error.code)
          ? "Tasks and resources aren't set up yet. Ask the project owner to finish management setup. Your notebook is still available."
          : error.message,
      }));
    } finally {
      if (epoch.current === requestEpoch) busy.current = false;
    }
  }, [member]);

  useEffect(() => {
    ++epoch.current;
    busy.current = false;
    setState(empty);
    setEditing(null);
    setFormError("");
    if (member) refresh();
    return () => {
      ++epoch.current;
    };
  }, [member, refresh]);

  function open(kind, item) {
    if (
      !state.ready ||
      busy.current ||
      (kind === "task" && (item ? !canEditTask(item) : !isManager))
    )
      return;
    setFormError("");
    setEditing(
      item
        ? structuredClone(item)
        : { id: crypto.randomUUID(), kind, team_id: member.team_id, data: {} },
    );
  }

  async function save(record) {
    if (
      !member ||
      busy.current ||
      (record.kind === "task" &&
        (record.revision ? !canEditTask(editing) : !isManager))
    )
      return;
    const requestEpoch = epoch.current;
    busy.current = true;
    setState((s) => ({ ...s, busy: true }));
    setFormError("Saving…");
    try {
      const saved = await store.save(record);
      if (epoch.current !== requestEpoch || currentMember.current !== member)
        return;
      setState((s) => ({
        ...s,
        items: [saved, ...s.items.filter((item) => item.id !== saved.id)],
        message: "Saved to your team.",
        error: false,
      }));
      setEditing(null);
      setFormError("");
    } catch (error) {
      if (epoch.current === requestEpoch && currentMember.current === member)
        setFormError(
          error.message || "Could not save. Your form has been kept open.",
        );
    } finally {
      if (epoch.current === requestEpoch) {
        busy.current = false;
        setState((s) => ({ ...s, busy: false }));
      }
    }
  }

  const canDelete = (item) =>
    Boolean(
      member &&
      item?.archived &&
      (isManager ||
        (item.kind === "task"
          ? item.data.assignee === member.user_id
          : item.author_id === member.user_id)),
    );
  async function remove() {
    if (busy.current || !canDelete(editing)) return;
    if (
      !window.confirm(
        `Permanently delete "${editing.title}"? This cannot be undone.`,
      )
    )
      return;
    const requestEpoch = epoch.current;
    const record = editing;
    busy.current = true;
    setState((s) => ({ ...s, busy: true }));
    setFormError("Deleting…");
    try {
      await store.remove(record);
      if (epoch.current !== requestEpoch || currentMember.current !== member)
        return;
      setState((s) => ({
        ...s,
        items: s.items.filter((item) => item.id !== record.id),
        message: "Archived item deleted.",
        error: false,
      }));
      setEditing(null);
      setFormError("");
    } catch (error) {
      if (epoch.current === requestEpoch && currentMember.current === member)
        setFormError(
          error.message || "Could not delete this item. Please try again.",
        );
    } finally {
      if (epoch.current === requestEpoch) {
        busy.current = false;
        setState((s) => ({ ...s, busy: false }));
      }
    }
  }
  return {
    ...state,
    member: effectiveMember,
    isManager,
    canEditTask,
    canDelete,
    remove,
    editing,
    formError,
    refresh,
    open,
    save,
    close: () => {
      if (!busy.current) setEditing(null);
    },
    setFormError,
  };
}
