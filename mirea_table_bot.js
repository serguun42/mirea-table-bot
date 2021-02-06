const
	fs = require("fs"),
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	SECOND = 1e3,
	MINUTE = SECOND * 60,
	HOUR = MINUTE * 60,
	xlsx = require("node-xlsx").default,
	NodeFetch = require("node-fetch"),
	cron = require("node-cron"),
	Telegraf = require("telegraf");



/**
 * @typedef {Object} ConfigFile
 * @property {String} TELEGRAM_BOT_TOKEN
 * @property {{id: number, username: string}} ADMIN_TELEGRAM_DATA
 * @property {Number} START_OF_WEEKS
 * @property {String[]} LESSON_TIMES
 * @property {String[]} DAYS_OF_WEEK
 * @property {String[]} DAYS_OF_WEEK_ACCUSATIVE
 * @property {String} SCHEDULE_LINK
 * @property {String} SCHEDULE_PAGE_COOKIE
 * @property {String} UNIT
 * @property {Number} INDEX_OF_LINE_WITH_GROUPS_NAMES
 * @property {String} GROUP
 * @property {Boolean} SESSION
 */
/** @type {ConfigFile} */
const
	CONFIG = require("./mirea_table_bot.config.json"),
	{
		TELEGRAM_BOT_TOKEN,
		ADMIN_TELEGRAM_DATA,
		START_OF_WEEKS,
		LESSON_TIMES,
		DAYS_OF_WEEK,
		DAYS_OF_WEEK_ACCUSATIVE,
		SCHEDULE_LINK,
		SCHEDULE_PAGE_COOKIE,
		UNIT,
		INDEX_OF_LINE_WITH_GROUPS_NAMES,
		GROUP,
		SESSION
	} = CONFIG;

/** @type {{id: number, username: string}[]} */
const USERS = require("./mirea_table_bot.users.json");

/** @type {{[typo: string]: string}} */
const FIXES = require("./mirea_table_bot.fixes.json");



/** @type {{[commandName: string]: { description: string, caller?: function, text?: string }}} */
const COMMANDS = {
	"today": {
		description: "Сегодня",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			const today = DAYS_OF_WEEK[GetDay() - 1];


			if (!today) {
				TelegramSend({
					text: "Сегодня неучебный день!",
					destination: ctx.chat.id
				});
			} else {
				const todayLayout = BuildDay(GetDay() - 1, GetWeek());

				if (todayLayout) {
					TelegramSend({
						text: `Сегодня ${today}. Расписание:\n\n${todayLayout}`,
						destination: ctx.chat.id
					});
				} else {
					TelegramSend({
						text: `Сегодня ${today}. Пар нет!`,
						destination: ctx.chat.id
					});
				};
			};
		}
	},
	"tomorrow": {
		description: "Завтра",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			const tomorrow = DAYS_OF_WEEK[GetDay()];


			if (!tomorrow) {
				TelegramSend({
					text: "Завтра неучебный день!",
					destination: ctx.chat.id
				});
			} else {
				const tomorrowLayout = BuildDay(GetDay(), GetWeek() + (GetDay() === 0));

				if (tomorrowLayout) {
					TelegramSend({
						text: `Завтра ${tomorrow}. Расписание:\n\n${tomorrowLayout}`,
						destination: ctx.chat.id
					});
				} else {
					TelegramSend({
						text: `Завтра ${tomorrow}. Пар нет!`,
						destination: ctx.chat.id
					});
				};
			};
		}
	},
	"twodays": {
		description: "Сегодня и завтра",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			const
				today = DAYS_OF_WEEK[GetDay() - 1],
				tomorrow = DAYS_OF_WEEK[GetDay()];

			let replyText = "";

			if (!today) {
				replyText += "Сегодня неучебный день!";
			} else {
				const todayLayout = BuildDay(GetDay() - 1, GetWeek());

				if (todayLayout) {
					replyText += `Сегодня ${today}. Расписание:\n\n${todayLayout}`;
				} else {
					replyText += `Сегодня ${today}. Пар нет!`;
				};
			};


			replyText += "\n\n~~~~~~\n\n";


			if (!tomorrow) {
				replyText += "Завтра неучебный день!";
			} else {
				const tomorrowLayout = BuildDay(GetDay(), GetWeek() + (GetDay() === 0));

				if (tomorrowLayout) {
					replyText += `Завтра ${tomorrow}. Расписание:\n\n${tomorrowLayout}`;
				} else {
					replyText += `Завтра ${tomorrow}. Пар нет!`;
				};
			};


			TelegramSend({
				text: replyText,
				destination: ctx.chat.id
			});
		}
	},
	"weekthis": {
		description: "Текущая неделя",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			TelegramSend({
				text: `Расписание на текущую неделю (№${GetWeek()}):\n\n${BuildWeek(GetWeek())}`,
				destination: ctx.chat.id
			});
		}
	},
	"weeknext": {
		description: "Следующая неделя",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			TelegramSend({
				text: `Расписание на следующую неделю (№${GetWeek() + 1}):\n\n${BuildWeek(GetWeek() + 1)}`,
				destination: ctx.chat.id
			});
		}
	},
	"week3": {
		description: "Текущая неделя + 2",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			TelegramSend({
				text: `Расписание на неделю №${GetWeek() + 2}:\n\n${BuildWeek(GetWeek() + 2)}`,
				destination: ctx.chat.id
			});
		}
	},
	"week4": {
		description: "Текущая неделя + 3",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			TelegramSend({
				text: `Расписание на неделю №${GetWeek() + 3}:\n\n${BuildWeek(GetWeek() + 3)}`,
				destination: ctx.chat.id
			});
		}
	},
	"help": {
		description: "Помощь",
		text: `Я бот, который умеет делать многое с расписанием. Но только для группы ${GROUP}.

Мои доступные команды – в списке команд! (Кнопка рядом с полем ввода)

Также я буду присылать тебе
• расписание на сегодня один раз утром
• • <i>(только в те дни, когда есть пары)</i>
• расписание на завтра два раза вечером
• • <i>(только на те дни, когда есть пары)</i>`
	},
	"table": {
		description: "Файл расписания",
		caller: /** @param {TelegramContext} ctx */ (ctx) => {
			GetLinkToFile()
				.then((link) => TelegramSend({
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

const COMMANDS_ALIASES = {};
Object.keys(COMMANDS).forEach((key) => {
	const alias = COMMANDS[key].description;
	COMMANDS_ALIASES[alias] = COMMANDS[key];
});


/** @type {import("telegraf").Telegraf} */
const BOT = new Telegraf.Telegraf(TELEGRAM_BOT_TOKEN);
const telegram = BOT.telegram;



/**
 * @typedef {Object} TelegramFromObject
 * @property {Number} id
 * @property {String} first_name
 * @property {String} username
 * @property {Boolean} is_bot
 * @property {String} language_code
 * 
 * @typedef {Object} TelegramChatObject
 * @property {Number} id
 * @property {String} title
 * @property {String} type
 * 
 * @typedef {Object} TelegramPhotoObj
 * @property {String} file_id
 * @property {String} file_unique_id
 * @property {Number} file_size
 * @property {Number} width
 * @property {Number} height
 * 
 * @typedef {Object} TelegramMessageObject
 * @property {Number} message_id
 * @property {String} text
 * @property {TelegramFromObject} from
 * @property {TelegramChatObject} chat
 * @property {Number} date
 * @property {Array.<{offset: Number, length: Number, type: String}>} [entities]
 * @property {TelegramPhotoObj[]} [photo]
 * @property {TelegramMessageObject} [reply_to_message]
 * @property {{inline_keyboard: Array.<Array.<{text: string, callback_data: string, url: string}>>}} [reply_markup]
 * @property {String} [caption]
 * 
 * @typedef {Object} TelegramUpdateObject
 * @property {Number} update_id
 * @property {TelegramMessageObject} message
 * 
 * @typedef {Object} TelegramContext
 * @property {String} updateType 
 * @property {Object} [updateSubTypes] 
 * @property {TelegramMessageObject} [message] 
 * @property {Object} [editedMessage] 
 * @property {Object} [inlineQuery] 
 * @property {Object} [chosenInlineResult] 
 * @property {Object} [callbackQuery] 
 * @property {Object} [shippingQuery] 
 * @property {Object} [preCheckoutQuery] 
 * @property {Object} [channelPost] 
 * @property {Object} [editedChannelPost] 
 * @property {Object} [poll] 
 * @property {Object} [pollAnswer] 
 * @property {TelegramChatObject} [chat] 
 * @property {TelegramFromObject} [from] 
 * @property {Object} [match] 
 * @property {TelegramUpdateObject} [update] 
 * @property {Boolean} webhookReply
 */
/**
 * @param {{text: String, destination: number, buttons?: {text: string, callback_data: string, url: string}[][]}} messageData
 */
const TelegramSend = (messageData) => {
	const replyKeyboard = Telegraf.Markup.keyboard(
		Chunkify(Object.keys(COMMANDS).map((key) => ({ text: COMMANDS[key].description })), 2)
	).resize(true).reply_markup;


	telegram.sendMessage(messageData.destination, messageData.text, {
		parse_mode: "HTML",
		disable_web_page_preview: true,
		reply_markup: messageData.buttons || replyKeyboard
	}).catch((e) => {
		if (e.code === 403) {
			const foundUser = USERS.find((user) => user.id === messageData.destination);

			if (foundUser) {
				console.log(new Date());
				console.log(`Deleting user with id ${messageData.destination}`, JSON.stringify(foundUser, false, "\t"));

				const indexOfFoundUser = USERS.findIndex((user) => user.id === messageData.destination);

				if (indexOfFoundUser) {
					USERS.splice(indexOfFoundUser, 1);
					fs.writeFile("./mirea_table_bot.users.json", JSON.stringify(USERS, false, "\t"), (e) => {
						if (e) TelegramSendToAdmin(["Cannot write user into local .json file!", e]);
					});
					console.log(`User with id ${messageData.destination} successfly deleted. They'd had index ${indexOfFoundUser} in whole users' list but gone now.`, JSON.stringify(foundUser, false, "\t"))
				} else {
					console.log(`Could not deleting user with id ${messageData.destination} because of critical bug with finding proper user. Go see TelegramSend() function.`);
				};
			} else {
				console.error(new Data());
				console.error(`Cannot remove user with id ${messageData.destination} because they're not in out users' list`);
				console.error(e);
			};
		} else {
			console.error(e);
		};
	});
};

/**
 * @param {String[]|String} message
 */
const TelegramSendToAdmin = (message) => {
	if (!message) return;


	if (message instanceof Array) {
		console.error(new Date().toISOString());

		message.forEach((err) => console.error(err));
	};


	telegram.sendMessage(ADMIN_TELEGRAM_DATA.id, message instanceof Array ? message.join("\n") : message, {
		parse_mode: "HTML",
		disable_web_page_preview: true
	});
};

const TGE = iStr => {
	if (!iStr) return "";
	
	if (typeof iStr === "string")
		return iStr
			.replace(/\&/g, "&amp;")
			.replace(/\</g, "&lt;")
			.replace(/\>/g, "&gt;");
	else
		return TGE(iStr.toString());
};






// Move To Utils
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






BOT.start(/** @param {import("telegraf").Context} ctx */ (ctx) => {
	let indexOfUser = USERS.findIndex((user) => user.id === ctx.chat.id);
	

	if (indexOfUser < 0) {
		USERS.push({
			id: ctx.chat.id,
			username: ctx.chat.username || ctx.chat.first_name
		});

		fs.writeFile("./mirea_table_bot.users.json", JSON.stringify(USERS, false, "\t"), (e) => {
			if (e) TelegramSendToAdmin(["Cannot write user into local .json file!", e]);
		});
	};
	

	TelegramSend({
		text: COMMANDS["help"].text,
		destination: ctx.chat.id
	});
});

BOT.on("text", /** @param {TelegramContext} ctx */ (ctx) => {
	const { chat } = ctx;



	if (chat && chat["type"] === "private") {
		if (chat.id === ADMIN_TELEGRAM_DATA.id) {
			if (ctx.message && ctx.message.text === "/show_users") {
				return TelegramSendToAdmin(`<b>Пользователя из процесса:</b>\n<pre>${JSON.stringify(USERS, false, "\t")}</pre>`);
			};
		};
	};


	if (chat && chat["type"] === "private") {
		const { message } = ctx;
		if (!message) return false;

		const { text } = message;
		if (!text) return false;


		ctx.deleteMessage(message.id).catch(console.warn);


		if (COMMANDS_ALIASES[Capitalize(text.trim())]) {
			if (typeof COMMANDS_ALIASES[Capitalize(text.trim())].caller == "function")
				return COMMANDS_ALIASES[Capitalize(text.trim())].caller(ctx);
			else if (typeof COMMANDS_ALIASES[Capitalize(text.trim())].text == "string")
				return TelegramSend({
					text: COMMANDS_ALIASES[Capitalize(text.trim())].text,
					destination: ctx.chat.id
				});
		};


		const commandMatch = text.match(/^\/([\w\d]+)(\@mirea_table_bot)?$/i);

		if (commandMatch && commandMatch[1]) {
			if (COMMANDS[commandMatch[1]]) {
				if (typeof COMMANDS[commandMatch[1]].caller == "function")
					return COMMANDS[commandMatch[1]].caller(ctx);
				else if (typeof COMMANDS[commandMatch[1]].text == "string")
					return TelegramSend({
						text: COMMANDS[commandMatch[1]].text,
						destination: ctx.chat.id
					});
			};
		};

		return TelegramSend({
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
 * @returns {{nameOfDay: string, layout: string}|null}
 */
const GetToday = () => {
	const today = DAYS_OF_WEEK[GetDay() - 1];
	if (!today) return null;

	const todayLayout = BuildDay(GetDay() - 1, GetWeek());
	if (todayLayout) return { nameOfDay: today, layout: todayLayout};

	return null;
};

/**
 * @returns {{nameOfDay: string, layout: string}|null}
 */
const GetTomorrow = () => {
	const tomorrow = DAYS_OF_WEEK[GetDay()]
	if (!tomorrow) return null;

	const tomorrowLayout = BuildDay(GetDay(), GetWeek() + (GetDay() === 0));
	if (tomorrowLayout) return { nameOfDay: tomorrow, layout: tomorrowLayout };

	return null;
};



/**
 * @param {String} iRawComplexLesson
 * @returns {null|String[]}
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
		if (DEV) fs.writeFile("./out/schedule.json", JSON.stringify(SCHEDULE, false, "\t"), () => {});


		resolve(SCHEDULE);
	}).catch((e) => reject(e));
});

/**
 * @returns {Promise.<String, Error>}
 */
const GetLinksToSessionFiles = () => new Promise((resolve, reject) => {
	// ReDo
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

setInterval(() => TimeoutFunction(), SESSION ? HOUR * 3 : HOUR);



if (!DEV) {
	cron.schedule("0 4 * * *", () => {
		const today = GetToday();

		if (today) {
			USERS.forEach((user) => {
				TelegramSend({
					text: `Сегодня ${today.nameOfDay}. Расписание:\n\n${today.layout}`,
					destination: user.id
				});
			});
		};
	});

	cron.schedule("0 16,19 * * *", () => {
		const tomorrow = GetTomorrow();

		if (tomorrow) {
			USERS.forEach((user) => {
				TelegramSend({
					text: `Завтра ${tomorrow.nameOfDay}. Расписание:\n\n${tomorrow.layout}`,
					destination: user.id
				});
			});
		};
	});
};
