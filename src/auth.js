import './auth.css';

export async function requirePrivateSession(client) {
  const shell = document.querySelector('.manage-shell');
  shell.hidden = true;
  async function authorized(user) {
    if (!user) return false;
    const { data, error } = await client.from('library_members').select('email').eq('email', user.email.toLowerCase()).maybeSingle();
    if (error) throw error;
    return !!data;
  }
  let initialError = '';
  try {
    const { data: { session } } = await client.auth.getSession();
    if (session && await authorized(session.user)) { shell.hidden = false; return session.user; }
    if (session) await client.auth.signOut();
  } catch (error) { initialError = error.message || 'Unable to check your session.'; }
  const gate = document.createElement('section');
  gate.className = 'auth-gate';
  gate.setAttribute('aria-label', 'Private library sign in');
  gate.innerHTML = `<h1>Manage</h1><form><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" required><label for="authPassword">Password</label><input id="authPassword" type="password" autocomplete="current-password" required><p class="auth-message" role="status"></p><div class="auth-actions"><button type="submit" class="classic-aqua-btn is-primary">Sign in</button><button type="button" class="classic-cancel-link">Create account</button></div></form>`;
  document.body.prepend(gate);
  const form = gate.querySelector('form'), submit = gate.querySelector('[type=submit]'), toggle = gate.querySelector('[type=button]');
  const email = gate.querySelector('#authEmail'), password = gate.querySelector('#authPassword'), message = gate.querySelector('.auth-message');
  message.textContent = initialError;
  let register = false;
  toggle.onclick = () => {
    register = !register; message.textContent = '';
    submit.textContent = register ? 'Create account' : 'Sign in';
    toggle.textContent = register ? 'Sign in' : 'Create account';
    password.autocomplete = register ? 'new-password' : 'current-password';
  };
  email.focus();
  return new Promise(resolve => {
    form.onsubmit = async event => {
      event.preventDefault(); submit.disabled = toggle.disabled = true; message.textContent = '';
      try {
        const credentials = { email: email.value.trim(), password: password.value };
        const { data, error } = register ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
        if (error) throw error;
        password.value = '';
        if (!data.session) {
          message.textContent = 'Check your email to confirm your account, then sign in.';
          register = false; submit.textContent = 'Sign in'; toggle.textContent = 'Create account'; password.autocomplete = 'current-password';
          return;
        }
        if (!await authorized(data.user)) {
          await client.auth.signOut(); throw new Error('This account does not have access to this library.');
        }
        gate.remove(); shell.hidden = false; resolve(data.user);
      } catch (error) { message.textContent = error.message || 'Unable to sign in.'; }
      finally { submit.disabled = toggle.disabled = false; }
    };
  });
}
