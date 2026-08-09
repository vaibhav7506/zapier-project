const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const triggers = [
    {
      id: "webhook",
      name: "Webhook",
      image: "https://static-00.iconduck.com/assets.00/webhook-icon-512x488-76v98s9z.png",
    },
    {
      id: "solana",
      name: "Solana",
      image: "https://cryptologos.cc/logos/solana-sol-logo.png",
    },
  ];
  const actions = [
    {
      id: "email",
      name: "Email",
      image: "https://cdn-icons-png.flaticon.com/512/561/561127.png",
    },
    {
      id: "send-sol",
      name: "Send SOL",
      image: "https://cryptologos.cc/logos/solana-sol-logo.png",
    },
    {
      id: "discord",
      name: "Discord",
      image: "https://cdn.simpleicons.org/discord/5865F2",
    },
    {
      id: "slack",
      name: "Slack",
      image: "https://cdn-icons-png.flaticon.com/512/2111/2111615.png",
    },
    {
      id: "telegram",
      name: "Telegram",
      image: "https://cdn.simpleicons.org/telegram/26A5E4",
    },
    {
      id: "sms",
      name: "SMS",
      image: "https://cdn-icons-png.flaticon.com/512/724/724664.png",
    },
    {
      id: "google-sheets",
      name: "Google Sheets",
      image: "https://cdn.simpleicons.org/googlesheets/34A853",
    },
  ];

  await Promise.all(
    triggers.map((trigger) =>
      prisma.availableTrigger.upsert({ where: { id: trigger.id }, update: trigger, create: trigger }),
    ),
  );
  await Promise.all(
    actions.map((action) =>
      prisma.availableAction.upsert({ where: { id: action.id }, update: action, create: action }),
    ),
  );

  console.log("Seeding successful: Added Triggers and Actions.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
