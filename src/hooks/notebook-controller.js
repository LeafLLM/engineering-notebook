import Quill from "quill";
import { designPrompts } from "../data/design-prompts";
import { createDocumentStore } from "../data/document-store";
import { createAccountStore } from "../data/account-store";
import { captchaSiteKey } from "../data/client";

// Owns notebook requests, drafts and save sequencing. Components only read the
// published view and call actions. Refs in useNotebook keep this controller stable.
export function createNotebookController(client) {
  const store = createDocumentStore(client);
  const accounts = createAccountStore(client);
  let quill;
  let titleInput;
  const focusTitle = () => titleInput?.focus();
  const selectTitle = () => titleInput?.select();
  const listeners = new Set();
  let view;
  let disposed = false;
  // Text fields and messages shown by the components. publish() sends a new view to React.
  const model = {
    title: "Untitled document",
    mechanism: "",
    email: "",
    password: "",
    authMode: "sign-in",
    setupHidden: true,
    teamName: "",
    displayName: "",
    teamBusy: false,
    teamStatus: "",
    archiveFilter: "active",
    conflictsHidden: true,
    noticeHidden: true,
    workspaceHidden: true,
    createHidden: true,
    signInHidden: false,
    sessionHidden: true,
    account: "",
    description: "",
    signInStatus: "Checking your session…",
    signInBusy: false,
    status: "Loading editor…",
    statusState: "ready",
    error: "",
  };
  const actions = {};
  function showError(error) {
    let message =
      error.message || "The notebook request failed. Please try again.";
    if (["PGRST205", "42P01"].includes(error.code)) {
      message =
        "The shared notebook is not set up yet. Ask the project owner to finish the database setup.";
    } else if (error.code === "42501") {
      message =
        "Your account does not have permission for that action. Your draft has not been cleared.";
    } else if (message.includes("fetch") || message.includes("Network")) {
      message =
        "Could not reach the shared notebook. Check your connection and try again.";
    }
    model.error = message;
    model.noticeHidden = false;
    publish();
  }

  // Current account, open document, and flags that coordinate asynchronous requests.
  let user = null;
  let membership = null;
  let documents = [];
  let activeId = crypto.randomUUID();
  let revision = null;
  let created = false;
  let archived = false;
  let authorId = null;
  let dirty = false;
  let editVersion = 0;
  let saveTask = null;
  let saveTimer = null;
  let switching = false;
  let loadingDocument = false;
  let conflict = false;
  let sessionEpoch = 0;
  let sessionInitialized = false;
  let recoveryDraft = null;

  function status(message, state = "ready") {
    model.status = message;
    model.statusState = state;
    publish();
  }

  // Only the last-opened document ID is kept locally. Document text is in Supabase.
  function rememberDocument(id) {
    try {
      const key = "engineering-notebook.open." + membership.team_id;
      if (id) sessionStorage.setItem(key, id);
      else sessionStorage.removeItem(key);
    } catch {
      /* The editor also works when browser storage is unavailable. */
    }
  }

  // Start a blank, unsaved entry without writing anything to the database.
  function resetDraft() {
    clearTimeout(saveTimer);
    activeId = crypto.randomUUID();
    revision = null;
    created = false;
    archived = false;
    authorId = null;
    dirty = false;
    conflict = false;
    editVersion = 0;
    model.title = "Untitled document";
    model.mechanism = "";
    quill.setContents([{ insert: "\n" }], "silent");
    quill.history.clear();
    model.conflictsHidden = true;
    status("Draft — create the document to start saving changes.");
    publish();
  }

  // Capture one consistent version of the fields and Quill content for a save.
  function snapshot() {
    return {
      id: activeId,
      revision,
      team_id: membership.team_id,
      title: model.title.trim() || "Untitled document",
      mechanism: model.mechanism.trim() || "General",
      content: JSON.parse(JSON.stringify(quill.getContents())),
    };
  }

  // A local edit schedules autosave only after the document has been created.
  function markDirty() {
    if (archived) return;
    dirty = true;
    editVersion += 1;
    clearTimeout(saveTimer);
    status(
      conflict
        ? "Your unsaved draft is still open. Reload the saved version, or save this draft as a new document."
        : created
          ? "Unsaved changes…"
          : "Draft — create the document to save it.",
      conflict ? "error" : "ready",
    );
    if (created && !conflict) saveTimer = setTimeout(saveDocument, 1000);
  }

  // An existing document is UPDATED. Only the first save INSERTS a new row.
  // editVersion protects typing that happens while a network save is running.
  async function saveDocument() {
    clearTimeout(saveTimer);
    if (!membership || conflict || archived) return false;
    if (saveTask) return saveTask;
    if (created && !dirty) return true;
    const draft = snapshot();
    const versionAtStart = editVersion;
    const epochAtStart = sessionEpoch;
    status("Saving…");
    saveTask = (async () => {
      try {
        const saved = await store.save(draft, created);
        if (epochAtStart !== sessionEpoch) return false;
        activeId = saved.id;
        revision = saved.revision;
        created = true;
        archived = Boolean(saved.archived);
        authorId = saved.author_id;
        dirty = editVersion !== versionAtStart;
        documents = [
          saved,
          ...documents.filter((item) => item.id !== saved.id),
        ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        rememberDocument(activeId);
        publish();
        model.noticeHidden = true;
        status(
          dirty
            ? "Unsaved changes…"
            : "Saved to team notebook · " +
                new Date(saved.updated_at).toLocaleTimeString(),
        );
        if (dirty) saveTimer = setTimeout(saveDocument, 1000);
        return true;
      } catch (error) {
        if (epochAtStart !== sessionEpoch) return false;
        dirty = true;
        if (["DOCUMENT_CONFLICT", "23505"].includes(error.code)) {
          conflict = true;
          model.conflictsHidden = false;
          status(
            "Another saved version exists. Your draft is still open; choose how to continue.",
            "error",
          );
        } else {
          status(
            "Save failed. Your writing is still here; try saving again.",
            "error",
          );
          showError(error);
        }
        return false;
      } finally {
        saveTask = null;
        publish();
      }
    })();
    publish();
    return saveTask;
  }

  // Finish outstanding writes before switching entries, refreshing, or signing out.
  async function finishPendingSave() {
    clearTimeout(saveTimer);
    if (saveTask && !(await saveTask)) return false;
    if (created && dirty) return saveDocument();
    return !conflict;
  }

  // Validate incoming content before replacing the current draft.
  function showDocument(saved) {
    if (
      !Array.isArray(saved.content?.ops) ||
      saved.content.ops.some(
        (op) =>
          typeof op.insert !== "string" &&
          !(
            typeof op.insert?.image === "string" &&
            /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(
              op.insert.image,
            )
          ),
      )
    ) {
      throw new Error(
        "This document has unsupported content. It has not been opened or overwritten.",
      );
    }
    activeId = saved.id;
    revision = saved.revision;
    created = true;
    archived = Boolean(saved.archived);
    authorId = saved.author_id;
    dirty = false;
    conflict = false;
    editVersion = 0;
    model.title = saved.title;
    model.mechanism = saved.mechanism;
    quill.setContents(saved.content, "silent");
    quill.history.clear();
    model.conflictsHidden = true;
    model.noticeHidden = true;
    rememberDocument(activeId);
    status(
      archived
        ? "Archived entry — restore it before editing."
        : "Saved to team notebook · " +
            new Date(saved.updated_at).toLocaleTimeString(),
    );
    publish();
  }

  async function loadDocument(id) {
    const epoch = sessionEpoch;
    loadingDocument = true;
    publish();
    try {
      const saved = await store.open(membership.team_id, id);
      if (epoch === sessionEpoch) showDocument(saved);
    } finally {
      loadingDocument = false;
      publish();
    }
  }

  // Don't lose a failed save or an uncreated draft when switching documents.
  async function navigate(action) {
    if (switching) return;
    switching = true;
    publish();
    try {
      if (!(await finishPendingSave())) return;
      if (
        !created &&
        dirty &&
        !window.confirm(
          "This draft has not been created. Discard it and continue?",
        )
      )
        return;
      await action();
    } catch (error) {
      showError(error);
    } finally {
      switching = false;
      publish();
    }
  }

  // Load the signed-in team. Epoch numbers make old requests harmless after an account change.
  async function applySession(session, force = false) {
    if (
      sessionInitialized &&
      !force &&
      (user?.id || null) === (session?.user?.id || null)
    )
      return;
    if (user && membership && dirty) {
      recoveryDraft = {
        userId: user.id,
        draft: snapshot(),
        created,
        archived,
        authorId,
      };
    }
    const epoch = ++sessionEpoch;
    sessionInitialized = true;
    clearTimeout(saveTimer);
    user = session?.user || null;
    membership = null;
    documents = [];
    model.workspaceHidden = true;
    model.createHidden = true;
    model.noticeHidden = true;
    model.signInHidden = Boolean(user);
    model.sessionHidden = !user;
    model.setupHidden = true;
    model.teamStatus = "";
    quill.enable(false);
    resetDraft();
    if (!user) {
      model.account = "";
      model.description = "";
      model.signInStatus = "Sign in or create an account to get started.";
      model.teamName = "";
      model.displayName = "";
      publish();
      return;
    }
    model.account = user.email + " · Loading team…";
    publish();
    try {
      const member = await store.membership(user.id);
      const list = await store.list(member.team_id);
      if (epoch !== sessionEpoch) return;
      membership = member;
      documents = list;
      model.account = member.display_name + " · " + member.teamName;
      model.description =
        "Shared with " +
        member.teamName +
        ". Refresh to see teammates' changes.";
      model.workspaceHidden = false;
      model.createHidden = false;
      quill.enable(true);
      if (recoveryDraft?.userId === user.id) {
        const recovered = recoveryDraft;
        recoveryDraft = null;
        activeId = recovered.draft.id;
        revision = recovered.draft.revision;
        created = recovered.created;
        archived = recovered.archived;
        authorId = recovered.authorId;
        model.title = recovered.draft.title;
        model.mechanism = recovered.draft.mechanism;
        quill.setContents(recovered.draft.content, "silent");
        markDirty();
      } else {
        let lastId;
        try {
          lastId = sessionStorage.getItem(
            "engineering-notebook.open." + member.team_id,
          );
        } catch {
          /* Optional navigation state. */
        }
        if (list.some((item) => item.id === lastId)) await loadDocument(lastId);
      }
      publish();
    } catch (error) {
      if (epoch === sessionEpoch) {
        model.account = user.email;
        if (error.code === "NO_TEAM") {
          model.setupHidden = false;
          publish();
        } else showError(error);
      }
    }
  }

  function insertPrompts() {
    if (!membership || archived) return;
    const index =
      quill.getSelection()?.index ?? Math.max(0, quill.getLength() - 1);
    // Edit these headings and prompts to adjust the template. Answers belong
    // in saved entries, not here. Research stays a plain heading, as in the example.

    // A Delta stores text and its formatting together. Newlines are plain
    // so typing an answer doesn't inherit a heading's bold or guidance's italics.
    const Delta = Quill.import("delta");
    const template = new Delta().insert(
      "\nDate & time: " + new Date().toLocaleString() + "\n\n",
    );
    for (const section of designPrompts) {
      template.insert(section.heading, section.bold ? { bold: true } : {});
      template.insert("\n");
      template.insert(section.prompt, section.italic ? { italic: true } : {});
      template.insert("\n\n");
    }
    // Navigation temporarily disables typing. API insertion still works,
    // and we explicitly mark the inserted template as an unsaved edit.
    quill.updateContents(new Delta().retain(index).concat(template), "api");
    markDirty();
    quill.setSelection(index + template.length(), 0);
  }

  // Actions are the functions called by JSX onClick/onChange/onSubmit handlers.
  actions.image = async (event) => {
    const file = event.target.files[0];
    if (!file || !membership || archived) return;
    const epoch = sessionEpoch;
    const documentId = activeId;
    const index =
      quill.getSelection()?.index ?? Math.max(0, quill.getLength() - 1);
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 1024 * 1024
      ) {
        throw new Error(
          "Choose a PNG, JPG, or WebP image no larger than 1 MB.",
        );
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      if (epoch !== sessionEpoch || documentId !== activeId) return;
      quill.insertEmbed(index, "image", data, "user");
      quill.setSelection(index + 1, 0);
    } catch (error) {
      showError(error);
    } finally {
      event.target.value = "";
    }
  };
  actions.newEntry = () =>
    navigate(() => {
      if (!membership) return;
      model.archiveFilter = "active";
      location.hash = "documenting";
      resetDraft();
      rememberDocument(null);
      insertPrompts();
      publish();
      focusTitle();
      selectTitle();
    });
  actions.openEntry = (event) =>
    navigate(async () => {
      if (!membership) return;
      location.hash = "documenting";
      await loadDocument(event.detail);
    });
  actions.remove = () =>
    navigate(async () => {
      if (
        !created ||
        !archived ||
        !membership ||
        conflict ||
        !(membership.role === "manager" || authorId === user?.id)
      )
        return;
      if (
        !window.confirm(
          `Permanently delete "${model.title}"? This cannot be undone.`,
        )
      )
        return;
      const epoch = sessionEpoch;
      await store.remove(membership.team_id, activeId, revision);
      if (epoch !== sessionEpoch) return;
      documents = documents.filter((item) => item.id !== activeId);
      rememberDocument(null);
      resetDraft();
    model.noticeHidden = true;
      status("Archived entry deleted.");
    });
  actions.archive = () =>
    navigate(async () => {
      if (
        !created ||
        !membership ||
        !(membership.role === "manager" || authorId === user?.id)
      )
        return;
      const epoch = sessionEpoch;
      const saved = await store.archive(
        membership.team_id,
        activeId,
        revision,
        !archived,
      );
      if (epoch !== sessionEpoch) return;
      documents = [saved, ...documents.filter((item) => item.id !== saved.id)];
      model.archiveFilter = saved.archived ? "archived" : "active";
      showDocument(saved);
    });
  actions.submit = async (event) => {
    event.preventDefault();
    await saveDocument();
  };
  actions.keydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveDocument();
    }
  };
  actions.create = () =>
    navigate(() => {
      model.archiveFilter = "active";
      resetDraft();
      rememberDocument(null);
      insertPrompts();
      publish();
      focusTitle();
      selectTitle();
    });
  actions.refresh = async () => {
    if (switching) return;
    switching = true;
    publish();
    const epoch = sessionEpoch;
    try {
      if (!(await finishPendingSave())) return;
      const list = await store.list(membership.team_id);
      if (epoch !== sessionEpoch) return;
      documents = list;
      if (created) await loadDocument(activeId);
      publish();
    } catch (error) {
      showError(error);
    } finally {
      switching = false;
      publish();
    }
  };
  actions.reload = async () => {
    if (
      !window.confirm(
        "Reload the saved version? This will replace the unsaved draft currently on this page.",
      )
    )
      return;
    try {
      await loadDocument(activeId);
    } catch (error) {
      showError(error);
    }
  };
  actions.copy = async () => {
    conflict = false;
    created = false;
    archived = false;
    authorId = null;
    revision = null;
    activeId = crypto.randomUUID();
    model.title = (model.title.trim() || "Untitled document") + " (copy)";
    model.conflictsHidden = true;
    markDirty();
    await saveDocument();
  };
  actions.signIn = async (event, captchaToken) => {
    event.preventDefault();
    if (model.signInBusy || user) return;
    if (captchaSiteKey && !captchaToken) {
      model.signInStatus =
        "Complete the CAPTCHA verification before signing in.";
      publish();
      return;
    }
    model.signInBusy = true;
    model.signInStatus = "Signing in…";
    publish();
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: model.email.trim(),
        password: model.password,
        options: { captchaToken },
      });
      if (error) throw error;
      model.password = "";
      await applySession(data.session);
    } catch (error) {
      model.signInStatus =
        error.message || "Could not sign in. Please try again.";
    } finally {
      model.signInBusy = false;
      publish();
    }
  };
  actions.authMode = () => {
    if (model.signInBusy) return;
    model.authMode = model.authMode === "sign-in" ? "sign-up" : "sign-in";
    model.password = "";
    model.signInStatus = "";
    publish();
  };
  actions.signUp = async (event, captchaToken) => {
    event.preventDefault();
    if (model.signInBusy || user) return;
    if (captchaSiteKey && !captchaToken) {
      model.signInStatus =
        "Complete the CAPTCHA verification before creating an account.";
      publish();
      return;
    }
    model.signInBusy = true;
    model.signInStatus = "Creating account…";
    publish();
    try {
      const data = await accounts.signUp(
        model.email,
        model.password,
        captchaToken,
      );
      model.password = "";
      if (data.session) await applySession(data.session);
      else {
        model.authMode = "sign-in";
        model.signInStatus =
          "Check your email for a confirmation link, then return here to sign in. If you already have an account, sign in with it.";
      }
    } catch (error) {
      model.signInStatus =
        error.message || "Could not create your account. Please try again.";
    } finally {
      model.signInBusy = false;
      publish();
    }
  };
  actions.createTeam = async (event) => {
    event.preventDefault();
    if (!user || membership || model.setupHidden || model.teamBusy) return;
    const epoch = sessionEpoch;
    model.teamBusy = true;
    model.teamStatus = "Creating your team…";
    publish();
    try {
      await accounts.createTeam(model.teamName, model.displayName);
      if (epoch !== sessionEpoch) return;
      await applySession({ user }, true);
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      model.teamStatus = ["PGRST202", "42883"].includes(error.code)
        ? "Team creation is not set up yet. Ask the project owner to finish account setup."
        : error.message || "Could not create your team. Please try again.";
    } finally {
      model.teamBusy = false;
      publish();
    }
  };
  actions.signOut = () =>
    navigate(async () => {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      dirty = false;
      recoveryDraft = null;
      await applySession(null);
    });
  actions.retry = () => {
    if (user) applySession({ user }, true);
    else window.location.reload();
  };
  actions.change = (field, value) => {
    model[field] = value;
    publish();
  };
  actions.edit = (field, value) => {
    model[field] = value;
    markDirty();
  };
  actions.open = (id) => navigate(() => loadDocument(id));
  actions.prompts = insertPrompts;
  // React subscribes to this immutable view; mutable save bookkeeping stays private.
  function publish() {
    if (disposed) return;
    view = {
      ...model,
      user,
      membership,
      documents,
      activeId,
      created,
      archived,
      dirty,
      conflict,
      busy:
        Boolean(saveTask) ||
        switching ||
        loadingDocument ||
        model.teamBusy ||
        model.signInBusy,
      locked: switching || loadingDocument || archived,
      canArchive:
        created &&
        membership &&
        (membership.role === "manager" || authorId === user?.id),
    };
    listeners.forEach((listener) => listener());
  }
  publish();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => view,
    actions,
    mount(editor, input) {
      disposed = false;
      let active = true;
      quill = editor;
      titleInput = input;
      const change = (_delta, _old, source) => {
        if (source === "user") markDirty();
      };
      quill.on("text-change", change);
      const unload = (event) => {
        if (dirty || saveTask) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", unload);
      const timers = new Set();
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (active) applySession(session);
        }, 0);
        timers.add(timer);
      });
      client.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) showError(error);
          else applySession(data.session, true);
        })
        .catch((error) => {
          if (active) showError(error);
        });
      return () => {
        active = false;
        disposed = true;
        ++sessionEpoch;
        clearTimeout(saveTimer);
        timers.forEach(clearTimeout);
        subscription.unsubscribe();
        quill.off("text-change", change);
        window.removeEventListener("beforeunload", unload);
      };
    },
  };
}
