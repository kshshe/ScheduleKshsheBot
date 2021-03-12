const { Telegraf, Markup } = require("telegraf");
const CronJob = require("cron").CronJob;
const storage = require("node-persist");

const bot = new Telegraf("1647776734:AAEWWXkR9oVcsvPFc9D5yAPv9O6kiyuB5YM");
const regex = /^(\d\d:\d\d):?\s+(.*)$/;

const HELP_TEXT = `Пришлите расписание в таком формате:

08:30 Пробуждение
10:30 Завтрак
14:30 Обед
19:00 Ужин`;

const CHECKED = "✅";
const UNCHECKED = "☑️";

const capitalizeFirstLetter = (string) =>
  `${string[0].toUpperCase()}${string.slice(1)}`;

const formatScheduleText = (schedule) =>
  Object.entries(schedule)
    .map(([key, value]) => `*${key}*: ${value}`)
    .join("\n");

bot.use((ctx, next) => {
  if (!tg.current) {
    ctx.reply("Бот запущен");
    ctx.telegram.setMyCommands([
      {
        command: "me",
        description: "Посмотреть сохраненное расписание",
      },
      {
        command: "help",
        description: "Помощь",
      },
    ]);
  }
  tg.current = ctx.telegram;
  next();
});

bot.start(Telegraf.reply(HELP_TEXT));
bot.help(Telegraf.reply(HELP_TEXT));
bot.command("me", async (ctx) => {
  const data = await storage.getItem(`${ctx.chat.id}`);
  if (data && data.schedule) {
    ctx.reply(formatScheduleText(data.schedule), {
      parse_mode: "Markdown",
    });
  } else {
    ctx.reply(HELP_TEXT);
  }
});

const tg = { current: null };

bot.on("callback_query", (ctx) => {
  ctx.answerCbQuery();
  const type = ctx.callbackQuery.data;
  if (type === "all") {
    ctx.deleteMessage();
  } else {
    const keyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    keyboard[0] = keyboard[0].map((item) => {
      if (item.callback_data !== type) {
        return item;
      }
      const from = item.text.includes(CHECKED) ? CHECKED : UNCHECKED;
      const to = from === CHECKED ? UNCHECKED : CHECKED;
      return {
        ...item,
        text: item.text.split(from).join(to),
      };
    });
    if (keyboard[0].every((item) => item.text.includes(CHECKED))) {
      return ctx.deleteMessage();
    }
    ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
  }
});

bot.on("message", (ctx) => {
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
    }

    ctx.reply(
      `*Расписание сохранено*

${formatScheduleText(schedule)}`,
      {
        parse_mode: "Markdown",
      }
    );
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
        const task = schedule[time];
        const taskParts = task
          .split(/,|\sи\s/)
          .map((part) => part.trim())
          .filter(Boolean)
          .map(capitalizeFirstLetter);
        console.log(`${chatId} => ${task}`);
        tg.current.sendMessage(
          chatId,
          `На *${time}* у вас запланировано *${task}*`,
          {
            ...Markup.inlineKeyboard([
              taskParts.map((part) =>
                Markup.button.callback(
                  `${UNCHECKED} ${part}`,
                  part,
                  taskParts.length <= 1
                )
              ),
              [Markup.button.callback(`Все сделано`, "all")],
            ]),
            parse_mode: "Markdown",
          }
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
