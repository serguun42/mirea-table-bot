const
	path = require("path"),
	fs = require("fs"),
	util = require("util"),
	fsWriteFile = util.promisify(fs.writeFile),
	fsReadDir = util.promisify(fs.readdir),
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	SECOND = 1e3,
	MINUTE = SECOND * 60,
	HOUR = MINUTE * 60,
	xlsx = require("node-xlsx").default,
	NodeFetch = require("node-fetch"),
	cron = require("node-cron"),
	Telegraf = require("telegraf");




/**
 * @typedef {Object} CatsConfig
 * @property {Boolean} ENABLED
 * @property {String} FOLDER
 */
/**
 * @typedef {Object} ConfigFile
 * @property {String} TELEGRAM_BOT_TOKEN
 * @property {{id: number, username: string}} ADMIN_TELEGRAM_DATA
 * @property {Number} START_OF_WEEKS
 * @property {String[]} LESSON_TIMES
 * @property {String[]} DAYS_OF_WEEK
 * @property {{"morning": String, "evening": String, "late_evening": String}} LABELS_FOR_TIMES_OF_DAY
 * @property {String} SCHEDULE_LINK
 * @property {String} UNIT
 * @property {Number} INDEX_OF_LINE_WITH_GROUPS_NAMES
 * @property {String} GROUP
 * @property {CatsConfig} CATS
 * @property {Boolean} SESSION
 */
/** @type {ConfigFile} */
const {
	TELEGRAM_BOT_TOKEN,
	ADMIN_TELEGRAM_DATA,
	START_OF_WEEKS,
	LESSON_TIMES,
	DAYS_OF_WEEK,
	LABELS_FOR_TIMES_OF_DAY,
	SCHEDULE_LINK,
	UNIT,
	INDEX_OF_LINE_WITH_GROUPS_NAMES,
	GROUP,
	CATS,
	SESSION
} = require("./mirea_table_bot.config.json");

/**
 * @typedef {Object} User
 * @property {Number} id
 * @property {String} username
 * @property {String} group
 * @property {Boolean} waitingForTextForSettings
 * @property {Boolean} cats
 * @property {String} last_cat_photo
 * @property {Boolean} morning
 * @property {Boolean} evening
 * @property {Boolean} late_evening
 */
/** @type {User[]} */
const USERS = require("./mirea_table_bot.users.json");

/** @type {{[typo: string]: string}} */
const FIXES = require("./mirea_table_bot.fixes.json");





/**
 * @param {import("telegraf").Context} ctx
 * @returns {Promise<User>}
 */
const GettingUserWrapper = (ctx) => new Promise((resolve) => {
	const { chat, from } = ctx;

	const foundUser = USERS.find((user) => user.id === from.id);

	if (!foundUser) {
		PushIntoSendingImmediateQueue({
			text: "Произошла ошибка. Пожалуйста, выполните команду /start",
			destination: chat.id,
		});

		return reject();
	} else {
		resolve(foundUser);
	};
});

/**
 * @callback ButtonCommandCaller
 * @param {import("telegraf").Context} ctx
 * @returns {void}
 */
/**
 * @type {{[commandName: string]: { description: String, caller: ButtonCommandCaller } | { description: String, text: String }}}
 */
const COMMANDS = {
	"today": {
		description: "Сегодня",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			const today = DAYS_OF_WEEK[GetDay() - 1];


			if (!today) {
				PushIntoSendingImmediateQueue({
					text: "Сегодня неучебный день!",
					destination: ctx.chat.id
				});
			} else {
				const todayLayout = BuildDay(GetDay() - 1, GetWeek());

				if (todayLayout) {
					PushIntoSendingImmediateQueue({
						text: `Сегодня ${today}. Расписание:\n\n${todayLayout}`,
						destination: ctx.chat.id
					});
				} else {
					PushIntoSendingImmediateQueue({
						text: `Сегодня ${today}. Пар нет!`,
						destination: ctx.chat.id
					});
				};
			};
		}
	},
	"tomorrow": {
		description: "Завтра",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			const tomorrow = DAYS_OF_WEEK[GetDay()];


			if (!tomorrow) {
				PushIntoSendingImmediateQueue({
					text: "Завтра неучебный день!",
					destination: ctx.chat.id
				});
			} else {
				const tomorrowLayout = BuildDay(GetDay(), GetWeek() + (GetDay() === 0));

				if (tomorrowLayout) {
					PushIntoSendingImmediateQueue({
						text: `Завтра ${tomorrow}. Расписание:\n\n${tomorrowLayout}`,
						destination: ctx.chat.id
					});
				} else {
					PushIntoSendingImmediateQueue({
						text: `Завтра ${tomorrow}. Пар нет!`,
						destination: ctx.chat.id
					});
				};
			};
		}
	},
	"weekthis": {
		description: "Текущая неделя",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			PushIntoSendingImmediateQueue({
				text: `Расписание на текущую неделю (№${GetWeek()}):\n\n${BuildWeek(GetWeek())}`,
				destination: ctx.chat.id
			});
		}
	},
	"weeknext": {
		description: "Следующая неделя",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			PushIntoSendingImmediateQueue({
				text: `Расписание на следующую неделю (№${GetWeek() + 1}):\n\n${BuildWeek(GetWeek() + 1)}`,
				destination: ctx.chat.id
			});
		}
	},
	"week3": {
		description: "Текущая неделя + 2",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			PushIntoSendingImmediateQueue({
				text: `Расписание на неделю №${GetWeek() + 2}:\n\n${BuildWeek(GetWeek() + 2)}`,
				destination: ctx.chat.id
			});
		}
	},
	"week4": {
		description: "Текущая неделя + 3",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			PushIntoSendingImmediateQueue({
				text: `Расписание на неделю №${GetWeek() + 3}:\n\n${BuildWeek(GetWeek() + 3)}`,
				destination: ctx.chat.id
			});
		}
	},
	"settings": {
		description: "⚙ Настройки",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			const { chat, from } = ctx;

			const foundUser = USERS.find((user) => user.id === from.id);

			if (!foundUser) return PushIntoSendingImmediateQueue({
				text: "Произошла ошибка. Пожалуйста, выполните команду /start",
				destination: chat.id,
			});

			foundUser.waitingForTextForSettings = true;


			PushIntoSendingImmediateQueue({
				text: `Вы можете настроить:

🔹 Присылать ли расписание на текущий день один раз утром в 7:00.
🔸🔸 <b>(только в те дни, когда есть пары)</b>

🔹 Присылать ли расписание на следующий день в 19:00.
🔸🔸 <b>(только на те дни, когда есть пары)</b>

🔹 Присылать ли расписание на следующий день в 22:00.
🔸🔸 <b>(только на те дни, когда есть пары)</b>

🔹 Присылать ли котиков 🐱 по утрам в дни вместе с расписанием, когда есть семинары или лабы.`,
				destination: chat.id,
				buttons: Telegraf.Markup.keyboard(
					SETTINGS_COMMANDS.map((settingCommand) =>
						[({text: settingCommand.text(foundUser)})]
					)
				).reply_markup
			});
		}
	},
	"map": {
		description: "🗺 Карта",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			PushIntoSendingImmediateQueue({
				text: "Карта на botpage.ru/map",
				destination: ctx.chat.id,
				buttons: Telegraf.Markup.inlineKeyboard([
					{
						text: "🗺 Карта",
						url: "http://botpage.ru/map/"
					}
				]).reply_markup
			});
		}
	},
	"help": {
		description: "❓ Помощь",
		text: `Я бот, который умеет делать многое с расписанием. Но <b>пока</b> только для группы <b>${GROUP}</b>.

Мои доступные команды – в списке команд! (Кнопка «/» или «🎲» рядом с полем ввода)

Также я буду присылать тебе
🔹 расписание на текущий день один раз утром
🔸🔸 <b>(только в те дни, когда есть пары)</b>

🔹 расписание на следующий день два раза вечером
🔸🔸 <b>(только на те дни, когда есть пары)</b>

🔹 А ещё я могу отправлять котиков 🐱 по утрам в дни, когда есть семинары или лабы.

В общем, смотри настройки (/settings) и помощь (/help), если надо 🧐`
	},
	"table": {
		description: "📋 Файл расписания",
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => {
			GetLinkToFile()
				.then((link) => PushIntoSendingImmediateQueue({
					text: `<a href="${encodeURI(link)}">${TGE(link)}</a>`,
					destination: ctx.chat.id,
					buttons: Telegraf.Markup.inlineKeyboard([
						{
							text: "XLSX файл с расписанием",
							url: encodeURI(link)
						}
					]).reply_markup
				}));


			if (ctx.chat.id === ADMIN_TELEGRAM_DATA.id) {
				TelegramSendToAdmin("Updating Schedule because you are the admin!");
				TimeoutFunction();
			};
		}
	}
};

/**
 * @callback SettingsCommandButtonTextSetter
 * @param {User} foundUser
 * @returns {String}
 */
/**
 * @type {{text: SettingsCommandButtonTextSetter, regexp: RegExp, caller: ButtonCommandCaller}[]}
 */
const SETTINGS_COMMANDS = [
	{
		/** @type {SettingsCommandButtonTextSetter} */
		text: (foundUser) => `👈 Назад`,
		regexp: /👈 Назад/i,
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => GettingUserWrapper(ctx).then((foundUser) => {
			foundUser.waitingForTextForSettings = false;

			PushIntoSendingImmediateQueue({
				text: "Настройки закрыты (и, естественно, применены ✅)",
				destination: ctx.chat.id,
			});
		}).catch(LogMessageOrError)
	},
	{
		/** @type {SettingsCommandButtonTextSetter} */
		text: (foundUser) => `🕖 Рассылка утром – ${foundUser.morning ? "включена" : "выключена"}`,
		regexp: /🕖 Рассылка утром – в(ы)?ключена/i,
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => GettingUserWrapper(ctx).then((foundUser) => {
			foundUser.morning = !foundUser.morning;

			PushIntoSendingImmediateQueue({
				text: `🕖 Рассылка утром – ${foundUser.morning ? "включена" : "выключена"}`,
				destination: ctx.chat.id,
				buttons: Telegraf.Markup.keyboard(
					SETTINGS_COMMANDS.map((settingCommand) =>
						[({text: settingCommand.text(foundUser)})]
					)
				).reply_markup
			});
		}).catch(LogMessageOrError)
	},
	{
		/** @type {SettingsCommandButtonTextSetter} */
		text: (foundUser) => `🕖 Рассылка вечером – ${foundUser.evening ? "включена" : "выключена"}`,
		regexp: /🕖 Рассылка вечером – в(ы)?ключена/i,
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => GettingUserWrapper(ctx).then((foundUser) => {
			foundUser.evening = !foundUser.evening;

			PushIntoSendingImmediateQueue({
				text: `🕖 Рассылка вечером – ${foundUser.evening ? "включена" : "выключена"}`,
				destination: ctx.chat.id,
				buttons: Telegraf.Markup.keyboard(
					SETTINGS_COMMANDS.map((settingCommand) =>
						[({text: settingCommand.text(foundUser)})]
					)
				).reply_markup
			});
		}).catch(LogMessageOrError)
	},
	{
		/** @type {SettingsCommandButtonTextSetter} */
		text: (foundUser) => `🕙 Рассылка поздним вечером – ${foundUser.late_evening ? "включена" : "выключена"}`,
		regexp: /🕙 Рассылка поздним вечером – в(ы)?ключена/i,
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => GettingUserWrapper(ctx).then((foundUser) => {
			foundUser.late_evening = !foundUser.late_evening;

			PushIntoSendingImmediateQueue({
				text: `🕖 Рассылка поздним вечером – ${foundUser.late_evening ? "включена" : "выключена"}`,
				destination: ctx.chat.id,
				buttons: Telegraf.Markup.keyboard(
					SETTINGS_COMMANDS.map((settingCommand) =>
						[({text: settingCommand.text(foundUser)})]
					)
				).reply_markup
			});
		}).catch(LogMessageOrError)
	},
	{
		/** @type {SettingsCommandButtonTextSetter} */
		text: (foundUser) => `🐱 Котики – ${foundUser.cats ? "включены" : "выключены"}`,
		regexp: /🐱 Котики – в(ы)?ключены/i,
		/** @type {ButtonCommandCaller} */
		caller: (ctx) => GettingUserWrapper(ctx).then((foundUser) => {
			foundUser.cats = !foundUser.cats;

			PushIntoSendingImmediateQueue({
				text: `🐱 Котики – ${foundUser.cats ? "включены" : "выключены"}`,
				destination: ctx.chat.id,
				buttons: Telegraf.Markup.keyboard(
					SETTINGS_COMMANDS.map((settingCommand) =>
						[({text: settingCommand.text(foundUser)})]
					)
				).reply_markup
			});
		}).catch(LogMessageOrError)
	}
];

const COMMANDS_ALIASES = {};
Object.keys(COMMANDS).forEach((key) => {
	const alias = COMMANDS[key].description.replace(/[^\w\dа-я]+/gi, "");
	COMMANDS_ALIASES[alias] = COMMANDS[key];
});


/** @type {import("telegraf").Telegraf} */
const BOT = new Telegraf.Telegraf(TELEGRAM_BOT_TOKEN);
const telegram = BOT.telegram;




/**
 * @typedef {Object} SendingMessageType
 * @property {Number} destination
 * @property {String} text
 * @property {{text: string, callback_data: string, url: string}[][]} [buttons]
 * @property {String} [photo]
 */
/** @type {SendingMessageType[]} */
const IMMEDIATE_QUEUE = [];

/**
 * @param {SendingMessageType} messageData
 * @returns {Number}
 */
const PushIntoSendingImmediateQueue = (messageData) => IMMEDIATE_QUEUE.push(messageData);

/** @type {SendingMessageType[]} */
const MAILING_QUEUE = [];

/**
 * @param {SendingMessageType} messageData
 * @returns {Number}
 */
const PushIntoSendingMailingQueue = (messageData) => MAILING_QUEUE.push(messageData);

/**
 * @param {SendingMessageType} messageData
 * @returns {void}
 */
const TelegramSend = (messageData) => {
	const replyKeyboard = Telegraf.Markup.keyboard(
		Chunkify(Object.keys(COMMANDS).map((key) => ({ text: COMMANDS[key].description })), 2)
	).resize(true).reply_markup;


	(
		messageData.photo
		?
			telegram.sendPhoto(messageData.destination, {
				source: messageData.photo
			}, {
				caption: messageData.text,
				parse_mode: "HTML",
				disable_web_page_preview: true,
				reply_markup: messageData.buttons || replyKeyboard
			})
		:
			telegram.sendMessage(messageData.destination, messageData.text, {
				parse_mode: "HTML",
				disable_web_page_preview: true,
				reply_markup: messageData.buttons || replyKeyboard
			})
	).catch((e) => {
		if (e.code === 403) {
			const foundUser = USERS.find((user) => user.id === messageData.destination);

			if (foundUser) {
				const indexOfFoundUser = USERS.findIndex((user) => user.id === messageData.destination);

				if (indexOfFoundUser) {
					USERS.splice(indexOfFoundUser, 1);

					LogMessageOrError(`Successfully deleted user with id = ${messageData.destination}. They'd had index ${indexOfFoundUser} in users list but gone now.`, JSON.stringify(foundUser, false, "\t"));
				} else {
					LogMessageOrError(`Could not deleting user with id ${messageData.destination} because of critical bug with finding proper user. Go see PushIntoSendingImmediateQueue() function.`);
				};
			} else {
				LogMessageOrError(`Cannot remove user with id ${messageData.destination} because they're not in out users' list!`, e);
			};
		} else {
			LogMessageOrError(`Unknown error code`, e);
		};
	});
};

setInterval(() => {
	const messageData = IMMEDIATE_QUEUE.shift();

	if (messageData && messageData.destination)
		TelegramSend(messageData);
}, 50);

setInterval(() => {
	const messageData = MAILING_QUEUE.shift();

	if (messageData && messageData.destination)
		TelegramSend(messageData);
}, 2000);

/**
 * @param {String | String[] | Error | Error[]} message
 * @returns {void}
 */
const TelegramSendToAdmin = (message) => {
	if (!message) return;


	if (message instanceof Array)
		LogMessageOrError(...message);
	else if (message instanceof Error)
		LogMessageOrError(message);


	telegram.sendMessage(ADMIN_TELEGRAM_DATA.id, message instanceof Array ? message.join("\n") : message, {
		parse_mode: "HTML",
		disable_web_page_preview: true
	});
};

/**
 * @param {String} iStringToEscape
 * @returns {String}
 */
const TGE = iStringToEscape => {
	if (!iStringToEscape) return "";
	
	if (typeof iStringToEscape === "string")
		return iStringToEscape
			.replace(/\&/g, "&amp;")
			.replace(/\</g, "&lt;")
			.replace(/\>/g, "&gt;");
	else
		return TGE(iStringToEscape.toString());
};

/**
 * @param  {Error[] | String[]} args
 * @returns {void}
 */
const LogMessageOrError = (...args) => {
	const containsAnyError = (args.findIndex((message) => message instanceof Error) > -1),
		  out = (containsAnyError ? console.error : console.log);

	out(new Date());
	args.forEach((message) => out(message));
	out("~~~~~~~~~~~\n\n");
};






// Move To Utils. One day…
/**
 * @param {String} iString
 * @returns {String}
 */
const Capitalize = iString => {
	if (!iString || typeof iString != "string") return iString;

	return iString[0].toUpperCase() + iString.slice(1).toLowerCase();
};

/**
 * @param {Array} iArray
 * @param {Number} iChunkSize
 * @returns {Array.<Array>}
 */
const Chunkify = (iArray, iChunkSize) => {
	if (!iArray || !iChunkSize) return iArray;

	const outArray = [];

	iArray.forEach((elem, index) => {
		let pasteIndex = Math.floor(index / iChunkSize);
		if (!outArray[pasteIndex]) outArray.push([]);
		outArray[pasteIndex].push(elem);
	});

	return outArray;
};

/**
 * @param {String} lastCatPhoto
 * @returns {Promise<String>}
 */
const GetCatImage = (lastCatPhoto) => fsReadDir(CATS.FOLDER).then((catImages) => {
	const LocalGetRandom = () => {
		const randomPicked = catImages[Math.floor(Math.random() * catImages.length)];

		if (randomPicked === lastCatPhoto)
			return LocalGetRandom();
		else
			return randomPicked;
	};

	return Promise.resolve(LocalGetRandom());
});






BOT.start(/** @param {import("telegraf").Context} ctx */ (ctx) => {
	const indexOfUser = USERS.findIndex((user) => user.id === ctx.chat.id);
	

	if (indexOfUser < 0) {
		USERS.push({
			id: ctx.chat.id,
			username: ctx.chat.username || ctx.chat.first_name,
			group: GROUP,
			cats: true,
			last_cat_photo: "",
			morning: true,
			evening: true,
			late_evening: true
		});
	};
	

	PushIntoSendingImmediateQueue({
		text: COMMANDS["help"].text,
		destination: ctx.chat.id
	});
});

BOT.on("text", /** @param {import("telegraf").Context} ctx */ (ctx) => {
	const { chat, from } = ctx;


	if (chat && chat["type"] === "private") {
		if (chat.id === ADMIN_TELEGRAM_DATA.id) {
			if (ctx.message && ctx.message.text === "/show_users") {
				return TelegramSendToAdmin(`<b>Пользователя из процесса:</b>\n${USERS.map((user) =>
					Object.keys(user).map((key) => `<i>${TGE(key)}</i> <code>${TGE(user[key])}</code>`).join(", ")
				).join("\n\n")}`);
			};
		};
	};


	if (chat && chat["type"] === "private") {
		const { message } = ctx;
		if (!message) return false;

		const { text } = message;
		if (!text) return false;


		ctx.deleteMessage(message.id).catch(LogMessageOrError);

		const commandAlias = Capitalize(text.replace(/[^\w\dа-я]+/gi, "").trim());

		if (COMMANDS_ALIASES[commandAlias]) {
			if (typeof COMMANDS_ALIASES[commandAlias].caller == "function")
				return COMMANDS_ALIASES[commandAlias].caller(ctx);
			else if (typeof COMMANDS_ALIASES[commandAlias].text == "string")
				return PushIntoSendingImmediateQueue({
					text: COMMANDS_ALIASES[commandAlias].text,
					destination: ctx.chat.id
				});
		};


		const commandMatch = text.match(/^\/([\w\d]+)(\@mirea_table_bot)?$/i);

		if (commandMatch && commandMatch[1]) {
			if (COMMANDS[commandMatch[1]]) {
				if (typeof COMMANDS[commandMatch[1]].caller == "function")
					return COMMANDS[commandMatch[1]].caller(ctx);
				else if (typeof COMMANDS[commandMatch[1]].text == "string")
					return PushIntoSendingImmediateQueue({
						text: COMMANDS[commandMatch[1]].text,
						destination: ctx.chat.id
					});
			};
		};


		const foundUser = USERS.find((user) => user.id === from.id);

		if (foundUser && foundUser.waitingForTextForSettings) {
			const settingsCommandHandler = SETTINGS_COMMANDS.find((handler) => handler.regexp.test(text));

			if (settingsCommandHandler)
				settingsCommandHandler.caller(ctx);
			else
				return PushIntoSendingImmediateQueue({
					text: "Не понял. Чего?!",
					destination: ctx.chat.id
				});
		} else
			return PushIntoSendingImmediateQueue({
				text: "Не понял. Чего?!",
				destination: ctx.chat.id
			});
	};
});

BOT.launch();



/**
 * @typedef {Object} Option
 * @property {number[]} [weeks]
 * @property {string} name
 * @property {string} type
 * @property {string} [tutor]
 * @property {string} [place]
 * @property {string} [link]
 * 
 * 
 * @typedef {Option[]} Lesson
 * 
 * 
 * @typedef {Object} DayOfWeek
 * @property {string} day
 * @property {Lesson[]} odd
 * @property {Lesson[]} even
 * 
 * 
 * @typedef {DayOfWeek[]} Schedule
 */
/** @type {Schedule} */
let SCHEDULE = [];




/**
 * @returns {Number}
 */
const GetWeek = () => Math.ceil((Date.now() - START_OF_WEEKS) / (7 * 24 * HOUR));

/**
 * @returns {Number}
 */
const GetDay = () => new Date(Date.now() + (!DEV) * 3 * HOUR).getDay();

/**
 * @param {Option} iOption
 * @param {Number} iLessonPosition
 * @param {Boolean} [iSkipTime = false]
 * @returns {String}
 */
const BuildOptionLayout = (iOption, iLessonPosition, iSkipTime = false) => {
	return (
		(
			iSkipTime ? "" : `<u>Пара №${iLessonPosition + 1} (${LESSON_TIMES[iLessonPosition]})</u>\n`
		)
		+ `<b>${TGE(iOption.name)}</b>`
		+ (iOption.type ? ` (${TGE(iOption.type)})` : "")
		+ (iOption.tutor ? `\n<i>${TGE(iOption.tutor)}</i>` : "")
		+ (iOption.place ? `${iOption.tutor ? ", " : "\n"}<i>${TGE(iOption.place === "Д" ? "Дистанционно" : iOption.place)}</i>` : "")
		+ (iOption.link ? `\n<a href="${encodeURI(iOption.link)}">Ссылка на пару</a>` : "")
	);
};

/**
 * @param {Option[]} iOptions
 * @param {Number} iLessonPosition
 * @param {Number} iWeek
 * @returns {String}
 */
const BuildOption = (iOptions, iLessonPosition, iWeek) => iOptions.filter((option) => {
	if (!option) return false;
	if (!option.weeks) return true;

	if (option.weeks instanceof Array)
		return option.weeks.includes(iWeek);

	return false;
}).map((option, optionIndex) => BuildOptionLayout(option, iLessonPosition, optionIndex > 0)).join("\n").trim();

/**
 * @param {Number} iNumberOfDayInWeek
 * @param {Number} iWeek
 * @returns {String}
 */
const BuildDay = (iNumberOfDayInWeek, iWeek) => {
	const day = SCHEDULE[iNumberOfDayInWeek];
	if (!day) return "";

	const lessons = day[iWeek % 2 ? "odd" : "even"];
	if (!lessons) return "";

	return lessons
			.map((lesson, lessonPosition) => BuildOption(lesson, lessonPosition, iWeek))
			.map((option) => option && option.trim ? option.trim() : option)
			.filter((option) => !!option)
			.join("\n\n")
			.trim();
};

/**
 * @param {Number} iWeek
 * @returns {String}
 */
const BuildWeek = (iWeek) => {
	return SCHEDULE
		.map((day, dayIndex) => {
			const dayLayout = BuildDay(dayIndex, iWeek);

			if (dayLayout)
				return `<b>${Capitalize(day.day)}</b>:\n\n${dayLayout}`;
			else
				return "";
		})
		.filter(day => !!day)
		.join("\n\n~~~~~~\n\n");
};

/**
 * @callback GettingDayLayout
 * @returns {{nameOfDay: string, layout: string}|null}
 */
/**
 * @type {GettingDayLayout}
 */
const GetToday = () => {
	const today = DAYS_OF_WEEK[GetDay() - 1];
	if (!today) return null;

	const todayLayout = BuildDay(GetDay() - 1, GetWeek());
	if (todayLayout) return { nameOfDay: today, layout: todayLayout};

	return null;
};

/**
 * @type {GettingDayLayout}
 */
const GetTomorrow = () => {
	const tomorrow = DAYS_OF_WEEK[GetDay()];
	if (!tomorrow) return null;

	const tomorrowLayout = BuildDay(GetDay(), GetWeek() + (GetDay() === 0));
	if (tomorrowLayout) return { nameOfDay: tomorrow, layout: tomorrowLayout };

	return null;
};



/**
 * @param {String} iRawComplexLesson
 * @returns {String[] | null}
 */
const ParseLessonPartsAndOptions = iRawComplexLesson => {
	if (!iRawComplexLesson) return null;
	if (typeof iRawComplexLesson !== "string") return null;

	Object.keys(FIXES).forEach((regexpRaw) => {
		iRawComplexLesson = iRawComplexLesson.replace(new RegExp(regexpRaw, "g"), FIXES[regexpRaw]);
	});
	
	return iRawComplexLesson.replace(/\r/g, "").split("\n").filter(i => !!i);
};

/**
 * @returns {Promise.<String, Error>}
 */
const GetLinkToFile = () => new Promise((resolve, reject) => {
	NodeFetch(SCHEDULE_LINK).then((res) => {
		if (res.status === 200)
			return res.text();
		else
			return Promise.reject(res.status);
	}).then(/** @param {String} page */ (page) => {
		const blocksWithUnits = page.split("uk-card slider_ads uk-card-body uk-card-small").slice(1, -1);

		let found = false;

		blocksWithUnits.forEach((blockWithUnit) => {
			const search = blockWithUnit.search(UNIT);
			if (search < 0) return;
			if (found) return;
			found = true;

			const blockWithUnitSplitted = blockWithUnit.split("Расписание занятий");

			if (!blockWithUnitSplitted[1]) return Promise.reject("No link to xlsx file!");

			const linkMatch = blockWithUnitSplitted[1].match(/<a class="uk-link-toggle" href="([^"]+)" target="_blank">/);
			if (!linkMatch || !linkMatch[1]) return Promise.reject("No link to xlsx file!");


			resolve(linkMatch[1]);
		});
	}).catch((e) => reject(e));
});

/**
 * @param {String} iLinkToXLSXFile
 * @returns {Promise.<Schedule, Error>}
 */
const GetTablesFile = (iLinkToXLSXFile) => new Promise((resolve, reject) => {
	if (!iLinkToXLSXFile || typeof iLinkToXLSXFile !== "string")
		return reject(`Error on getting link to xlsx file: Wrong link to tables file: ${iLinkToXLSXFile}`);

	NodeFetch(encodeURI(iLinkToXLSXFile)).then((res) => {
		if (res.status === 200)
			return res.buffer();
		else
			return Promise.reject(res.status);
	}).then(/** @param {Buffer} file */ (file) => {
		const workSheetsFromFile = xlsx.parse(file);
		const tableSheet = workSheetsFromFile[0];

		const tableData = tableSheet.data;
		if (!tableData) return reject(`No data in the sheet`);

		const lineWithGroups = tableData[INDEX_OF_LINE_WITH_GROUPS_NAMES];
		if (!(lineWithGroups instanceof Array)) return reject(`No groups in the sheet`);

		const indexOfMyGroup = lineWithGroups
								.map(
									cell => cell ? (cell.trim ? cell.trim().toLowerCase() : "") : ""
								)
								.indexOf(GROUP.toLowerCase());

		const myGroupTable = tableData
								.slice(INDEX_OF_LINE_WITH_GROUPS_NAMES + 2, INDEX_OF_LINE_WITH_GROUPS_NAMES + 2 + 72)
								.map(row => row.slice(indexOfMyGroup, indexOfMyGroup + 5));


		/** @type {Schedule} */
		const schedule = [];

		myGroupTable.forEach((lessonOption, lessonOptionIndex) => {
			const dayOfWeek = Math.floor(lessonOptionIndex / 12);
			
			if (!schedule[dayOfWeek]) schedule[dayOfWeek] = {
				day: DAYS_OF_WEEK[dayOfWeek],
				odd: [],
				even: []
			};


			const splittedLesson = {
				name: ParseLessonPartsAndOptions(lessonOption[0]),
				type: ParseLessonPartsAndOptions(lessonOption[1]),
				tutor: ParseLessonPartsAndOptions(lessonOption[2]),
				place: ParseLessonPartsAndOptions(lessonOption[3]),
				link: ParseLessonPartsAndOptions(lessonOption[4])
			};

			const formedLesson = [];

			if (splittedLesson.name && splittedLesson.name instanceof Array)
				splittedLesson.name.forEach((optionName, optionIndex) => {
					let weeks = optionName.match(/^([\d\,]+)\sн.\s/);
					if (weeks && weeks[1])
						weeks = weeks[1];
					else
						weeks = null;

					if (!weeks) {
						weeks = optionName.match(/^((\d+)\-(\d+))\sн.\s/);

						if (weeks && weeks[1] && weeks[2] && weeks[3]) {
							let weeksArr = [],
								startingWeek = parseInt(weeks[2]),
								endingWeek = parseInt(weeks[3]);

							for (let i = startingWeek; i <= endingWeek; i += 2)
								weeksArr.push(i);

							weeks = weeksArr.join(",");
						} else
							weeks = null;
					};

					formedLesson.push({
						weeks: weeks ? weeks.split(",").map(week => +week) : null,
						name: weeks ? optionName.replace(/^([\d\,]+)\sн.\s/, "").replace(/^((\d+)\-(\d+))\sн.\s/, "").trim() : optionName.trim(),
						type: splittedLesson.type ? splittedLesson.type[optionIndex] || null : null,
						tutor: splittedLesson.tutor ? splittedLesson.tutor[optionIndex] || null : null,
						place: splittedLesson.place ? splittedLesson.place[optionIndex] || null : null,
						link: splittedLesson.link ? splittedLesson.link[optionIndex] ? splittedLesson.link[optionIndex] : (splittedLesson.link[optionIndex - 1] || null) : null
					});
				});

			if (lessonOptionIndex % 2)
				schedule[dayOfWeek].even.push(formedLesson);
			else
				schedule[dayOfWeek].odd.push(formedLesson);
		});


		SCHEDULE = schedule;
		if (DEV) fsWriteFile("./out/schedule.json", JSON.stringify(SCHEDULE, false, "\t")).catch(LogMessageOrError);


		resolve(SCHEDULE);
	}).catch((e) => reject(e));
});

/**
 * @returns {Promise.<String, Error>}
 */
const GetLinksToSessionFiles = () => new Promise((resolve, reject) => {
	// Redo when session comes closer
	SCHEDULE = [];
});



const ScheduledProcedure = () => {
	if (SESSION)
		return GetLinksToSessionFiles();
	else
		return GetLinkToFile()
			.then((linkToXLSXFile) => GetTablesFile(linkToXLSXFile));
};

const TimeoutFunction = () => ScheduledProcedure().catch((e) => TelegramSendToAdmin([`Error on getting file.xlsx`, e]));


TimeoutFunction();

setInterval(() => TimeoutFunction(), HOUR * 3);

setInterval(() => {
	fsWriteFile(
		"./mirea_table_bot.users.json",
		JSON.stringify(USERS, (key, value) => key === "waitingForTextForSettings" ? undefined : value, "\t")
	)
	.catch((e) => TelegramSendToAdmin(["Cannot write user into local .json file!", e]));
}, DEV ? MINUTE : 15 * MINUTE);



/**
 * @param {"morning" | "evening" | "late_evening"} timeOfDay 
 * @param {GettingDayLayout} layoutFunc
 */
const GlobalSendToAllUsers = (timeOfDay, layoutFunc) => {
	USERS.forEach((user) => {
		if (!user[timeOfDay]) return;

		const day = layoutFunc(user.group);

		if (!day) return;


		const LocalSendDefault = () => {
			PushIntoSendingMailingQueue({
				text: `${LABELS_FOR_TIMES_OF_DAY[timeOfDay]} ${day.nameOfDay}. Расписание:\n\n${day.layout}`,
				destination: user.id
			});
		};


		if (timeOfDay === "morning" && user.cats && CATS.ENABLED) {
			const practices = day.layout.match(/\((пр)\)/i)?.[1],	
				  labs = day.layout.match(/\((лаб)\)/i)?.[1];

			if (practices || labs) {
				GetCatImage(user.last_cat_photo)
				.then((catImageToSend) => {
					user.last_cat_photo = catImageToSend;

					PushIntoSendingMailingQueue({
						text: `${LABELS_FOR_TIMES_OF_DAY[timeOfDay]} ${day.nameOfDay} и сегодня есть ${labs ? "лабы" : "семинары"}! Расписание:\n\n${day.layout}`,
						destination: user.id,
						photo: path.join(CATS.FOLDER, catImageToSend)
					});
				}).catch(() => LocalSendDefault());
			} else
				LocalSendDefault();
		} else
			LocalSendDefault();
	});
};

if (!DEV) {
	cron.schedule("0 4 * * *", () => GlobalSendToAllUsers("morning", GetToday));
	cron.schedule("0 16 * * *", () => GlobalSendToAllUsers("evening", GetTomorrow));
	cron.schedule("0 19 * * *", () => GlobalSendToAllUsers("late_evening", GetTomorrow));
};

if (DEV) {
	process.on("unhandledRejection", (reason, p) => {
		LogMessageOrError("Unhandled Rejection at: Promise", p, "reason:", reason);
	});
};
