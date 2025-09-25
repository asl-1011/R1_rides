import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;
const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { From: from, Body: body } = req.body;

  console.log(`Received message from ${from}: ${body}`);

  try {
    await client.messages.create({
      from: `${TWILIO_WHATSAPP_NUMBER}`,
      to: from,
      body: `You said: "${body}" ✅`,
    });
    console.log('Reply sent successfully!');
  } catch (err) {
    console.error('Error sending reply:', err);
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}
