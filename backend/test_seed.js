// test_seed.js - Comprehensive test data for all pass types
require('dotenv').config();
const db = require('./src/db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    console.log('🌱 Starting comprehensive test seed...');

    // 1. Create test users
    const users = [
      { email: 'alice@test.com', name: 'Alice Johnson', phone: '9999999999' },
      { email: 'bob@test.com', name: 'Bob Smith', phone: '8888888888' },
      { email: 'charlie@test.com', name: 'Charlie Brown', phone: '7777777777' },
      { email: 'diana@test.com', name: 'Diana Prince', phone: '6666666666' },
      { email: 'eve@test.com', name: 'Eve Wilson', phone: '5555555555' }
    ];

    console.log('👥 Creating test users...');
    for (const user of users) {
      await db.query(
        `INSERT INTO users (email, name, phone) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone`,
        [user.email, user.name, user.phone]
      );
    }

    // 2. Create test events for different types
    console.log('🎯 Creating test events...');
    
    // Technical events
    const techEvents = [
      { name: 'Algorithm Design', dept: 'CSE_SSN', external_id: 101 },
      { name: 'Machine Learning', dept: 'CSE_SSN', external_id: 102 },
      { name: 'Web Development', dept: 'IT', external_id: 103 },
      { name: 'IoT Workshop', dept: 'ECE', external_id: 104 }
    ];

    // Non-technical events (with per-event costs)
    const nonTechEvents = [
      { name: 'Cultural Dance', dept: 'COM', external_id: 201, cost: 150 },
      { name: 'Debate Competition', dept: 'COM', external_id: 202, cost: 200 },
      { name: 'Photography Contest', dept: 'COM', external_id: 203, cost: 250 }
    ];

    // Workshop events (with per-workshop costs)
    const workshopEvents = [
      { name: 'Python Basics', dept: 'WORKSHOP', external_id: 301, cost: 500 },
      { name: 'React Development', dept: 'WORKSHOP', external_id: 302, cost: 600 },
      { name: 'Data Science', dept: 'WORKSHOP', external_id: 303, cost: 450 }
    ];

    // Create all events (including cost where applicable)
    for (const event of [...techEvents, ...nonTechEvents, ...workshopEvents]) {
      const deptRes = await db.query('SELECT id FROM departments WHERE name = $1', [event.dept]);
      if (deptRes.rows.length > 0) {
        const deptId = deptRes.rows[0].id;
        const eventType = event.dept === 'WORKSHOP' ? 'workshop' : 
                         nonTechEvents.includes(event) ? 'non-technical' : 'technical';

        const cost = (eventType === 'non-technical' || eventType === 'workshop') ? event.cost : null;

        await db.query(
          `INSERT INTO events (external_id, name, department_id, event_type, cost)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (external_id)
           DO UPDATE SET name=EXCLUDED.name, department_id=EXCLUDED.department_id, event_type=EXCLUDED.event_type, cost=EXCLUDED.cost`,
          [event.external_id, event.name, deptId, eventType, cost]
        );
      }
    }

         // 3. Create technical event passes with slots
     console.log('🎫 Creating technical event passes...');
     const techPasses = [];
     
     for (let i = 0; i < 3; i++) {
       const user = users[i];
       const passId = uuidv4() + '$t';
       const paymentId = uuidv4(); // Use same payment_id for both pass and receipt
       
       // Create receipt FIRST (required for foreign key constraint)
       const techPrice = Number(process.env.TECH_PASS_PRICE || 300);
       await db.query(
         `INSERT INTO receipts (payment_id, email, method, phone, amount, paid_on, passGenerated) VALUES ($1, $2, 'cash', $3, $4, NOW(), true)`,
         [paymentId, user.email, user.phone, techPrice]
       );

       // Create pass AFTER receipt exists
       await db.query(
         `INSERT INTO passes (pass_id, user_email, payment_id, ticket_issued) VALUES ($1, $2, $3, true)`,
         [passId, user.email, paymentId]
       );

      // Assign 2-3 slots per pass
      const numSlots = Math.floor(Math.random() * 2) + 2; // 2-3 slots
      const selectedEvents = techEvents.sort(() => 0.5 - Math.random()).slice(0, numSlots);
      
      for (let j = 0; j < selectedEvents.length; j++) {
        const event = selectedEvents[j];
        const attended = Math.random() > 0.5; // Random attendance
        
        await db.query(
          `INSERT INTO slots (pass_id, slot_no, event_id, attended, created_at) VALUES ($1, $2, $3, $4, NOW())`,
          [passId, j + 1, event.external_id, attended]
        );
      }

      techPasses.push({ passId, user: user.name, email: user.email, events: selectedEvents.length });
    }

         // 4. Create non-technical event passes
     console.log('🎭 Creating non-technical event passes...');
     const nonTechPasses = [];
     
     for (let i = 0; i < 2; i++) {
       const user = users[i + 3];
       const passId = uuidv4() + '$n';
       const event = nonTechEvents[i];
       const paymentId = uuidv4(); // Use same payment_id for both pass and receipt
       
       // Create receipt FIRST (required for foreign key constraint)
       const nonTechPrice = Number(process.env.NON_TECH_DEFAULT_PRICE || 300);
       await db.query(
         `INSERT INTO receipts (payment_id, email, method, phone, amount, paid_on, passGenerated) VALUES ($1, $2, 'cash', $3, $4, NOW(), true)`,
         [paymentId, user.email, user.phone, nonTechPrice]
       );

       // Create pass AFTER receipt exists
       await db.query(
         `INSERT INTO passes (pass_id, user_email, payment_id, ticket_issued) VALUES ($1, $2, $3, true)`,
         [passId, user.email, paymentId]
       );

      // Create single slot for non-technical event
      const attended = Math.random() > 0.5;
      await db.query(
        `INSERT INTO slots (pass_id, slot_no, event_id, attended, created_at) VALUES ($1, 1, $2, $3, NOW())`,
        [passId, event.external_id, attended]
      );

      nonTechPasses.push({ passId, user: user.name, email: user.email, event: event.name });
    }

         // 5. Create workshop passes
     console.log('🔧 Creating workshop passes...');
     const workshopPasses = [];
     
     for (let i = 0; i < 2; i++) {
       const user = users[i + 1];
       const passId = uuidv4() + '$w';
       const event = workshopEvents[i];
       const paymentId = uuidv4(); // Use same payment_id for both pass and receipt
       
       // Create receipt FIRST (required for foreign key constraint)
       const workshopPrice = Number(process.env.WORKSHOP_PRICE || 300);
       await db.query(
         `INSERT INTO receipts (payment_id, email, method, phone, amount, paid_on, passGenerated) VALUES ($1, $2, 'cash', $3, $4, NOW(), true)`,
         [paymentId, user.email, user.phone, workshopPrice]
       );

       // Create pass AFTER receipt exists
       await db.query(
         `INSERT INTO passes (pass_id, user_email, payment_id, ticket_issued) VALUES ($1, $2, $3, true)`,
         [passId, user.email, paymentId]
       );

      // Create single slot for workshop
      const attended = Math.random() > 0.5;
      await db.query(
        `INSERT INTO slots (pass_id, slot_no, event_id, attended, created_at) VALUES ($1, 1, $2, $3, NOW())`,
        [passId, event.external_id, attended]
      );

      workshopPasses.push({ passId, user: user.name, email: user.email, event: event.name });
    }

    // 6. Create hackathon passes
    console.log('🏆 Creating hackathon passes...');
    const hackathonPasses = [];
    
    for (let i = 0; i < 2; i++) {
      const teamId = uuidv4() + '$h';
      const leader = users[i];
      const teamName = `Team ${i + 1}`;
      const track = i === 0 ? 'Web Development' : 'AI/ML';
      
      // Create hackathon pass
      await db.query(
        `INSERT INTO hack_passes (team_id, leader_email, team_name, track, payment_id, ticket_issued, attended) VALUES ($1, $2, $3, $4, $5, true, $6)`,
        [teamId, leader.email, teamName, track, uuidv4(), Math.random() > 0.5]
      );

      // Create team members (2-3 members per team)
      const numMembers = Math.floor(Math.random() * 2) + 2;
      const teamMembers = users.slice(i * 2, i * 2 + numMembers);
      
      for (const member of teamMembers) {
        await db.query(
          `INSERT INTO hack_reg_details (team_id, email, full_name, institution, phone_number) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (team_id, email) DO NOTHING`,
          [teamId, member.email, member.name, 'Test University', member.phone]
        );
      }

      hackathonPasses.push({ 
        teamId, 
        teamName, 
        track, 
        leader: leader.name, 
        members: teamMembers.length 
      });
    }

    // 7. Print summary
    console.log('\n✅ Test seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`👥 Users created: ${users.length}`);
    console.log(`🎯 Events created: ${techEvents.length + nonTechEvents.length + workshopEvents.length}`);
    console.log(`🎫 Technical passes: ${techPasses.length}`);
    console.log(`🎭 Non-technical passes: ${nonTechPasses.length}`);
    console.log(`🔧 Workshop passes: ${workshopPasses.length}`);
    console.log(`🏆 Hackathon passes: ${hackathonPasses.length}`);

    console.log('\n🧪 Test Pass IDs:');
    console.log('\n📋 Technical Event Passes (with slots):');
    techPasses.forEach(pass => {
      console.log(`  ${pass.passId} - ${pass.user} (${pass.events} events)`);
    });

    console.log('\n🎭 Non-Technical Event Passes:');
    nonTechPasses.forEach(pass => {
      console.log(`  ${pass.passId} - ${pass.user} (${pass.event})`);
    });

    console.log('\n🔧 Workshop Passes:');
    workshopPasses.forEach(pass => {
      console.log(`  ${pass.passId} - ${pass.user} (${pass.event})`);
    });

    console.log('\n🏆 Hackathon Passes:');
    hackathonPasses.forEach(pass => {
      console.log(`  ${pass.teamId} - ${pass.teamName} (${pass.track}, ${pass.members} members)`);
    });

    console.log('\n🔗 Test URLs:');
    console.log('Scan page: http://localhost:3000/scan');
    console.log('Attendance page: http://localhost:3000/attendance');
    console.log('\nExample scan commands:');
    console.log(`curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/scan/${techPasses[0].passId}`);
    console.log(`curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/scan/${nonTechPasses[0].passId}`);
    console.log(`curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/scan/${workshopPasses[0].passId}`);
    console.log(`curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/scan/${hackathonPasses[0].teamId}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Test seed error:', err);
    process.exit(1);
  }
}

run();
