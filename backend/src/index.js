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
const techRegistrationRouter = require('./routes/tech-registration');
const workshopRegistrationRouter = require('./routes/workshop-registration');
const nonTechRegistrationRouter = require('./routes/non-tech-registration');
const adminRouter = require('./routes/admin');

const app = express();
app.use(bodyParser.json());
app.use(cors()); // allow all origins in dev; restrict in prod if needed

const PORT = process.env.PORT || 4000;

// health (kept at root)
app.get('/health', (req, res) => res.json({ ok: true }));

// sync status endpoint
app.get('/sync-status', (req, res) => {
  const { syncEvents } = require('./jobs/syncEvents');
  // This will be populated by the syncEvents function
  res.json({ 
    ok: true, 
    message: 'Sync status endpoint - check logs for detailed sync information' 
  });
});

// auth
app.post('/auth/login', loginHandler);

// mount routers
app.use('/', scanRouter);           // scan routes e.g. GET /scan/:passId
app.use('/passes', passesRouter);   // passes and slot management
app.use('/events', eventsRouter);   // events listing
app.use('/analytics', analyticsRouter); // analytics
app.use('/tech-registration', techRegistrationRouter); // tech registration endpoint
app.use('/workshop-registration', workshopRegistrationRouter); // workshop registration endpoint
app.use('/non-tech-registration', nonTechRegistrationRouter); // non-tech registration endpoint
app.use('/admin', adminRouter); // superadmin-only admin utilities

app.listen(PORT, () => {
  console.log(`Invente25 admin backend listening on ${PORT}`);
  
  // Set up events sync cron job
  if (process.env.SYNC_EVENTS_ENABLED === 'true') {
    // Run every 2 minutes by default (more reasonable for external API calls)
    const cronSchedule = process.env.SYNC_EVENTS_CRON || '*/2 * * * *';
    cron.schedule(cronSchedule, () => {
      syncEvents().catch(err => console.error('Cron job error:', err));
    });
    console.log('Events sync cron job scheduled');
    
    // Run initial sync
    syncEvents().catch(err => console.error('Initial sync error:', err));
  }
});

