import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authClient } from '../lib/authClient';
import { useAuth } from '../context/AuthContext';

const COMPANY_DOMAIN = 'axamansard.com';

function isCompanyEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && normalized.slice(at + 1) === COMPANY_DOMAIN;
}

type AuthFailure = {
  code?: string;
  message?: string;
  status?: number;
  statusText?: string;
};

function describeAuthFailure(failure: unknown, mode: 'login' | 'signup' | 'verify' | 'forgot' | 'reset'): string {
  const authFailure = failure && typeof failure === 'object' ? failure as AuthFailure : {};
  const searchable = `${authFailure.code || ''} ${authFailure.message || ''}`.toLowerCase();

  if (searchable.includes('password') && searchable.includes('short')) {
    return 'Neon Auth currently requires a password with at least 8 characters.';
  }
  if (searchable.includes('already') && (searchable.includes('user') || searchable.includes('account'))) {
    return 'An account already exists for this email. Try logging in.';
  }
  if (searchable.includes('origin')) {
    return 'This application URL is not allowed by Neon Auth. Add it to Trusted Origins.';
  }
  if (searchable.includes('sign') && searchable.includes('disabled')) {
    return 'Account creation is not enabled in Neon Auth.';
  }
  if (searchable.includes('verified')) {
    return 'Verify your work email before logging in.';
  }
  if (searchable.includes('otp') || searchable.includes('code')) {
    return searchable.includes('expired')
      ? 'That verification code has expired. Request a new code.'
      : 'That verification code is incorrect.';
  }

  return mode === 'signup'
    ? 'We could not create that account. Check the browser console for the Neon Auth error.'
    : mode === 'forgot'
      ? 'We could not send the reset email. Please try again.'
      : mode === 'reset'
        ? 'This reset link is invalid or has expired.'
        : 'The email or password is incorrect.';
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const { session, isSessionLoading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'verify' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestedPath = (location.state as { from?: unknown } | null)?.from;
  const destination = typeof requestedPath === 'string' && requestedPath.startsWith('/') && !requestedPath.startsWith('//')
    ? requestedPath
    : '/';

  useEffect(() => {
    if (session) navigate(destination, { replace: true });
  }, [destination, navigate, session]);

  if (isSessionLoading) return <div className="auth-state container">Checking your session…</div>;
  if (session) return <Navigate to={destination} replace />;

  const submit = async () => {
    setError(null);
    setNotice(null);

    if (mode !== 'reset' && !isCompanyEmail(email)) {
      setError('You are not authorised.');
      return;
    }

    if (mode === 'signup' || mode === 'reset') {
      if (mode === 'signup' && (firstName.trim().length < 2 || lastName.trim().length < 2)) {
        setError('Enter your first name and surname.');
        return;
      }
      if (password.length < 8) {
        setError('Neon Auth requires a password with at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The passwords do not match.');
        return;
      }
    }

    if (mode === 'verify' && !/^\d{6}$/.test(verificationCode.trim())) {
      setError('Enter the six-digit verification code from your email.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'verify') {
        const verificationResult = await authClient.emailOtp.verifyEmail({
          email: email.trim().toLowerCase(),
          otp: verificationCode.trim()
        });
        if (verificationResult.error) throw verificationResult.error;

        if (!verificationResult.data?.token) {
          const loginResult = await authClient.signIn.email({
            email: email.trim().toLowerCase(),
            password
          });
          if (loginResult.error) throw loginResult.error;
        }
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({
          email: email.trim().toLowerCase(),
          redirectTo: `${window.location.origin}/login`
        });
        if (result.error) throw result.error;
        setNotice('If the account exists, a password reset link has been sent.');
      } else if (mode === 'reset') {
        if (!resetToken) throw new Error('Reset token missing.');
        const result = await authClient.resetPassword({ newPassword: password, token: resetToken });
        if (result.error) throw result.error;
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        navigate('/login', { replace: true });
        setNotice('Password updated. You can now log in.');
      } else if (mode === 'signup') {
        const result = await authClient.signUp.email({
          name: `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim().toLowerCase(),
          password
        });
        if (result.error) throw result.error;
        setMode('verify');
        setNotice('Account created. Enter the verification code sent to your work email.');
      } else {
        const result = await authClient.signIn.email({
          email: email.trim().toLowerCase(),
          password
        });
        if (result.error) throw result.error;
      }
    } catch (failure) {
      const authFailure = failure && typeof failure === 'object' ? failure as AuthFailure : {};
      console.error('Neon Auth request failed', {
        operation: mode,
        code: authFailure.code,
        message: authFailure.message,
        status: authFailure.status,
        statusText: authFailure.statusText
      });
      setError(describeAuthFailure(failure, mode));
    } finally {
      setSubmitting(false);
    }
  };

  const changeMode = (nextMode: 'login' | 'signup' | 'forgot') => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setError(null);
    setNotice(null);
  };

  return (
    <div className="auth-page container">
      <div className="auth-glow-bg" />
      <section className="auth-card glass-panel">
        <span className="auth-eyebrow">Secure authentication</span>
        <h1 className="auth-title">{mode === 'signup' ? 'Create account' : mode === 'verify' ? 'Confirm your email' : mode === 'forgot' ? 'Reset password' : mode === 'reset' ? 'Choose a new password' : 'Welcome back'}</h1>
        <p className="auth-subtitle">
          {mode === 'signup'
            ? 'Enter your first name, surname, and work details. Email verification is required only once.'
            : mode === 'verify'
              ? 'Enter the six-digit code sent to your work email to verify and log in.'
            : mode === 'forgot'
              ? 'Enter your work email and we will send a secure reset link.'
              : mode === 'reset'
                ? 'Create a new password with at least 8 characters.'
            : 'Log in with your work email and password. No verification code is needed after setup.'}
        </p>

        {mode !== 'verify' && mode !== 'forgot' && mode !== 'reset' && <div className="auth-mode-tabs" role="tablist" aria-label="Authentication options">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Create account</button>
        </div>}

        <form className="auth-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
          {mode === 'signup' && (
            <div className="auth-name-row">
              <div className="auth-input-group">
                <label htmlFor="signup-first-name">First name</label>
                <input id="signup-first-name" type="text" autoComplete="given-name" value={firstName} onChange={event => setFirstName(event.target.value)} required />
              </div>
              <div className="auth-input-group">
                <label htmlFor="signup-last-name">Surname</label>
                <input id="signup-last-name" type="text" autoComplete="family-name" value={lastName} onChange={event => setLastName(event.target.value)} required />
              </div>
            </div>
          )}

          {mode !== 'reset' && mode !== 'verify' && <div className="auth-input-group">
            <label htmlFor="login-email">Work email</label>
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
          </div>}

          {mode !== 'forgot' && mode !== 'verify' && <div className={mode === 'signup' || mode === 'reset' ? 'auth-password-row' : undefined}>
            <div className="auth-input-group">
              <div className="auth-label-row">
                <label htmlFor="login-password">{mode === 'reset' ? 'New password' : 'Password'}</label>
                {mode === 'login' && <button className="auth-forgot-button" type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>}
              </div>
              <input id="login-password" type="password" autoComplete={mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password'} minLength={mode === 'signup' || mode === 'reset' ? 8 : undefined} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required />
            </div>
            {(mode === 'signup' || mode === 'reset') && (
              <div className="auth-input-group">
                <label htmlFor="confirm-password">Confirm password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
              </div>
            )}
          </div>}

          {mode === 'verify' && (
            <div className="auth-input-group">
              <label htmlFor="verification-code">Verification code</label>
              <input id="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, ''))} autoFocus required />
            </div>
          )}

          {error && <div className="auth-error-alert" role="alert">{error}</div>}
          {notice && <div className="auth-success-alert" role="status">{notice}</div>}

          <button className="auth-submit-btn" type="submit" disabled={submitting}>
            {submitting ? <span className="btn-spinner" aria-label="Please wait" /> : mode === 'signup' ? 'Create account' : mode === 'verify' ? 'Verify and log in' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : 'Log in'}
          </button>
        </form>

        {mode === 'forgot' && <button className="auth-back-button" type="button" onClick={() => changeMode('login')}>Back to login</button>}
        {mode === 'verify' && <button className="auth-back-button" type="button" onClick={() => changeMode('login')}>Back to login</button>}
      </section>
    </div>
  );
}
