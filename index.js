const { Telegraf } = require("telegraf");
const CronJob = require("cron").CronJob;
const storage = require("node-persist");

const bot = new Telegraf("1647776734:AAEWWXkR9oVcsvPFc9D5yAPv9O6kiyuB5YM");
const regex = /^(\d{1,2}:\d\d)\s+(.*)$/;

const HELP_TEXT = `Пришлите расписание в таком формате:

10:30 Завтрак
14:30 Обед
19:00 Ужин`;

bot.start(Telegraf.reply(HELP_TEXT));
bot.help(Telegraf.reply(HELP_TEXT));

const tg = { current: null };

bot.on("message", (ctx) => {
  if (!tg.current) {
    ctx.reply("Бот запущен");
    ctx.telegram.setMyCommands([
      {
        command: "help",
        description: "Помощь",
      },
    ]);
  }
  tg.current = ctx.telegram;
  if (ctx.message.text) {
    const { text } = ctx.message;
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const schedule = lines
      .filter((line) => regex.test(line))
      .map((line) => {
        const [, time, task] = regex.exec(line);
        return { time, task };
      })
      .reduce((acc, item) => {
        acc[item.time.toString().padStart(5, "0")] = item.task;
        return acc;
      }, {});

    storage.setItem(`${ctx.chat.id}`, {
      chatId: ctx.chat.id,
      schedule,
    });

    if (Object.keys(schedule).length === 0) {
      ctx.reply(HELP_TEXT);
    } else {
      ctx.reply(
        `*Расписание сохранено*

${Object.entries(schedule)
  .map(([key, value]) => `*${key}* => ${value}`)
  .join("\n")}`,
        {
          parse_mode: "Markdown",
        }
      );
    }
  }
});

const job = new CronJob(
  "0 * * * * *",
  async function () {
    if (!tg.current) {
      return;
    }
    const d = new Date();
    const time = `${d
      .getHours()
      .toString()
      .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    console.log(time);
    const values = await storage.values();
    for (const { chatId, schedule } of values) {
      if (schedule[time]) {
        console.log(`${chatId} => ${schedule[time]}`);
        tg.current.sendMessage(
          chatId,
          `На *${time}* у вас запланировано *${schedule[time]}*`,
          { parse_mode: "Markdown" }
        );
      }
    }
  },
  null,
  true,
  "Europe/Moscow"
);
(async () => {
  await storage.init();
  await bot.launch();
  job.start();
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
