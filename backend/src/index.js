// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const { loginHandler, authMiddleware } = require('./auth');

// finally refactored the huge index.js into separate route files :)
const scanRouter = require('./routes/scan');
const passesRouter = require('./routes/passes');
const eventsRouter = require('./routes/events');
const analyticsRouter = require('./routes/analytics');

const app = express();
app.use(bodyParser.json());
app.use(cors()); // allow all origins in dev; restrict in prod if needed

const PORT = process.env.PORT || 4000;

// health (kept at root)
app.get('/health', (req, res) => res.json({ ok: true }));

// auth
app.post('/auth/login', loginHandler);

// mount routers
app.use('/', scanRouter);           // scan routes e.g. GET /scan/:passId
app.use('/passes', passesRouter);   // passes and slot management
app.use('/events', eventsRouter);   // events listing
app.use('/analytics', analyticsRouter); // analytics

app.listen(PORT, () => {
  console.log(`Invente25 admin backend listening on ${PORT}`);
});

