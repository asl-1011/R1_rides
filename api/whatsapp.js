import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH_TOKEN } = process.env;
const WHATSAPP_NUMBER = 'whatsapp:+14155238886';
const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

const userSessions = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const from = req.body.From;
  const input = req.body.Body?.trim().toLowerCase() || req.body.Buttons?.Payload?.toLowerCase();

  if (!userSessions[from]) userSessions[from] = { step: 'start' };

  let messagePayload = {};

  switch (userSessions[from].step) {
    case 'start':
      // Main menu buttons
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        interactive: {
          type: 'button',
          body: { text: 'Welcome! What would you like to do?' },
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
      if (input === 'book_cab') {
        messagePayload = {
          from: WHATSAPP_NUMBER,
          to: from,
          body: 'Great! Where should we pick you up from?'
        };
        userSessions[from].step = 'pickup';
      } else if (input === 'check_status') {
        messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Feature not implemented yet.' };
      } else {
        messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Please select a valid option from the menu.' };
      }
      break;

    case 'pickup':
      if (!input) {
        messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Please enter a valid pickup location.' };
        break;
      }
      userSessions[from].pickup = input;
      messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Enter your drop-off location:' };
      userSessions[from].step = 'dropoff';
      break;

    case 'dropoff':
      if (!input) {
        messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Please enter a valid drop-off location.' };
        break;
      }
      userSessions[from].dropoff = input;
      // Time selection buttons
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
      if (!input || (input !== 'now' && input !== 'later')) {
        messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Please select: Now or Later.' };
        break;
      }
      userSessions[from].time = input;

      // Booking confirmation message
      messagePayload = {
        from: WHATSAPP_NUMBER,
        to: from,
        body: `✅ Booking confirmed!
Pickup: ${userSessions[from].pickup}
Drop-off: ${userSessions[from].dropoff}
Time: ${userSessions[from].time}`
      };
      delete userSessions[from];
      break;

    default:
      messagePayload = { from: WHATSAPP_NUMBER, to: from, body: 'Something went wrong. Please start again.' };
      delete userSessions[from];
      break;
  }

  // Ensure at least body or interactive exists
  if (!messagePayload.body && !messagePayload.interactive) {
    messagePayload.body = 'Sorry, something went wrong. Please try again.';
  }

  try {
    await client.messages.create(messagePayload);
    console.log('Message sent successfully!');
  } catch (err) {
    console.error('Error sending message:', err);
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}
