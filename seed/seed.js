// ============================================================
//  EVENT HORIZON SCANNER — TICKET SEEDER (per event)
//
//  Seeds 50,200 tickets for ONE event:
//    - 48,800 regular
//    -    200 guest_list
//    -    200 external
//
//  Usage:
//    node seed.js                    ← shows event menu
//    node seed.js --event 1          ← seeds Trip Presents
//    node seed.js --event 2          ← seeds Summer Music Festival
//    node seed.js --event all        ← seeds all 5 events
//    node seed.js --reset --event 1  ← clears then re-seeds event 1
//
//  Install deps first:
//    npm install @supabase/supabase-js
// ============================================================

const { createClient } = require('@supabase/supabase-js');

// ─── CONFIG ──────────────────────────────────────────────────
const SUPABASE_URL         = 'https://foecjoxoibbvuwxjwbns.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvZWNqb3hvaWJidnV3eGp3Ym5zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIwOTIwNSwiZXhwIjoyMDg4Nzg1MjA1fQ.vL8zEpV8mdHReG3n18CCy8aT_FRVJ_8vwB2852HKQIU';
// ─────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 500;

// Must match UUIDs from events_schema.sql
const EVENTS = [
  { index: 1, id: 'a1000000-0000-0000-0000-000000000001', name: 'Trip Presents',         short: 'TP'  },
  { index: 2, id: 'a1000000-0000-0000-0000-000000000002', name: 'Summer Music Festival',  short: 'SMF' },
  { index: 3, id: 'a1000000-0000-0000-0000-000000000003', name: 'Electronic Nights',      short: 'EN'  },
  { index: 4, id: 'a1000000-0000-0000-0000-000000000004', name: 'Jazz Under Stars',       short: 'JUS' },
  { index: 5, id: 'a1000000-0000-0000-0000-000000000005', name: 'Neon City Rave',         short: 'NCR' },
];

const COUNTS = { regular: 48800, guest_list: 200, external: 200 };

// ─── NAME POOLS ───────────────────────────────────────────────
const FIRST = [
  'Aarav','Aanya','Abhinav','Aditi','Akash','Akira','Amir','Amira',
  'Ananya','Anil','Anita','Anjali','Arjun','Aryan','Asha','Ashwin',
  'Ayaan','Ayesha','Bhavya','Carlos','Chetan','Daniel','Deepa','Deepak',
  'Divya','Elena','Farhan','Fatima','Gautam','Harini','Ishaan','Isha',
  'James','Jaya','Karthik','Kavya','Kenji','Kiara','Krish','Lakshmi',
  'Layla','Mahesh','Manish','Maria','Meera','Mohammed','Mohan','Nadia',
  'Nandini','Neha','Nikhil','Nisha','Omar','Pavan','Pooja','Pradeep',
  'Pranav','Priya','Rachel','Rahul','Raj','Rajesh','Ramesh','Ravi',
  'Reena','Ritika','Rohit','Roshan','Riya','Sachin','Sahil','Sai',
  'Sakshi','Sanjay','Sara','Sarita','Shashi','Shreya','Simran','Sneha',
  'Sonia','Sunil','Sunita','Suresh','Tanvi','Tarun','Usha','Varun',
  'Vikram','Vimal','Vineeth','Vishal','Yamini','Yash','Zara','Zoya',
];
const LAST = [
  'Agarwal','Ahmed','Arora','Bhat','Chadha','Chakraborty','Chandra',
  'Chatterjee','Chauhan','Chopra','Das','Desai','Deshpande','Dubey',
  'Dutta','Gandhi','Ghosh','Gill','Goswami','Grover','Gupta','Iyer',
  'Jain','Jha','Joshi','Kapoor','Kaur','Khan','Khanna','Kumar',
  'Lal','Malhotra','Mehta','Mishra','Mukherjee','Murthy','Nair',
  'Narayanan','Pandey','Patel','Pillai','Rao','Rastogi','Reddy',
  'Roy','Sahoo','Sen','Shah','Sharma','Shukla','Singh','Sinha',
  'Srivastava','Subramanian','Tiwari','Trivedi','Varma','Verma','Yadav',
];

const rand       = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomName = ()    => `${rand(FIRST)} ${rand(LAST)}`;
const chunk      = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ─── GENERATE TICKETS ─────────────────────────────────────────

function generateTickets(event) {
  const tickets = [];
  let seq = 1;

  const add = (type, count) => {
    for (let i = 0; i < count; i++) {
      tickets.push({
        ticket_id:   `${event.short}-${String(seq++).padStart(5, '0')}`,
        event_id:    event.id,
        name:        randomName(),
        ticket_type: type,
        status:      'valid',
      });
    }
  };

  add('regular',    COUNTS.regular);
  add('guest_list', COUNTS.guest_list);
  add('external',   COUNTS.external);
  return tickets;
}

// ─── INSERT WITH PROGRESS BAR ─────────────────────────────────

async function insertBatches(tickets) {
  const batches = chunk(tickets, BATCH_SIZE);
  let inserted = 0, failed = 0;

  for (let i = 0; i < batches.length; i++) {
    const { error } = await supabase.from('tickets').insert(batches[i]);
    if (error) {
      process.stderr.write(`\n❌  Batch ${i + 1} error: ${error.message}\n`);
      failed += batches[i].length;
    } else {
      inserted += batches[i].length;
    }

    const pct    = Math.round(((i + 1) / batches.length) * 100);
    const filled = Math.round(pct / 2);
    const bar    = '█'.repeat(filled) + '░'.repeat(50 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}% — ${inserted.toLocaleString()} inserted`);

    await new Promise(r => setTimeout(r, 40));
  }
  return { inserted, failed };
}

// ─── SEED ONE EVENT ───────────────────────────────────────────

async function seedEvent(event, reset = false) {
  console.log(`\n🎫  Seeding: ${event.name} (${event.short})`);
  console.log('─'.repeat(55));

  const { count } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', event.id);

  if (count > 0 && !reset) {
    console.log(`⚠️   Already has ${count.toLocaleString()} tickets. Skipping.`);
    console.log(`    Use --reset to clear and re-seed.\n`);
    return;
  }

  if (reset && count > 0) {
    console.log(`🗑️   Clearing ${count.toLocaleString()} existing tickets...`);
    const { error } = await supabase.from('tickets').delete().eq('event_id', event.id);
    if (error) { console.error('Clear failed:', error.message); return; }
    console.log('✓   Cleared.\n');
  }

  const total = COUNTS.regular + COUNTS.guest_list + COUNTS.external;
  console.log(`📦  Generating ${total.toLocaleString()} tickets...`);
  console.log(`    Regular: ${COUNTS.regular.toLocaleString()} | Guest List: ${COUNTS.guest_list} | External: ${COUNTS.external}`);
  console.log(`    ${Math.ceil(total / BATCH_SIZE)} batches of ${BATCH_SIZE}\n`);

  const tickets   = generateTickets(event);
  const startTime = Date.now();
  const { inserted, failed } = await insertBatches(tickets);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n\n${'─'.repeat(55)}`);
  console.log(`✅  Done in ${elapsed}s`);
  console.log(`📊  Inserted : ${inserted.toLocaleString()}`);
  if (failed > 0) console.log(`⚠️   Failed   : ${failed.toLocaleString()}`);

  // Print sample IDs per type (useful for QR testing)
  console.log(`\n📋  Sample ticket IDs:`);
  ['regular', 'guest_list', 'external'].forEach(type => {
    const samples = tickets.filter(t => t.ticket_type === type).slice(0, 3);
    samples.forEach(t =>
      console.log(`   ${t.ticket_id.padEnd(12)} | ${t.name.padEnd(28)} | ${t.ticket_type}`)
    );
  });
  console.log('');
}

// ─── CLI ENTRY ────────────────────────────────────────────────

async function main() {
  const args  = process.argv.slice(2);
  const reset = args.includes('--reset');
  const eIdx  = args.indexOf('--event');
  const eVal  = eIdx !== -1 ? args[eIdx + 1] : null;

  console.log('\n🚀  Event Horizon Scanner — Ticket Seeder');

  if (!eVal) {
    console.log('\nAvailable events:\n');
    EVENTS.forEach(e =>
      console.log(`  --event ${e.index}   ${e.name}  (${e.short}-00001 … ${e.short}-50200)`)
    );
    console.log(`\n  --event all   Seed all 5 events`);
    console.log(`\nExamples:`);
    console.log(`  node seed.js --event 1`);
    console.log(`  node seed.js --event all`);
    console.log(`  node seed.js --reset --event 2\n`);
    return;
  }

  if (eVal === 'all') {
    for (const event of EVENTS) await seedEvent(event, reset);
    console.log('🎉  All events seeded.\n');
  } else {
    const event = EVENTS.find(e => e.index === parseInt(eVal, 10));
    if (!event) {
      console.error(`\n❌  Unknown event: ${eVal}. Use 1–5 or "all".\n`);
      process.exit(1);
    }
    await seedEvent(event, reset);
    console.log('🎉  Done.\n');
  }
}

main().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  process.exit(1);
});