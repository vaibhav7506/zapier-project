import nodemailer from "nodemailer";

export async function sendEmail(to: string, body: string, messageId: string) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_ENDPOINT,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transport.sendMail({
    from: "vs7977722@gmail.com",
    sender: "vs7977722@gmail.com",
    to,
    subject: "Hello from Zapier",
    text: body,
    messageId,
  });
}
