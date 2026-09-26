import { fetchManagerApi } from './managerFetch.js';

// Account rows keep login as text. UserPasswordCheck and UserPasswordChange
// reject that shape with HTTP 400: field "login" must be an integer.
export const parseManagerLogin = (value) => {
  const text = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const login = Number(text);
  return Number.isSafeInteger(login) ? login : null;
};

export const buildUserPasswordBody = ({ login, type, password } = {}) => {
  const parsedLogin = parseManagerLogin(login);
  if (parsedLogin === null) {
    throw new TypeError('Account login must be a positive integer.');
  }

  const passwordType = String(type ?? '').trim();
  if (!passwordType) {
    throw new TypeError('Password type is required.');
  }

  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password is required.');
  }

  return { login: parsedLogin, type: passwordType, password };
};

const postUserPassword = async (endpoint, payload) => {
  const response = await fetchManagerApi(endpoint, {
    method: 'POST',
    headers: { accept: 'text/plain', 'Content-Type': 'application/json' },
    body: JSON.stringify(buildUserPasswordBody(payload)),
  });
  const text = await response.text();
  return { ok: response.ok, text };
};

export const checkManagerPassword = (payload) =>
  postUserPassword('/UserPasswordCheck', payload);

export const changeManagerPassword = (payload) =>
  postUserPassword('/UserPasswordChange', payload);
