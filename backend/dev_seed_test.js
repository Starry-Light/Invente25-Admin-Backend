// dev_seed_test.js - comprehensive test data seeding
require('dotenv').config();
const db = require('./src/db');
const { v4: uuidv4 } = require('uuid');

const EVENT_IDS = [3, 4, 9, 10, 8, 17, 19];
const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EEE', 'MECH'];
const PAYMENT_METHODS = ['cash', 'upi', 'card'];

// Generate a random date between start and end
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate test users
const TEST_USERS = [
  { email: 'alice@example.com', name: 'Alice Johnson', phone: '9876543210' },
  { email: 'bob@example.com', name: 'Bob Smith', phone: '9876543211' },
  { email: 'carol@example.com', name: 'Carol Williams', phone: '9876543212' },
  { email: 'david@example.com', name: 'David Brown', phone: '9876543213' },
  { email: 'eve@example.com', name: 'Eve Davis', phone: '9876543214' },
  { email: 'frank@example.com', name: 'Frank Miller', phone: '9876543215' },
  { email: 'grace@example.com', name: 'Grace Wilson', phone: '9876543216' },
  { email: 'henry@example.com', name: 'Henry Taylor', phone: '9876543217' }
];

async function seedTestData() {
  try {
    console.log('Starting test data seeding...');

    // 1. Seed departments
    console.log('Seeding departments...');
    for (const deptName of DEPARTMENTS) {
      await db.query(
        `INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [deptName]
      );
    }

    // 2. Seed events (these will be populated by sync, but we need the IDs)
    console.log('Creating event placeholders...');
    for (const eventId of EVENT_IDS) {
      await db.query(
        'INSERT INTO events (external_id, name, department_id, registrations) ' +
        'VALUES ($1, $2, (SELECT id FROM departments ORDER BY random() LIMIT 1), 0) ' +
        'ON CONFLICT (external_id) DO NOTHING',
        [
          eventId,
          'Event ' + eventId // Will be updated by sync
        ]
      );
    }

    // 3. Seed users
    console.log('Seeding users...');
    for (const user of TEST_USERS) {
      await db.query(
        'INSERT INTO users (email, name, phone) ' +
        'VALUES ($1, $2, $3) ' +
        'ON CONFLICT (email) DO UPDATE ' +
        'SET name=EXCLUDED.name, phone=EXCLUDED.phone',
        [user.email, user.name, user.phone]
      );
    }

    // 4. Create passes and slots with varying states
    console.log('Creating passes and slots...');
    const startDate = new Date('2025-09-01');
    const endDate = new Date('2025-09-02');

    for (const user of TEST_USERS) {
      // Create 2-3 passes for each user
      const numPasses = Math.floor(Math.random() * 2) + 2;
      
      for (let i = 0; i < numPasses; i++) {
        // Create pass with payment
        const paymentId = uuidv4();
        const method = PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)];
        
        // Create receipt
        await db.query(
          'INSERT INTO receipts (payment_id, email, method, phone, amount, paid_on, passGenerated) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, false)',
          [paymentId, user.email, method, user.phone, 100, randomDate(startDate, endDate)]
        );

        // Create pass
        const passRes = await db.query(
          'INSERT INTO passes (pass_id, user_email, payment_id, ticket_issued) VALUES ($1, $2, $3, false) RETURNING pass_id',
          [uuidv4(), user.email, paymentId]
        );
        const passId = passRes.rows[0].pass_id;

        // Create 1-2 slots for this pass
        const numSlots = Math.floor(Math.random() * 2) + 1;
        const assignedAt = randomDate(startDate, endDate);
        
        for (let j = 0; j < numSlots; j++) {
          // Random event
          const eventId = EVENT_IDS[Math.floor(Math.random() * EVENT_IDS.length)];
          // 70% chance of attendance if assigned
          const attended = Math.random() < 0.7;

          await db.query(
            'INSERT INTO slots (pass_id, slot_no, event_id, assigned_at, attended) VALUES ($1, $2, $3, $4, $5)',
            [passId, j + 1, eventId, assignedAt, attended]
          );
        }
      }
    }

    // Get some sample pass IDs for testing
    const samplePasses = await db.query('SELECT pass_id FROM passes LIMIT 3');

    console.log('=== Test seed complete ===');
    console.log('Created:');
    console.log('- Departments:', DEPARTMENTS.length);
    console.log('- Event placeholders:', EVENT_IDS.length);
    console.log('- Users:', TEST_USERS.length);
    console.log('- Approx. passes:', TEST_USERS.length * 2.5);
    console.log('- Approx. slots:', TEST_USERS.length * 2.5 * 1.5);
    console.log('');
    console.log('Sample Pass IDs for testing:');
    samplePasses.rows.forEach((row, i) => {
      console.log(`Pass ${i + 1}:`, row.pass_id);
      console.log(`Test scan: curl http://localhost:4000/scan/${row.pass_id}`);
    });
    console.log('');
    console.log('You can now:');
    console.log('1. Test scanning passes');
    console.log('2. View analytics');
    console.log('3. Check attendance');
    console.log('4. Test cash registration');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('Test seed error:', err);
    process.exit(1);
  }
}

seedTestData();
