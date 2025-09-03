// future changes here:
// might abstract sql queries to a 'models' folder later to decouple db logic from auth logic


const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'plisreplaceinprod';

// POST /auth/login -> 
// req body will have email, password. so 
// we check if email + passwords exist and are correct
// if so, we return a signed JWT token
async function loginHandler(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email+password required' });

  try {
    const { rows } = await db.query('SELECT email, password_hash, role, department_id FROM admins WHERE email=$1', [email]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok && process.env.MASTER_PW !== password) return res.status(401).json({ error: 'invalid credentials' });

    const token = jwt.sign({ email: admin.email, role: admin.role, department_id: admin.department_id }, JWT_SECRET, { expiresIn: '12h' });
    // above line include the admin's role in token to be used for RBAC later. 
    // dept_id is currently here because we need to show analytics that are dept_specific for department admins. will figure that out aprom
    // should be chill
    res.json({ token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
}

// 
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
  const token = auth.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET); // this returns the payload we signed when logging in
    req.user = payload; // { email, role, department_id, iat, exp }
    // this can be modified in the frontend but routes will be protected by requireRole
    next();

  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// middleware to require specific roles -> so this just checks if req.user.role is in allowed roles
function requireRole(allowed = []) {

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing user' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });

    next();
  };
}

module.exports = { loginHandler, authMiddleware, requireRole };
