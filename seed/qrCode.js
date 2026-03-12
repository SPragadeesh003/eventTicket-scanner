// ============================================================
//  EVENT HORIZON SCANNER — QR CODE GENERATOR
//
//  Generates individual PNG QR codes for testing.
//  Each PNG contains one ticket ID — scan it with the app.
//
//  Install deps first:
//    npm install qrcode
//
//  Usage:
//    node generate-qr.js              ← generates for Event 1 (TP), first 20 tickets
//    node generate-qr.js --event SMF  ← generates for Summer Music Festival
//    node generate-qr.js --count 50   ← generates 50 QR codes
//    node generate-qr.js --types all  ← includes guest_list + external types too
//
//  Output:
//    ./qr-codes/
//      TP-00001.png   (regular)
//      TP-00002.png   (regular)
//      ...
//      TP-48801.png   (guest_list)
//      TP-48802.png   (guest_list)
//      ...
//      TP-49001.png   (external)
//      ...
// ============================================================

const QRCode = require('qrcode');
const fs     = require('fs');
const path   = require('path');

// ─── CONFIG ──────────────────────────────────────────────────
const EVENTS_CONFIG = {
  TP:  { name: 'Trip Presents',         regular: [1, 48800],     guest_list: [48801, 49000], external: [49001, 49200] },
  SMF: { name: 'Summer Music Festival', regular: [1, 48800],     guest_list: [48801, 49000], external: [49001, 49200] },
  EN:  { name: 'Electronic Nights',     regular: [1, 48800],     guest_list: [48801, 49000], external: [49001, 49200] },
  JUS: { name: 'Jazz Under Stars',      regular: [1, 48800],     guest_list: [48801, 49000], external: [49001, 49200] },
  NCR: { name: 'Neon City Rave',        regular: [1, 48800],     guest_list: [48801, 49000], external: [49001, 49200] },
};

// QR appearance
const QR_OPTIONS = {
  type:           'png',
  width:          400,
  margin:         2,
  color: {
    dark:  '#000000',
    light: '#FFFFFF',
  },
  errorCorrectionLevel: 'H',
};
// ─────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const eventShort = getArg(args, '--event', 'TP').toUpperCase();
const count      = parseInt(getArg(args, '--count', '20'), 10);
const types      = getArg(args, '--types', 'regular');

function getArg(args, flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

function pad(n) { return String(n).padStart(5, '0'); }

async function generate() {
  const config = EVENTS_CONFIG[eventShort];
  if (!config) {
    console.error(`\n❌  Unknown event short code: ${eventShort}`);
    console.error(`    Valid: ${Object.keys(EVENTS_CONFIG).join(', ')}\n`);
    process.exit(1);
  }

  // Output folder
  const outDir = path.join(__dirname, 'qr-codes', eventShort);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🎟️   Event Horizon — QR Code Generator`);
  console.log('─'.repeat(50));
  console.log(`📅  Event     : ${config.name} (${eventShort})`);
  console.log(`🔢  Count     : ${count} per type`);
  console.log(`🏷️   Types     : ${types}`);
  console.log(`📁  Output    : ./qr-codes/${eventShort}/\n`);

  const typesToGenerate = types === 'all'
    ? ['regular', 'guest_list', 'external']
    : ['regular'];

  let total = 0;

  for (const type of typesToGenerate) {
    const [start] = config[type];
    const typeCount = Math.min(count, type === 'regular' ? 48800 : 200);

    console.log(`\n  Generating ${typeCount} ${type} QR codes...`);

    for (let i = 0; i < typeCount; i++) {
      const seq      = start + i;
      const ticketId = `${eventShort}-${pad(seq)}`;
      const filePath = path.join(outDir, `${ticketId}.png`);

      await QRCode.toFile(filePath, ticketId, QR_OPTIONS);

      total++;
      process.stdout.write(`\r    ${i + 1}/${typeCount} — ${ticketId}.png`);
    }
    console.log('');
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅  Generated ${total} QR code PNG files`);
  console.log(`📁  Location: ${path.resolve(outDir)}`);

  // Print ticket IDs generated (for reference)
  console.log(`\n📋  Ticket IDs generated:`);
  typesToGenerate.forEach(type => {
    const [start] = config[type];
    const typeCount = Math.min(count, type === 'regular' ? 48800 : 200);
    console.log(`\n  ${type.toUpperCase()}:`);
    for (let i = 0; i < Math.min(3, typeCount); i++) {
      console.log(`    ${eventShort}-${pad(start + i)}`);
    }
    if (typeCount > 3) console.log(`    ... up to ${eventShort}-${pad(start + typeCount - 1)}`);
  });

  console.log(`\n💡  Tip: Open the PNGs on a second phone/screen and scan them with the app.\n`);
}

generate().catch(err => {
  console.error('\n❌  Error:', err.message);
  process.exit(1);
});