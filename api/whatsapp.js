import mongoose from 'mongoose';
import twilio from 'twilio';
import { parse, format } from 'date-fns';

const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, MONGO_URI } = process.env;

// ================= MongoDB Connection Cache =================
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectToDatabase() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI).then((mongoose) => {
      console.log('✅ Connected to MongoDB');
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ================= MongoDB Schemas =================
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

// ================= Twilio Client =================
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);
const twilioNumber = TWILIO_WHATSAPP_NUMBER;

// ================= Helpers =================
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

// ================= Twilio Send Helpers =================
async function sendText(to, message) {
  const msg = await twilioClient.messages.create({
    from: twilioNumber,
    to: `whatsapp:${to.replace('whatsapp:', '')}`,
    body: message,
  });
  console.log('Sent text:', msg.sid);
}

async function sendInteractive(to, text, buttons) {
  const msg = await twilioClient.messages.create({
    from: twilioNumber,
    to: `whatsapp:${to.replace('whatsapp:', '')}`,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons },
    },
  });
  console.log('Sent interactive:', msg.sid);
}

async function sendMainMenu(to) {
  await sendInteractive(to, '👋 Welcome to *Cab Assistant*! Please choose an option:', [
    { type: 'reply', reply: { id: 'book_cab', title: '🚖 Book Cab' } },
    { type: 'reply', reply: { id: 'my_bookings', title: '📑 My Bookings' } },
    { type: 'reply', reply: { id: 'help', title: 'ℹ Help' } },
  ]);
}

async function sendTimeOptions(to) {
  await sendInteractive(to, '🕒 When would you like your cab?', [
    { type: 'reply', reply: { id: 'now', title: 'Now' } },
    { type: 'reply', reply: { id: 'later', title: 'Later' } },
  ]);
}

// ================= Vercel Handler =================
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  await connectToDatabase();

  const from = req.body.From.replace('whatsapp:', '');
  let command = req.body.Body?.trim();

  if (req.body.Interactive?.ButtonReply) command = req.body.Interactive.ButtonReply.Id;
  if (req.body.Interactive?.ListReply) command = req.body.Interactive.ListReply.Id;

  if (!command) return res.status(200).send('OK');

  try {
    let user = await User.findOne({ jid: from });
    if (!user) {
      user = await User.create({ jid: from, name: 'User' });
      await sendMainMenu(from);
      return res.status(200).send('OK');
    }

    let session = await Session.findOne({ jid: from });
    if (!session) session = await Session.create({ jid: from, step: 0, booking: {} });

    // ===== Commands =====
    if (command === 'book_cab') {
      session.step = 1;
      await session.save();
      return sendText(from, '🚖 Where should I pick you up from? 📍');
    }

    if (command === 'my_bookings') {
      const bookings = await Booking.find({ jid: from }).sort({ createdAt: -1 }).limit(5);
      if (!bookings.length) return sendText(from, '📭 No bookings yet.');
      const summary = bookings.map(b => `🆔 ${b.bookingId} | ${b.pickup} → ${b.drop} | ${b.time} | ${b.status} | 💰 $${b.fare}`).join('\n');
      return sendText(from, `📑 Your recent bookings:\n\n${summary}`);
    }

    if (command === 'help') return sendMainMenu(from);

    // ===== Booking Flow =====
    if (session.step === 1) {
      session.booking.pickup = command;
      session.step = 2;
      await session.save();
      return sendText(from, '📍 Where is your drop location? 🏁');
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
      session.booking.fare = 20;

      const newBooking = await Booking.create(session.booking);
      await sendText(from, `✅ *Booking Confirmed!*\n\n${bookingSummary(newBooking)}`);

      session.step = 0;
      session.booking = {};
      await session.save();

      return sendMainMenu(from);
    }

  } catch (err) {
    console.error('Error:', err);
  }

  return res.status(200).send('OK');
}
