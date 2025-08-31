// jobs/syncEvents.js
const db = require('../db');

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
  
  console.log('Starting events sync...');
  console.log('Fetching from:', process.env.EVENTS_API_URL);
  
  try {
    const response = await fetch(process.env.EVENTS_API_URL);
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

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
    
    // Filter technical events
    console.log('Processing events:', data);
    
    const technicalEvents = data.filter(event => {
      if (!event || !event.attributes || !event.attributes.class) {
        console.error('Malformed event object:', event);
        return false;
      }
      return event.attributes.class === 'technical'
    });

    console.log(`Found ${technicalEvents.length} technical events`);

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
        // Upsert the event
        await db.query(`
          INSERT INTO events (external_id, name, department_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (external_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            department_id = EXCLUDED.department_id
          `,
          [event.id, event.attributes.name, deptResult.rows[0].id]
        );
        console.log(`Synced event: ${event.attributes.name}`);
      } catch (error) {
        console.error(`Error syncing event ${event.attributes.name}:`, error);
      }
    }

    console.log('Events sync completed successfully');
  } catch (error) {
    console.error('Error in events sync:', error);
  }
}

module.exports = { syncEvents };
