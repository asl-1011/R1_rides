import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH_TOKEN } = process.env;
const WHATSAPP_NUMBER = 'whatsapp:+14155238886'; // Twilio sandbox number
const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const from = req.body.From; // e.g., 'whatsapp:+918111873997'

  try {
    // Sending WhatsApp template with Quick Replies
    await client.messages.create({
      from: WHATSAPP_NUMBER,
      to: from,
      contentSid: 'HXd5e42a0b2f6f265b8e89b28e4dab7023', // your template SID
      contentVariables: JSON.stringify({
        1: 'Book a Ride',
        2: 'Track My Ride',
        3: 'Pricing & Offers',
        4: 'Contact Support'
      }),
    });

    console.log('Template sent successfully!');
  } catch (err) {
    console.error('Error sending template:', err);
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}
