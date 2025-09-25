import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH_TOKEN } = process.env;
const WHATSAPP_NUMBER = 'whatsapp:+14155238886'; // Twilio sandbox number
const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const from = req.body.From; // e.g., 'whatsapp:+918111873997'
  const body = req.body.Body;

  console.log(`Received message from ${from}: ${body}`);

  try {
    await client.messages.create({
      from: WHATSAPP_NUMBER, // sandbox number
      to: from,              // reply to sender
      body: `You said: "${body}" ✅`,
    });
    console.log('Reply sent successfully!');
  } catch (err) {
    console.error('Error sending reply:', err);
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}
