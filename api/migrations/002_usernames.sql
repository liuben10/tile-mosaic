-- Accounts now have a username (Cognito's "cognito:username"); email stays as contact.
ALTER TABLE users ADD COLUMN username text;
