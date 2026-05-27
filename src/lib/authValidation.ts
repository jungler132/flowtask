const ZDRAV_DOMAIN = '@zdrav.mos.ru';

export function isZdravEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes('@')) return false;
  return e.endsWith(ZDRAV_DOMAIN);
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function isNonEmptyPassword(password: string): boolean {
  return password.length > 0;
}

/** Минимальные требования к паролю сайта (если бэкенд не вернул иное). */
export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8;
}

export const ZDRAV_EMAIL_HINT =
  'Укажите корпоративный email в домене @zdrav.mos.ru (регистр не важен).';

export const PASSWORD_REQUIRED_HINT = 'Введите пароль, заданный при регистрации на сайте.';

export const OTP_LENGTH_HINT = 'Код из письма — 6 цифр.';

export const PASSWORD_SETUP_HINT =
  'Пароль задаётся один раз на сайте по ссылке из письма. Если пароль ещё не создан — введите код из письма на следующем шаге.';
