--- SQL migration script to initialize the database schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- this is for gen_random_uuid() (have to replace with uuid7)

CREATE TABLE users (
  email TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE departments ( -- can probably add another migration script to populate this
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE events ( -- same goes for this too
  id SERIAL PRIMARY KEY, 
  department_id INT REFERENCES departments(id),
  name TEXT NOT NULL,
  registrations INT DEFAULT 0, -- coz why not? maybe we can remove later or just not use
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- this is uuidv4 rn, gotta change to uuid7 later
  user_email TEXT REFERENCES users(email),
  payment_method TEXT NOT NULL,  -- online or cash
  verified BOOLEAN DEFAULT FALSE, -- whether payment has been verified
  issued BOOLEAN DEFAULT FALSE, -- whether qr code has been sent 
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE slots ( -- separated this out from events to have the attended field 
  pass_id UUID REFERENCES passes(id),
  slot_no INT NOT NULL,
  event_id INT REFERENCES events(id),
  attended BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (pass_id, slot_no)
);

CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), --prolly don't need uuid7 for admins
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- volunteer | event_admin | dept_admin | super_admin
  department_id INT NULL, --in case of dept_admin - we have to ensure they can access stats of only their dept's events
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON slots(event_id); -- for quicker analytics later on
CREATE INDEX ON passes(user_email);
