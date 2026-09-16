const bcrypt = require('bcryptjs');
const { query, initDb } = require('../config/db');

async function seedInitialData() {
  console.log('[Seeder] Checking and provisioning initial data...');
  await initDb();

  // 1. Check if admins exist
  const [existingAdmins] = await query('SELECT count(*) as count FROM admins');
  const adminCount = existingAdmins[0].count || existingAdmins[0]['count(*)'] || 0;

  if (adminCount === 0) {
    console.log('[Seeder] Seeding initial Admin accounts (Student Coordinator, HOD, Registration Admin)...');
    const coordPass = process.env.INITIAL_ADMIN_PASSWORD || 'INTELLIX';
    const coordHash = await bcrypt.hash(coordPass, 10);
    const hodHash = await bcrypt.hash(process.env.HOD_ADMIN_PASSWORD || 'INTELLIX', 10);
    const regHash = await bcrypt.hash(process.env.REG_ADMIN_PASSWORD || 'INTELLIX', 10);

    // Insert Student Coordinator (Super Admin)
    const [cRes] = await query(
      `INSERT INTO admins (username, password_hash, full_name, email, role, is_active)
       VALUES (?, ?, ?, ?, 'coordinator', 1)`,
      [
        process.env.INITIAL_ADMIN_USERNAME || 'mashood',
        coordHash,
        'Mashood (Student Coordinator)',
        process.env.INITIAL_ADMIN_EMAIL || 'coordinator@intellix-association.edu'
      ]
    );
    const coordId = cRes.insertId;

    await query(
      `INSERT INTO admin_permissions 
       (admin_id, can_view_registrations, can_manage_registrations, can_mark_attendance, can_create_events, can_delete_events, can_generate_certificates, can_manage_admins)
       VALUES (?, 1, 1, 1, 1, 1, 1, 1)`,
      [coordId]
    );

    // Insert HOD (Supervisory Admin)
    const [hRes] = await query(
      `INSERT INTO admins (username, password_hash, full_name, email, role, is_active)
       VALUES (?, ?, ?, ?, 'hod', 1)`,
      [
        'MEENU ALEX',
        hodHash,
        'Meenu Alex (Head of Department)',
        'hod@intellix-association.edu'
      ]
    );
    const hodId = hRes.insertId;

    await query(
      `INSERT INTO admin_permissions 
       (admin_id, can_view_registrations, can_manage_registrations, can_mark_attendance, can_create_events, can_delete_events, can_generate_certificates, can_manage_admins)
       VALUES (?, 1, 0, 0, 0, 0, 0, 0)`,
      [hodId]
    );

    // Insert Registration Admin
    const [rRes] = await query(
      `INSERT INTO admins (username, password_hash, full_name, email, role, is_active)
       VALUES (?, ?, ?, ?, 'registration_admin', 1)`,
      [
        'faculty',
        regHash,
        'Faculty (Registration Admin)',
        'faculty@intellix-association.edu'
      ]
    );
    const regAdminId = rRes.insertId;

    await query(
      `INSERT INTO admin_permissions 
       (admin_id, can_view_registrations, can_manage_registrations, can_mark_attendance, can_create_events, can_delete_events, can_generate_certificates, can_manage_admins)
       VALUES (?, 1, 1, 1, 0, 0, 1, 0)`,
      [regAdminId]
    );

    console.log('[Seeder] Created default accounts:');
    console.log('   - Student Coordinator: "mashood" / "INTELLIX"');
    console.log('   - HOD: "MEENU ALEX" / "INTELLIX"');
    console.log('   - Registration Admin: "faculty" / "INTELLIX"');
  }

  // 2. Check and seed sample events
  const [existingEvents] = await query('SELECT count(*) as count FROM events');
  const eventCount = existingEvents[0].count || existingEvents[0]['count(*)'] || 0;

  if (eventCount === 0) {
    console.log('[Seeder] Seeding initial events...');

    // Event 1: Code Hunt 2026 (Upcoming)
    const [e1] = await query(
      `INSERT INTO events 
       (code, title, slug, event_type, start_datetime, end_datetime, venue, description, rules, status, registration_open, registration_start, registration_deadline, max_participants, confirmation_message, cert_enabled, cert_title, cert_description, cert_signatory_name, cert_signatory_designation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        'CH26',
        'Code Hunt 2026: Algorithmic Treasure Quest',
        'code-hunt-2026',
        'Technical Competition',
        '2026-10-10 09:30:00',
        '2026-10-10 16:30:00',
        'Turing Computing Hall, Block B',
        'An intense fast-paced algorithmic problem-solving and cryptographic puzzle quest designed to test logic, coding agility, and teamwork under strict time limits.',
        '1. Individual or Duo participation permitted.\n2. Languages allowed: Python, C++, Java.\n3. Internet access is restricted to official documentation.\n4. Decisions of the jury will be final and binding.',
        '2026-09-01 00:00:00',
        '2026-10-08 23:59:59',
        120,
        'Congratulations! Your registration for Code Hunt 2026 is confirmed. Please bring your student ID and the registration pass.',
        'Certificate of Excellence & Participation',
        'For successfully qualifying and demonstrating algorithmic prowess in Code Hunt 2026.',
        'Dr. Eleanor Sterling',
        'Head of Department, AI & ML'
      ]
    );
    const event1Id = e1.insertId;

    // Assign event 1 to faculty (registration admin)
    const [admins] = await query("SELECT id FROM admins WHERE username = 'faculty'");
    if (admins.length > 0) {
      await query('INSERT INTO admin_assigned_events (admin_id, event_id) VALUES (?, ?)', [admins[0].id, event1Id]);
    }

    // Dynamic Form Fields for Code Hunt
    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event1Id, 'Preferred Programming Language', 'preferred_language', 'dropdown', 1, JSON.stringify(['Python 3.12', 'C++ 20', 'Java 21']), 1]
    );

    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event1Id, 'Participation Mode', 'participation_mode', 'radio', 1, JSON.stringify(['Individual', 'Team of 2']), 2]
    );

    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event1Id, 'Teammate Full Name & Reg No (If Team)', 'teammate_details', 'text', 0, null, 3]
    );

    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event1Id, 'GitHub Profile URL', 'github_url', 'text', 0, null, 4]
    );

    // Event 2: Neural Hack 2026 (Upcoming Hackathon)
    const [e2] = await query(
      `INSERT INTO events 
       (code, title, slug, event_type, start_datetime, end_datetime, venue, description, rules, status, registration_open, registration_start, registration_deadline, max_participants, confirmation_message, cert_enabled, cert_title, cert_description, cert_signatory_name, cert_signatory_designation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        'NH26',
        'Neural Hack: 24-Hour AI & ML Hackathon',
        'neural-hack-2026',
        'Hackathon',
        '2026-11-05 10:00:00',
        '2026-11-06 10:00:00',
        'Innovation & Research Lab, Central Block',
        'A round-the-clock intensive hackathon solving real-world challenges with generative AI, computer vision, and predictive modeling.',
        '1. Teams must consist of 2 to 4 members.\n2. All code must be written during the hackathon window.\n3. Open source APIs and public models are allowed.',
        '2026-09-10 00:00:00',
        '2026-11-01 23:59:59',
        60,
        'Your team slot has been provisioned for Neural Hack 2026. Review rules and prepare your environment!',
        'Certificate of Achievement & Participation',
        'Awarded for developing an AI prototype at Neural Hack 2026.',
        'Dr. Eleanor Sterling',
        'Head of Department, AI & ML'
      ]
    );
    const event2Id = e2.insertId;

    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event2Id, 'Team Name', 'team_name', 'text', 1, null, 1]
    );

    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event2Id, 'Hackathon Track', 'hackathon_track', 'dropdown', 1, JSON.stringify(['Healthcare AI', 'Autonomous Systems', 'Generative Media', 'EdTech & Accessibility']), 2]
    );

    await query(
      `INSERT INTO event_form_fields (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event2Id, 'Project Abstract & Tech Stack Idea', 'project_abstract', 'textarea', 0, null, 3]
    );

    // Event 3: Completed Event (AI Nexus Symposium)
    const [e3] = await query(
      `INSERT INTO events 
       (code, title, slug, event_type, start_datetime, end_datetime, venue, description, rules, status, registration_open, registration_start, registration_deadline, max_participants, confirmation_message, cert_enabled, cert_title, cert_description, cert_signatory_name, cert_signatory_designation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 0, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        'NEX26',
        'AI Nexus: National Student Symposium',
        'ai-nexus-symposium',
        'Symposium',
        '2026-08-15 09:00:00',
        '2026-08-15 17:00:00',
        'Auditorium A',
        'Annual national symposium featuring paper presentations, keynotes by industry researchers, and tech expo.',
        'Standard university code of conduct applied.',
        '2026-07-01 00:00:00',
        '2026-08-10 23:59:59',
        250,
        'Event successfully concluded.',
        'Certificate of Participation',
        'For active participation in AI Nexus National Symposium 2026.',
        'Dr. Eleanor Sterling',
        'Head of Department, AI & ML'
      ]
    );
    const event3Id = e3.insertId;

    // Seed sample participant registration in completed event for verification & certificate demo
    const [reg1] = await query(
      `INSERT INTO event_registrations 
       (registration_code, event_id, full_name, register_number, department, semester, email, phone, qr_code_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'INTELLIX-NEX-2026-0001',
        event3Id,
        'Mashood',
        '921721106001',
        'Artificial Intelligence & Data Science',
        'Semester 6',
        'mashood.student@intellix-association.edu',
        '+91 98765 43210',
        'REG:INTELLIX-NEX-2026-0001'
      ]
    );
    const reg1Id = reg1.insertId;

    // Mark attendance as present
    await query(
      `INSERT INTO attendance (registration_id, event_id, status, marked_at)
       VALUES (?, ?, 'present', CURRENT_TIMESTAMP)`,
      [reg1Id, event3Id]
    );

    // Issue certificate
    await query(
      `INSERT INTO certificates 
       (certificate_code, registration_id, event_id, certificate_type, title, issue_date, qr_code_data)
       VALUES (?, ?, ?, 'participation', ?, '2026-08-16', ?)`,
      [
        'INTELLIX-CERT-2026-0001',
        reg1Id,
        event3Id,
        'Certificate of Participation - AI Nexus',
        'CERT:INTELLIX-CERT-2026-0001'
      ]
    );
  }

  // 3. Seed Achievements
  const [existingAch] = await query('SELECT count(*) as count FROM achievements');
  const achCount = existingAch[0].count || existingAch[0]['count(*)'] || 0;
  if (achCount === 0) {
    console.log('[Seeder] Seeding achievements...');
    await query(
      `INSERT INTO achievements (title, student_team_name, position, event_date, description, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        '1st Place - Smart India Hackathon',
        'Team Synapse (Lead: Mashood, Sarah, Rohan, Priya)',
        '1st Prize & Gold Trophy',
        '2026-07-22',
        'Secured the national top prize in the Ministry of Education track for developing an edge-computed real-time anomaly detection system.',
        '/images/achievements/sih.svg'
      ]
    );

    await query(
      `INSERT INTO achievements (title, student_team_name, position, event_date, description, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'Winners - State Level E-Football Championship',
        'Kiran V & Team Apex',
        'Championship Winners',
        '2026-06-18',
        'Undefeated champions at the Inter-Collegiate Esports Arena 2026 featuring 32 university teams.',
        '/images/achievements/gaming.svg'
      ]
    );

    await query(
      `INSERT INTO achievements (title, student_team_name, position, event_date, description, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        '2nd Place - National Algorithmic Sprint',
        'Deepak Kumar',
        '1st Runner-Up',
        '2026-05-14',
        'Solved 6 competitive programming problems in 88 minutes with zero compilation penalties.',
        '/images/achievements/coding.svg'
      ]
    );
  }

  // 4. Seed Association Members
  const [existingMembers] = await query('SELECT count(*) as count FROM association_members');
  const memberCount = existingMembers[0].count || existingMembers[0]['count(*)'] || 0;
  if (memberCount === 0) {
    console.log('[Seeder] Seeding association executive members...');
    const members = [
      ['Dr. Eleanor Sterling', 'Faculty Patron & HOD', 'AI & Machine Learning', 'Ph.D. in Deep Learning with 18+ years of academic research and industry mentorship.', 1],
      ['Mashood', 'Student Coordinator & President', 'AI & Data Science', 'Overall operational lead, architecting association initiatives, technical hackathons, and student mentorship.', 2],
      ['Sarah Jenkins', 'Secretary & Operations Lead', 'Artificial Intelligence', 'Directs event scheduling, student registrations, inter-department coordination, and communication.', 3],
      ['Rohan Gupta', 'Treasurer & Logistics Head', 'Computer Science & AI', 'Manages event budgeting, sponsorships, infrastructure arrangements, and logistics procurement.', 4],
      ['Ananya Sharma', 'Technical Head', 'AI & Machine Learning', 'Oversees competitive coding bootcamps, automated testing labs, and development workshops.', 5],
      ['Kevin Peter', 'Creative & Media Lead', 'AI & Data Science', 'Head of visual design, branding, promotional posters, and media production.', 6]
    ];

    for (const m of members) {
      await query(
        `INSERT INTO association_members (name, role, department, short_bio, display_order, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        m
      );
    }
  }

  // 5. Seed About Us Content
  try {
    const [existingAbout] = await query('SELECT count(*) as count FROM about_us');
    const aboutCount = existingAbout[0].count || existingAbout[0]['count(*)'] || 0;
    if (aboutCount === 0) {
      console.log('[Seeder] Seeding official INTELLIX About Us content...');
      await query(
        `INSERT INTO about_us 
         (title, subtitle, badge_text, description, purpose, vision, activities, student_engagement, quote_text, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'INTELLIX Association',
          'Department of Artificial Intelligence & Machine Learning • AL-AZHAR College of Engineering & Technology',
          'ABOUT OUR ASSOCIATION',
          'INTELLIX is the premier student-led technical association of the Department of Artificial Intelligence & Machine Learning at AL-AZHAR College of Engineering and Technology. Established to bridge classroom theory with state-of-the-art technological reality, INTELLIX cultivates a high-energy ecosystem where aspiring engineers, researchers, and creators turn bold ideas into impactful reality.',
          'To empower students through experiential engineering, analytical mastery, and collaborative building. We guide undergraduates from fundamental programming to advanced deep learning architectures, fostering professional ethics and real-world competence.',
          'To emerge as a regional and national benchmark for student technical innovation, shaping future-ready AI leaders, ethical technologists, and startup pioneers capable of solving complex societal and industrial problems.',
          'Throughout the academic year, INTELLIX drives flagship 24-hour hackathons, algorithmic code hunts, applied machine learning workshops, paper presentation symposiums, and tech expos. Each event is curated to challenge limits and stimulate technical mastery.',
          'Students are at the very core of INTELLIX. Through dedicated peer learning circles, open-source incubation cohorts, hands-on lab sprints, and inter-college symposium delegations, we ensure every student gains tangible engineering exposure and leadership acumen.',
          'Igniting Ideas, Inspiring Innovation, Building Intelligence.',
          'Student Coordinator'
        ]
      );
    }
  } catch (aboutErr) {
    console.warn('[Seeder] Could not seed about_us table (will be created automatically):', aboutErr.message);
  }

  console.log('[Seeder] Database initialization & seeding completed successfully.');
}

if (require.main === module) {
  seedInitialData().then(() => process.exit(0)).catch(err => {
    console.error('[Seeder] Error seeding data:', err);
    process.exit(1);
  });
}

module.exports = { seedInitialData };
