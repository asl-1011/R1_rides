import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH_TOKEN } = process.env;
const WHATSAPP_NUMBER = 'whatsapp:+14155238886';
const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

const userSessions = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const from = req.body.From;
  const body = req.body.Body?.trim().toLowerCase();

  if (!userSessions[from]) userSessions[from] = { step: 'start' };

  let messagePayload = {};

  switch (userSessions[from].step) {
    case 'start':
      // Send interactive menu buttons
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        interactive: {
          type: 'button',
          body: {
            text: 'Welcome! What do you want to do?'
          },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'book_cab', title: 'Book a Cab' } },
              { type: 'reply', reply: { id: 'check_status', title: 'Check Booking Status' } }
            ]
          }
        }
      };
      userSessions[from].step = 'menu';
      break;

    case 'menu':
      if (req.body.ButtonText || body === 'book a cab' || req.body?.Payload === 'book_cab') {
        messagePayload = {
          from: WHATSAPP_NUMBER,
          to: from,
          body: 'Great! Please enter your pickup location:'
        };
        userSessions[from].step = 'pickup';
      } else {
        messagePayload = {
          from: WHATSAPP_NUMBER,
          to: from,
          body: 'Sorry, I did not understand. Please select from the menu.'
        };
      }
      break;

    case 'pickup':
      userSessions[from].pickup = body;
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        body: 'Enter your drop-off location:'
      };
      userSessions[from].step = 'dropoff';
      break;

    case 'dropoff':
      userSessions[from].dropoff = body;
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        interactive: {
          type: 'button',
          body: { text: 'When do you want the cab?' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'now', title: 'Now' } },
              { type: 'reply', reply: { id: 'later', title: 'Later' } }
            ]
          }
        }
      };
      userSessions[from].step = 'time';
      break;

    case 'time':
      userSessions[from].time = body || req.body.ButtonText?.toLowerCase();
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        body: `Booking confirmed! 🚖
Pickup: ${userSessions[from].pickup}
Drop-off: ${userSessions[from].dropoff}
Time: ${userSessions[from].time}`
      };
      delete userSessions[from];
      break;

    default:
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        body: 'Something went wrong. Please start again.'
      };
      delete userSessions[from];
      break;
  }

  try {
    await client.messages.create(messagePayload);
  } catch (err) {
    console.error('Error sending reply:', err);
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}
