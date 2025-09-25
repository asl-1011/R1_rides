import Twilio from "twilio";

export const config = {
  api: {
    bodyParser: false, // Twilio sends x-www-form-urlencoded
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  let body = "";
  req.on("data", chunk => (body += chunk.toString()));
  req.on("end", () => {
    const params = new URLSearchParams(body);
    const from = params.get("From"); // sender's number
    const incomingMsg = params.get("Body");

    // Use environment variables
    const client = new Twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

    client.messages
      .create({
        from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`, // sandbox or your WhatsApp number
        to: from,
        body: "Hello my sweet",
      })
      .then(message => console.log("Replied:", message.sid))
      .catch(err => console.error(err));

    res.status(200).send("<Response></Response>");
  });
}
