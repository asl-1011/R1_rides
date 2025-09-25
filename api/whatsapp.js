import mongoose from 'mongoose';
import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, MONGO_URI } = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

// MongoDB setup
if (!mongoose.connection.readyState) {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');
}

// Schemas
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

// Helpers
function generateBookingId() {
  return 'CAB' + Math.floor(1000 + Math.random() * 9000);
}

async function sendMessage(to, body) {
  await client.messages.create({
    from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
    to,
    body, // default text messages only
  });
}

// Vercel handler
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const from = req.body.From;
  const body = req.body.Body?.trim();

  if (!body) return res.status(200).send('OK');

  try {
    // Ensure user exists
    let user = await User.findOne({ jid: from });
    if (!user) user = await User.create({ jid: from, name: 'User' });

    // Load/create session
    let session = await Session.findOne({ jid: from });
    if (!session) session = await Session.create({ jid: from, step: 0, booking: {} });

    // Booking flow using only text messages
    if (body.toLowerCase() === 'book cab' && session.step === 0) {
      session.step = 1;
      await session.save();
      return sendMessage(from, '🚖 Where should we pick you up from?');
    }

    if (session.step === 1) {
      session.booking.pickup = body;
      session.step = 2;
      await session.save();
      return sendMessage(from, '📍 Where is your drop location?');
    }

    if (session.step === 2) {
      session.booking.drop = body;
      session.step = 3;
      await session.save();
      return sendMessage(from, '🕒 When would you like your cab? Reply with "Now" or "Later".');
    }

    if (session.step === 3) {
      session.booking.time = body;
      session.booking.jid = from;
      session.booking.bookingId = generateBookingId();
      session.booking.fare = 20;

      const newBooking = await Booking.create(session.booking);
      await sendMessage(from,
        `✅ Booking Confirmed!\nBooking ID: ${newBooking.bookingId}\nPickup: ${newBooking.pickup}\nDrop: ${newBooking.drop}\nTime: ${newBooking.time}\nFare: $${newBooking.fare}`
      );

      // Reset session
      session.step = 0;
      session.booking = {};
      await session.save();

      return sendMessage(from, 'Type "Book Cab" to make another booking.');
    }

    // Default reply
    await sendMessage(from, 'Hi! Type "Book Cab" to start a booking.');

  } catch (err) {
    console.error('Error:', err);
  }

  res.status(200).send('OK');
}
