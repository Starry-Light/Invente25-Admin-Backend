// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');

const { loginHandler, authMiddleware } = require('./auth');
const { syncEvents } = require('./jobs/syncEvents');

// finally refactored the huge index.js into separate route files :)
const scanRouter = require('./routes/scan');
const passesRouter = require('./routes/passes');
const eventsRouter = require('./routes/events');
const analyticsRouter = require('./routes/analytics');
const cashRegistrationRouter = require('./routes/cash-registration');

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
app.use('/cash-registration', cashRegistrationRouter); // cash registration endpoint

app.listen(PORT, () => {
  console.log(`Invente25 admin backend listening on ${PORT}`);
  
  // Set up events sync cron job
  if (process.env.SYNC_EVENTS_ENABLED === 'true') {
    // Run every 10 seconds by default (using node-cron's extended format with seconds)
    const cronSchedule = process.env.SYNC_EVENTS_CRON || '*/10 * * * * *';
    cron.schedule(cronSchedule, () => {
      syncEvents().catch(err => console.error('Cron job error:', err));
    });
    console.log('Events sync cron job scheduled');
    
    // Run initial sync
    syncEvents().catch(err => console.error('Initial sync error:', err));
  }
});

