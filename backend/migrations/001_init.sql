--- SQL migration script to initialize the database schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- this is for gen_random_uuid() (have to replace with uuid7)

CREATE TABLE users ( -- participants
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- pre-filled by seed script
CREATE TABLE departments ( 
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- being fetched from strapi backend (static table)
CREATE TABLE events ( 
  id SERIAL PRIMARY KEY, 
  external_id INT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department_id INT REFERENCES departments(id),
  registrations INT DEFAULT 0, -- coz why not? maybe we can remove later or just not use
  created_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE receipts (
  payment_id VARCHAR(100) PRIMARY KEY, -- from payment gateway (or uuid4 generated for cash payments)
  email TEXT REFERENCES users(email),
  method VARCHAR(50), -- online or cash
  phone VARCHAR(20),
  amount DECIMAL(10,2) NOT NULL,
  paid_on TIMESTAMP NOT NULL,
  passGenerated BOOLEAN DEFAULT FALSE -- whether a pass has been generated for this payment
);


CREATE TABLE passes (
  pass_id TEXT PRIMARY KEY, -- this is uuidv4 rn, gotta change to uuid7 later
  user_email TEXT REFERENCES users(email),
  payment_id VARCHAR(100) REFERENCES receipts(payment_id), 
  ticket_issued BOOLEAN DEFAULT FALSE, -- whether qr code has been sent 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE slots ( -- separated this out from events to have the attended field 
  pass_id TEXT REFERENCES passes(pass_id),
  slot_no INT NOT NULL,
  event_id INT REFERENCES events(external_id),
  attended BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pass_id, slot_no)
);

-- also pre-filled by seed script
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), --prolly don't need uuid7 for admins
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- volunteercentral | volunteerdept | event_admin | dept_admin | super_admin
  department_id INT NULL, --in case of dept_admin - we ensure they can access stats of only their dept's events
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON events(external_id);
CREATE INDEX ON slots(event_id); -- for quicker analytics later on
CREATE INDEX ON passes(user_email);
CREATE INDEX ON admins(department_id);

-- Seed departments
INSERT INTO departments (name) VALUES
  ('CSE_SSN'),
  ('CSE_SNU'),
  ('IT'),
  ('ECE'),
  ('EEE'),
  ('CHEM'),
  ('MECH'),
  ('CIVIL'),
  ('BME'),
  ('COM');

-- Seed admin accounts
-- Super admin (no department)
INSERT INTO admins (email, password_hash, role, department_id)
VALUES ('super_admin@invente.local', crypt('Inv3nt3Super@2025', gen_salt('bf')), 'super_admin', NULL);

-- Central volunteer (no department)
INSERT INTO admins (email, password_hash, role, department_id)
VALUES ('volunteer_central@invente.local', crypt('Inv3nt3Central@2025', gen_salt('bf')), 'volunteer', NULL);

-- Department-specific admins
WITH dept_data AS (
  SELECT id, name FROM departments
)
INSERT INTO admins (email, password_hash, role, department_id)
SELECT 
  'dept_admin_' || lower(replace(name, '_', '')) || '@invente.local',
  crypt('Inv3nt3Dept@2025_' || name, gen_salt('bf')),
  'dept_admin',
  id
FROM dept_data;

-- Event admins
WITH dept_data AS (
  SELECT id, name FROM departments
)
INSERT INTO admins (email, password_hash, role, department_id)
SELECT 
  'event_admin_' || lower(replace(name, '_', '')) || '@invente.local',
  crypt('Inv3nt3Event@2025_' || name, gen_salt('bf')),
  'event_admin',
  id
FROM dept_data;

-- Department volunteers
WITH dept_data AS (
  SELECT id, name FROM departments
)
INSERT INTO admins (email, password_hash, role, department_id)
SELECT 
  'volunteer_dept_' || lower(replace(name, '_', '')) || '@invente.local',
  crypt('Inv3nt3Vol@2025_' || name, gen_salt('bf')),
  'volunteer',
  id
FROM dept_data;

-- legacy --- old passes table

-- so maybe verified and payment_id can be used for cash payments and payment_id for online payments

-- no more mark as verified. the form page replaces it.
-- CREATE TABLE passes (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- this is uuidv4 rn, gotta change to uuid7 later
--   user_email TEXT REFERENCES users(email),
--   payment_method TEXT NOT NULL,  -- online or cash
--   verified BOOLEAN DEFAULT FALSE, -- whether payment has been verified
--   issued BOOLEAN DEFAULT FALSE, -- whether qr code has been sent 
--   created_at TIMESTAMPTZ DEFAULT now()
-- );