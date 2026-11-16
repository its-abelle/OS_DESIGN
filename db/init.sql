CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  original_filename TEXT NOT NULL,
  s3_key TEXT UNIQUE NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- connect-pg-simple session table
CREATE TABLE session (
  sid VARCHAR PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX idx_session_expire ON session(expire);
