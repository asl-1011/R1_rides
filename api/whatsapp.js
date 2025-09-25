import mongoose from 'mongoose';
import twilio from 'twilio';
import { parse, format } from 'date-fns';

const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, MONGO_URI } = process.env;

// ========== MongoDB Setup ==========
if (!mongoose.connection.readyState) {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ Connected to MongoDB');
}

// ========== Schemas ==========
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  jid: { type: String, unique: true },
  name: String,
  createdAt: { type: Date, default: Date.now },
}));

const Session = mongoose.models.Session || mongoose.model('Session', new mongoose.Schema({
  jid: { type: String, unique: true },
  step: { type: Number, default: 0 },
  booking: { type: Object, default: {} },
}));

const Booking = mongoose.models.Booking || mongoose.model('Booking', new mongoose.Schema({
  jid: String,
  bookingId: String,
  pickup: String,
  drop: String,
  time: String,
  status: { type: String, default: 'pending' },
  fare: Number,
  createdAt: { type: Date, default: Date.now },
}));

// ========== Helpers ==========
function generateBookingId() {
  return 'CAB' + Math.floor(1000 + Math.random() * 9000);
}

function normalizeTime(input) {
  if (!input) return null;
  const clean = input.toLowerCase().trim();
  if (clean === 'now') return 'Now';
  if (clean === 'later') return 'Later';

  const patterns = ['h:mm a', 'h a', 'HH:mm', 'h.mm a', 'h.mm'];
  for (const p of patterns) {
    try {
      const parsed = parse(clean, p, new Date());
      if (!isNaN(parsed)) return format(parsed, 'hh:mm a');
    } catch {}
  }
  return input;
}

function bookingSummary(b) {
  return `📌 *Booking ID:* ${b.bookingId}
🚖 *Pickup:* ${b.pickup}
📍 *Drop:* ${b.drop}
🕒 *Time:* ${b.time}
📊 *Status:* ${b.status}
💰 Fare: $${b.fare}`;
}

// ========== Twilio Setup ==========
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);
const twilioNumber = TWILIO_WHATSAPP_NUMBER;

// ========== Vercel Handler ==========
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const from = req.body.From;
  let command = req.body.Body?.trim();

  if (req.body.Interactive?.ButtonReply) command = req.body.Interactive.ButtonReply.Id;
  if (req.body.Interactive?.ListReply) command = req.body.Interactive.ListReply.Id;

  if (!command) return res.status(200).send('OK');

  try {
    // Ensure user exists
    let user = await User.findOne({ jid: from });
    if (!user) {
      user = await User.create({ jid: from, name: 'User' });
      await sendMainMenu(from);
      return res.status(200).send('OK');
    }

    // Load or create session
    let session = await Session.findOne({ jid: from });
    if (!session) session = await Session.create({ jid: from, step: 0, booking: {} });

    // === Main Menu Commands ===
    if (command === 'book_cab') {
      session.step = 1;
      await session.save();
      return sendWhatsApp(from, '🚖 Where should I pick you up from? 📍');
    }

    if (command === 'my_bookings') {
      const bookings = await Booking.find({ jid: from }).sort({ createdAt: -1 }).limit(5);
      if (!bookings.length) return sendWhatsApp(from, '📭 No bookings yet.');
      const summary = bookings.map(b => `🆔 ${b.bookingId} | ${b.pickup} → ${b.drop} | ${b.time} | ${b.status} | 💰 $${b.fare}`).join('\n');
      return sendWhatsApp(from, `📑 Your recent bookings:\n\n${summary}`);
    }

    if (command === 'help') return sendMainMenu(from);

    // === Booking Flow ===
    if (session.step === 1) {
      session.booking.pickup = command;
      session.step = 2;
      await session.save();
      return sendWhatsApp(from, '📍 Where is your drop location? 🏁');
    }

    if (session.step === 2) {
      session.booking.drop = command;
      session.step = 3;
      await session.save();
      return sendTimeOptions(from);
    }

    if (session.step === 3) {
      session.booking.time = normalizeTime(command);
      session.booking.jid = from;
      session.booking.bookingId = generateBookingId();
      session.booking.fare = 20; // fixed fare

      const newBooking = await Booking.create(session.booking);
      await sendWhatsApp(from, `✅ *Booking Confirmed!*\n\n${bookingSummary(newBooking)}`);

      session.step = 0;
      session.booking = {};
      await session.save();

      return sendMainMenu(from);
    }

  } catch (err) {
    console.error('Error:', err);
  }

  res.status(200).send('OK');
}

// ========== Twilio Helpers ==========
async function sendWhatsApp(to, message) {
  await twilioClient.messages.create({ from: twilioNumber, to, body: message });
}

async function sendMainMenu(to) {
  await twilioClient.messages.create({
    from: twilioNumber,
    to,
    interactive: {
      type: 'button',
      body: { text: '👋 Welcome to *Cab Assistant*! Please choose an option:' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'book_cab', title: '🚖 Book Cab' } },
          { type: 'reply', reply: { id: 'my_bookings', title: '📑 My Bookings' } },
          { type: 'reply', reply: { id: 'help', title: 'ℹ Help' } },
        ],
      },
    },
  });
}

async function sendTimeOptions(to) {
  await twilioClient.messages.create({
    from: twilioNumber,
    to,
    interactive: {
      type: 'button',
      body: { text: '🕒 When would you like your cab?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'now', title: 'Now' } },
          { type: 'reply', reply: { id: 'later', title: 'Later' } },
        ],
      },
    },
  });
}
