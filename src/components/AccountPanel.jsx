// Sign-in, signed-in account details, and notebook connection errors.
import { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { captchaSiteKey } from "../data/client";

export default function AccountPanel({ state, actions }) {
  const signingUp = state.authMode === "sign-up";
  const captcha = useRef(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const resetCaptcha = () => {
    setCaptchaToken("");
    captcha.current?.resetCaptcha();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (state.signInBusy) return;
    try {
      await (signingUp ? actions.signUp : actions.signIn)(event, captchaToken);
    } finally {
      // Supabase consumes tokens even when credentials or password rules fail.
      resetCaptcha();
    }
  };
  return (
    <section className="account-area" aria-label="Account">
      <form
        id="sign-in-form"
        className="sign-in-panel"
        hidden={state.signInHidden}
        onSubmit={submit}
        aria-busy={state.signInBusy}
      >
        <h2>
          {signingUp ? "Create your account" : "Make room for better teamwork."}
        </h2>
        <p>
          {signingUp
            ? "Create an account, then set up your team's shared workspace."
            : "Sign in to your team management to work with your teammates."}
        </p>
        <label htmlFor="account-email">Email</label>
        <input
          type="email"
          id="account-email"
          autoComplete="username"
          required
          disabled={state.signInBusy}
          value={state.email}
          onChange={(e) => actions.change("email", e.target.value)}
        />
        <label htmlFor="account-password">Password</label>
        <input
          type="password"
          id="account-password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          minLength={signingUp ? 8 : undefined}
          disabled={state.signInBusy}
          aria-describedby={signingUp ? "signup-password-help" : undefined}
          value={state.password}
          onChange={(e) => actions.change("password", e.target.value)}
        />
        {signingUp && (
          <p id="signup-password-help">
            Use at least 8 characters. You may need to confirm your email before
            signing in.
          </p>
        )}
        {captchaSiteKey && !state.signInHidden && (
          <div className="account-captcha">
            <HCaptcha
              key={`${state.authMode}-${captchaVersion}`}
              ref={captcha}
              sitekey={captchaSiteKey}
              size="compact"
              reCaptchaCompat={false}
              onVerify={(token) => {
                setCaptchaToken(token);
                setCaptchaError("");
              }}
              onExpire={() => {
                setCaptchaToken("");
                setCaptchaError(
                  "Verification expired. Complete the CAPTCHA again.",
                );
              }}
              onError={() => {
                setCaptchaToken("");
                setCaptchaError(
                  "CAPTCHA could not load or verify. Check your connection and try again.",
                );
              }}
            />
            {captchaError && (
              <>
                <p role="alert">{captchaError}</p>
                <button
                  type="button"
                  className="text-button"
                  disabled={state.signInBusy}
                  onClick={() => {
                    resetCaptcha();
                    setCaptchaError("");
                    setCaptchaVersion((version) => version + 1);
                  }}
                >
                  Retry verification
                </button>
              </>
            )}
          </div>
        )}
        <button
          type="submit"
          className="notebook-button primary"
          id="sign-in-button"
          disabled={state.signInBusy}
        >
          {state.signInBusy
            ? signingUp
              ? "Creating account…"
              : "Signing in…"
            : signingUp
              ? "Create account"
              : "Sign in"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            resetCaptcha();
            setCaptchaError("");
            actions.authMode();
          }}
          disabled={state.signInBusy}
        >
          {signingUp ? "Back to sign in" : "Create an account"}
        </button>
        <p id="sign-in-status" role="status" aria-live="polite">
          {state.signInStatus}
        </p>
      </form>
      <div
        className="notebook-session"
        id="notebook-session"
        hidden={state.sessionHidden}
      >
        <p id="notebook-account">{state.account}</p>
        <button
          type="button"
          className="notebook-button"
          id="sign-out"
          disabled={state.busy}
          onClick={actions.signOut}
        >
          Sign out
        </button>
      </div>
      {!state.setupHidden && (
        <form
          className="sign-in-panel"
          onSubmit={actions.createTeam}
          aria-busy={state.teamBusy}
        >
          <h2>Create your team</h2>
          <p>
            Your account is ready. Create a shared workspace to become its first
            manager.
          </p>
          <p>
            Joining an existing team? Ask its owner to add your account, then
            choose Try again below.
          </p>
          <label htmlFor="member-display-name">Your name</label>
          <input
            id="member-display-name"
            autoComplete="name"
            required
            maxLength={80}
            pattern=".*\S.*"
            title="Enter your name, including a non-space character."
            disabled={state.teamBusy}
            value={state.displayName}
            onChange={(e) => actions.change("displayName", e.target.value)}
          />
          <label htmlFor="new-team-name">Team name</label>
          <input
            id="new-team-name"
            required
            maxLength={100}
            pattern=".*\S.*"
            title="Enter a team name, including a non-space character."
            disabled={state.teamBusy}
            value={state.teamName}
            onChange={(e) => actions.change("teamName", e.target.value)}
          />
          <button
            type="submit"
            className="notebook-button primary"
            disabled={state.busy}
          >
            {state.teamBusy ? "Creating team…" : "Create team"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={actions.retry}
            disabled={state.busy}
          >
            Try again
          </button>
          <p role="status" aria-live="polite">
            {state.teamStatus}
          </p>
        </form>
      )}
      <div
        className="notebook-notice"
        id="notebook-notice"
        hidden={state.noticeHidden}
      >
        <p id="notebook-error" role="alert">
          {state.error}
        </p>
        <button
          type="button"
          className="notebook-button"
          id="retry-notebook"
          onClick={actions.retry}
        >
          Try again
        </button>
      </div>
    </section>
  );
}
