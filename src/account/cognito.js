// Minimal Amazon Cognito user-pool client: calls the Cognito API directly from the
// browser (over HTTPS to AWS), so the app needs no auth SDK and no redirect flow.

async function call(cfg, action, body) {
  const res = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(data.__type || "").split("#").pop();
    const err = new Error(friendly(code, data.message));
    err.code = code;
    throw err;
  }
  return data;
}

function friendly(code, message) {
  switch (code) {
    case "NotAuthorizedException": return /refresh/i.test(message || "") ? "Your session expired. Sign in again." : "Wrong email or password.";
    case "UserNotConfirmedException": return "Confirm your email first. We sent you a code.";
    case "UsernameExistsException": return "There's already an account with that email.";
    case "CodeMismatchException": return "That code isn't right. Check the email and try again.";
    case "ExpiredCodeException": return "That code has expired. Send a new one.";
    case "InvalidPasswordException": return "Use at least 8 characters, with upper and lower case letters and a number.";
    case "LimitExceededException":
    case "TooManyRequestsException": return "Too many attempts. Wait a few minutes and try again.";
    case "InvalidParameterException": return message || "Check what you entered.";
    default: return message || "Something went wrong. Try again.";
  }
}

const tokensOf = (r, email, refreshToken) => ({
  email,
  idToken: r.AuthenticationResult.IdToken,
  refreshToken: r.AuthenticationResult.RefreshToken ?? refreshToken,
  expiresAt: Date.now() + (r.AuthenticationResult.ExpiresIn - 60) * 1000,
});

export const signIn = async (cfg, email, password) =>
  tokensOf(await call(cfg, "InitiateAuth", {
    ClientId: cfg.clientId, AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: email, PASSWORD: password },
  }), email);

export const refresh = async (cfg, session) =>
  tokensOf(await call(cfg, "InitiateAuth", {
    ClientId: cfg.clientId, AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: session.refreshToken },
  }), session.email, session.refreshToken);

export const signUp = (cfg, email, password) =>
  call(cfg, "SignUp", { ClientId: cfg.clientId, Username: email, Password: password, UserAttributes: [{ Name: "email", Value: email }] });

export const confirmSignUp = (cfg, email, code) =>
  call(cfg, "ConfirmSignUp", { ClientId: cfg.clientId, Username: email, ConfirmationCode: code });

export const resendCode = (cfg, email) =>
  call(cfg, "ResendConfirmationCode", { ClientId: cfg.clientId, Username: email });

export const forgotPassword = (cfg, email) =>
  call(cfg, "ForgotPassword", { ClientId: cfg.clientId, Username: email });

export const confirmForgotPassword = (cfg, email, code, password) =>
  call(cfg, "ConfirmForgotPassword", { ClientId: cfg.clientId, Username: email, ConfirmationCode: code, Password: password });

export const revoke = (cfg, session) =>
  call(cfg, "RevokeToken", { ClientId: cfg.clientId, Token: session.refreshToken }).catch(() => {});
