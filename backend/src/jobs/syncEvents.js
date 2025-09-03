// jobs/syncEvents.js
const db = require('../db');

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second
const TIMEOUT = 10000; // 10 seconds

// Track consecutive failures for more intelligent retry
let consecutiveFailures = 0;
let lastSuccessfulSync = null;

const DEPARTMENT_MAPPING = {
  'CSE': 'CSE_SSN',     // Map API's "CSE" to our "CSE_SSN"
  'SNU_CSE': 'CSE_SNU', // Map API's "SNU_CSE" to our "CSE_SNU"
  'IT': 'IT',
  'ECE': 'ECE',
  'EEE': 'EEE',
  'CHEM': 'CHEM',
  'MECH': 'MECH',
  'CIVIL': 'CIVIL',
  'BME': 'BME',
  'COM': 'COM'
};

// Helper function to sleep for a given number of milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to fetch with timeout and retry logic
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching from: ${url} (attempt ${attempt}/${retries})`);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Invente25-Admin-Backend/1.0',
          'Accept': 'application/json',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status} ${response.statusText}`);
      }
      
      console.log(`✅ Successfully fetched data (attempt ${attempt})`);
      return response;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        throw new Error(`Failed to fetch after ${retries} attempts. Last error: ${error.message}`);
      }
      
      // Calculate delay with exponential backoff
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

async function syncEvents() {
  // Check if sync is enabled and API URL is set
  console.log('SYNC_EVENTS_ENABLED value:', process.env.SYNC_EVENTS_ENABLED, 'type:', typeof process.env.SYNC_EVENTS_ENABLED);
  if (process.env.SYNC_EVENTS_ENABLED !== 'true') {
    console.log('Events sync is disabled');
    return;
  }

  if (!process.env.EVENTS_API_URL) {
    console.error('EVENTS_API_URL environment variable is not set');
    return;
  }
  
  console.log('🔄 Starting events sync...');
  
  try {
    const response = await fetchWithRetry(process.env.EVENTS_API_URL);

    const responseText = await response.text();
    // console.log('Raw response:', responseText);
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      return;
    }

    if (!responseData.data) {
      console.error('Response does not contain data array:', responseData);
      return;
    }

    const { data } = responseData;
    
    // Filter all event types
    // console.log('Processing events:', data);
    
    const technicalEvents = data.filter(event => {
      if (!event || !event.attributes || !event.attributes.class) {
        console.error('Malformed event object:', event);
        return false;
      }
      return event.attributes.class === 'technical'
    });

    const nonTechnicalEvents = data.filter(event => {
      if (!event || !event.attributes || !event.attributes.class) {
        console.error('Malformed event object:', event);
        return false;
      }
      return event.attributes.class === 'non-technical'
    });

    const workshopEvents = data.filter(event => {
      if (!event || !event.attributes || !event.attributes.class) {
        console.error('Malformed event object:', event);
        return false;
      }
      return event.attributes.class === 'workshop'
    });

    console.log(`Found ${technicalEvents.length} technical events`);
    console.log(`Found ${nonTechnicalEvents.length} non-technical events`);
    console.log(`Found ${workshopEvents.length} workshop events`);

    // Process technical events
    for (const event of technicalEvents) {
      // Map the department name
      const ourDeptName = DEPARTMENT_MAPPING[event.attributes.department];
      if (!ourDeptName) {
        console.error(`Unknown department mapping for: ${event.attributes.department}`);
        continue;
      }

      // Get department ID
      const deptResult = await db.query(
        'SELECT id FROM departments WHERE name = $1',
        [ourDeptName]
      );
      
      if (deptResult.rows.length === 0) {
        console.error(`Department ${ourDeptName} not found`);
        continue;
      }

      try {
        // Determine cost (technical default null)
        const cost = null;
        // Upsert the event
        await db.query(`
          INSERT INTO events (external_id, name, department_id, event_type, cost)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (external_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            department_id = EXCLUDED.department_id,
            event_type = EXCLUDED.event_type,
            cost = EXCLUDED.cost
          `,
          [event.id, event.attributes.name, deptResult.rows[0].id, 'technical', cost]
        );
        console.log(`Synced event: ${event.attributes.name} - ${event.attributes.department}`);
      } catch (error) {
        console.error(`Error syncing event ${event.attributes.name}:`, error);
      }
    }

    // Process workshop events
    for (const event of workshopEvents) {
      // Get workshop department ID
      const workshopDeptResult = await db.query(
        'SELECT id FROM departments WHERE name = $1',
        ['WORKSHOP']
      );
      
      if (workshopDeptResult.rows.length === 0) {
        console.error('WORKSHOP department not found');
        continue;
      }

      try {
        // Cost from API or default
        const cost = typeof event.attributes.cost === 'number' ? event.attributes.cost : Number(process.env.WORKSHOP_PRICE || 300);
        // Upsert the workshop event
        await db.query(`
          INSERT INTO events (external_id, name, department_id, event_type, cost)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (external_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            department_id = EXCLUDED.department_id,
            event_type = EXCLUDED.event_type,
            cost = EXCLUDED.cost
          `,
          [event.id, event.attributes.name, workshopDeptResult.rows[0].id, 'workshop', cost]
        );
        console.log(`Synced workshop: ${event.attributes.name}`);
      } catch (error) {
        console.error(`Error syncing workshop ${event.attributes.name}:`, error);
      }
    }

    // Process non-technical events
    for (const event of nonTechnicalEvents) {
      // Map the department name (same as technical events)
      const ourDeptName = DEPARTMENT_MAPPING[event.attributes.department];
      if (!ourDeptName) {
        console.error(`Unknown department mapping for: ${event.attributes.department}`);
        continue;
      }

      // Get department ID
      const deptResult = await db.query(
        'SELECT id FROM departments WHERE name = $1',
        [ourDeptName]
      );
      
      if (deptResult.rows.length === 0) {
        console.error(`Department ${ourDeptName} not found`);
        continue;
      }

      try {
        // Cost from API or default
        const cost = typeof event.attributes.cost === 'number' ? event.attributes.cost : Number(process.env.NON_TECH_DEFAULT_PRICE || 300);
        // Upsert the non-technical event
        await db.query(`
          INSERT INTO events (external_id, name, department_id, event_type, cost)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (external_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            department_id = EXCLUDED.department_id,
            event_type = EXCLUDED.event_type,
            cost = EXCLUDED.cost
          `,
          [event.id, event.attributes.name, deptResult.rows[0].id, 'non-technical', cost]
        );
        console.log(`Synced non-technical event: ${event.attributes.name} - ${event.attributes.department}`);
      } catch (error) {
        console.error(`Error syncing non-technical event ${event.attributes.name}:`, error);
      }
    }

    console.log('✅ Events sync completed successfully');
    consecutiveFailures = 0; // Reset failure counter on success
    lastSuccessfulSync = new Date();
  } catch (error) {
    consecutiveFailures++;
    console.error(`❌ Events sync failed (consecutive failures: ${consecutiveFailures}):`, error.message);
    
    // Log additional context for debugging
    if (error.message.includes('ETIMEDOUT')) {
      console.error('🔍 Network timeout detected - this may be due to slow external API response');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('🔍 Connection refused - external API may be down');
    } else if (error.message.includes('Failed to fetch after')) {
      console.error('🔍 Multiple retry attempts failed - external API may be experiencing issues');
    }
    
    // Log sync status
    if (lastSuccessfulSync) {
      const timeSinceLastSuccess = Math.round((new Date() - lastSuccessfulSync) / 1000);
      console.error(`⏰ Last successful sync: ${timeSinceLastSuccess} seconds ago`);
    } else {
      console.error('⏰ No successful sync recorded yet');
    }
    
    // Don't throw the error - let the cron job continue running
    // The next scheduled run will attempt to sync again
  }
}

module.exports = { syncEvents };
