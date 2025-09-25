import Twilio from "twilio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ message: "Missing 'to' or 'message'" });
  }

  const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  try {
    const whatsappMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to}`, // must start with whatsapp:
    });

    res.status(200).json({ success: true, sid: whatsappMessage.sid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
