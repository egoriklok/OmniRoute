import {
  type BusinessAgentQuestionId,
  type BusinessAgentRequest,
  businessAgentQuestions,
} from "./schema";

type AnswerMap = Partial<Record<BusinessAgentQuestionId, string>>;

function answer(answers: AnswerMap, id: BusinessAgentQuestionId, fallback = "not provided") {
  const value = answers[id]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function firstNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function moneyLabel(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function scoreCompleteness(answers: AnswerMap) {
  const required = businessAgentQuestions.filter((question) => question.required);
  const requiredAnswered = required.filter((question) => answer(answers, question.id, "")).length;
  const totalAnswered = businessAgentQuestions.filter((question) =>
    answer(answers, question.id, "")
  ).length;

  return {
    requiredAnswered,
    requiredTotal: required.length,
    totalAnswered,
    totalQuestions: businessAgentQuestions.length,
  };
}

function marketSizingBlock(answers: AnswerMap) {
  const customers = firstNumber(answers.marketSize);
  const price = firstNumber(answers.price);

  if (customers && price) {
    const annualRevenuePerCustomer = price < 1000 ? price * 12 : price;
    const tam = customers * annualRevenuePerCustomer;
    const sam = tam * 0.25;
    const som3 = sam * 0.03;
    const som5 = sam * 0.06;

    return [
      `- Bottom-up TAM draft: ${customers.toLocaleString()} reachable customers x ${moneyLabel(
        annualRevenuePerCustomer
      )} annual revenue per customer = ${moneyLabel(tam)}.`,
      `- SAM draft: ${moneyLabel(sam)} if 25% of the market is serviceable with the first product.`,
      `- SOM draft: ${moneyLabel(som3)} by year 3 at 3% of SAM; ${moneyLabel(
        som5
      )} by year 5 at 6% of SAM.`,
      "- Validate this with public datasets, industry reports, competitor revenue, and founder interviews before using it for fundraising.",
    ].join("\n");
  }

  return [
    "- TAM: estimate total customers in the first geography x annual revenue per customer.",
    "- SAM: narrow TAM by geography, product readiness, budget fit, and ability to reach the buyer.",
    "- SOM: use a conservative 3-year share of 2-3% of SAM and a 5-year share of 4-6% until traction proves otherwise.",
    "- Missing data: add a numerical customer-count assumption and price assumption to unlock automatic bottom-up math.",
  ].join("\n");
}

function buildRisks(answers: AnswerMap) {
  const risks = [
    `- Problem risk: the pain may not be urgent enough. Test with 10 direct conversations with ${answer(
      answers,
      "targetCustomer"
    )}.`,
    `- Distribution risk: "${answer(
      answers,
      "goToMarket"
    )}" may not create enough qualified conversations. Track replies, booked calls, and close rate weekly.`,
    `- Differentiation risk: "${answer(
      answers,
      "differentiation"
    )}" needs proof. Create a side-by-side demo against the current alternative.`,
  ];

  const constraints = answer(answers, "constraints", "");
  if (constraints) {
    risks.push(
      `- Execution constraint: ${constraints}. Convert this into a weekly limit and remove one bottleneck at a time.`
    );
  }

  return risks.join("\n");
}

function cell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function tableRow(cells: string[]) {
  return `| ${cells.map(cell).join(" |")} |`;
}

function briefBlock(answers: AnswerMap, language: "ru" | "en") {
  if (language === "ru") {
    return [
      tableRow(["Поле", "Ответ"]),
      tableRow(["---", "---"]),
      tableRow(["Название", answer(answers, "projectName")]),
      tableRow(["Сфера деятельности", answer(answers, "sector")]),
      tableRow(["География", answer(answers, "geography")]),
      tableRow(["Формат", answer(answers, "format")]),
      tableRow(["Тип проекта", answer(answers, "projectType")]),
      tableRow(["Размер", answer(answers, "companySize")]),
      tableRow(["Продукт", answer(answers, "product", answer(answers, "solution"))]),
      tableRow(["Ценовой сегмент", answer(answers, "priceSegment", answer(answers, "price"))]),
      tableRow(["Какие задачи решаете", answer(answers, "problem")]),
      tableRow(["Целевая аудитория", answer(answers, "targetCustomer")]),
    ].join("\n");
  }

  return [
    tableRow(["Field", "Answer"]),
    tableRow(["---", "---"]),
    tableRow(["Name", answer(answers, "projectName")]),
    tableRow(["Activity sector", answer(answers, "sector")]),
    tableRow(["Geography", answer(answers, "geography")]),
    tableRow(["Format", answer(answers, "format")]),
    tableRow(["Project type", answer(answers, "projectType")]),
    tableRow(["Current size", answer(answers, "companySize")]),
    tableRow(["Product", answer(answers, "product", answer(answers, "solution"))]),
    tableRow(["Price segment", answer(answers, "priceSegment", answer(answers, "price"))]),
    tableRow(["Solved tasks", answer(answers, "problem")]),
    tableRow(["Target audience", answer(answers, "targetCustomer")]),
  ].join("\n");
}

function missionBlock(answers: AnswerMap, language: "ru" | "en") {
  const mission = answer(answers, "mission", "");
  if (mission) return mission;
  if (language === "ru") {
    return `Помочь сегменту "${answer(answers, "targetCustomer")}" решить проблему "${answer(
      answers,
      "problem"
    )}" через продукт "${answer(answers, "solution")}".`;
  }
  return `Help ${answer(answers, "targetCustomer")} solve "${answer(
    answers,
    "problem"
  )}" through "${answer(answers, "solution")}".`;
}

function cjmBlock(answers: AnswerMap, language: "ru" | "en") {
  if (language === "ru") {
    return [
      tableRow(["Этап CJM", "Состояние клиента", "Что спрашивает бот", "Артефакт", "Метрика"]),
      tableRow(["---", "---", "---", "---", "---"]),
      tableRow([
        "Осознание",
        "Клиент чувствует боль, но решение еще не выбрано.",
        "Что случилось и почему это важно сейчас?",
        "Формулировка проблемы",
        "Четкий срочный триггер",
      ]),
      tableRow([
        "Сравнение",
        "Клиент смотрит альтернативы.",
        `Что используете сейчас: ${answer(answers, "currentAlternatives")}?`,
        "Карта альтернатив",
        "Названы реальные заменители",
      ]),
      tableRow([
        "Решение",
        "Клиент оценивает доверие, цену и риск.",
        "Какой результат нужен, чтобы попробовать?",
        "Оффер и возражения",
        "Готовность к пилоту или оплате",
      ]),
      tableRow([
        "Активация",
        "Клиент получает первый полезный результат.",
        "Какой файл или план должен быть полезен сегодня?",
        "Заполненный strategy file",
        "Первое действие выполнено",
      ]),
      tableRow([
        "Повтор",
        "Клиент возвращается за следующим шагом.",
        "Что изменилось после первого спринта?",
        "Обновление roadmap",
        "Повторное использование или рекомендация",
      ]),
    ].join("\n");
  }

  return [
    tableRow(["CJM stage", "Customer state", "Bot question focus", "Artifact", "Success signal"]),
    tableRow(["---", "---", "---", "---", "---"]),
    tableRow([
      "Awareness",
      "Customer notices the pain.",
      "What happened and why now?",
      "Problem narrative",
      "Urgent trigger",
    ]),
    tableRow([
      "Comparison",
      "Customer compares alternatives.",
      `What do you use today: ${answer(answers, "currentAlternatives")}?`,
      "Alternatives map",
      "Named substitutes",
    ]),
    tableRow([
      "Decision",
      "Customer judges trust, price, and risk.",
      "What outcome would make this worth trying?",
      "Offer and objections",
      "Pilot or payment intent",
    ]),
    tableRow([
      "Activation",
      "Customer receives first value.",
      "What file or plan must be useful today?",
      "Filled strategy file",
      "First action completed",
    ]),
    tableRow([
      "Repeat",
      "Customer returns for the next step.",
      "What changed after the first sprint?",
      "Roadmap update",
      "Repeat use or referral",
    ]),
  ].join("\n");
}

function roadmapBlock(answers: AnswerMap, language: "ru" | "en") {
  if (language === "ru") {
    return [
      tableRow(["Период", "Цель", "Действия", "Доказательство"]),
      tableRow(["---", "---", "---", "---"]),
      tableRow([
        "0-7 дней",
        "Сузить ICP и боль.",
        `Провести 5-10 интервью с "${answer(answers, "targetCustomer")}".`,
        "3 повторяющихся паттерна боли.",
      ]),
      tableRow([
        "8-30 дней",
        "Собрать минимально полезный продукт.",
        answer(answers, "roadmapContext", answer(answers, "solution")),
        "Рабочий демо-сценарий или ручная услуга.",
      ]),
      tableRow([
        "31-60 дней",
        "Проверить дистрибуцию.",
        answer(answers, "goToMarket"),
        "Квалифицированные разговоры каждую неделю.",
      ]),
      tableRow([
        "61-90 дней",
        "Проверить оплату и удержание.",
        answer(answers, "goal90Days"),
        "Оплаченные пилоты или честные причины отказа.",
      ]),
    ].join("\n");
  }

  return [
    tableRow(["Timeframe", "Goal", "Actions", "Evidence gate"]),
    tableRow(["---", "---", "---", "---"]),
    tableRow([
      "Days 0-7",
      "Tighten ICP and problem.",
      `Interview 5-10 ${answer(answers, "targetCustomer")}.`,
      "3 repeated pain patterns.",
    ]),
    tableRow([
      "Days 8-30",
      "Build the smallest useful product.",
      answer(answers, "roadmapContext", answer(answers, "solution")),
      "Working demo or delivered manual service.",
    ]),
    tableRow([
      "Days 31-60",
      "Prove distribution.",
      answer(answers, "goToMarket"),
      "Qualified conversations every week.",
    ]),
    tableRow([
      "Days 61-90",
      "Validate payment and retention.",
      answer(answers, "goal90Days"),
      "Paid pilots or honest rejection reasons.",
    ]),
  ].join("\n");
}

function contentPlanBlock(answers: AnswerMap, language: "ru" | "en") {
  const rawChannels = answer(answers, "contentChannels", answer(answers, "goToMarket", ""));
  const channels = rawChannels
    .split(/[,;\n]/)
    .map((channel) => channel.trim())
    .filter(Boolean)
    .slice(0, 5);
  const selectedChannels = channels.length
    ? channels
    : ["Telegram", "LinkedIn", "Founder communities"];

  if (language === "ru") {
    return [
      tableRow(["Канал", "Тема", "Ритм", "CTA"]),
      tableRow(["---", "---", "---", "---"]),
      ...selectedChannels.map((channel) =>
        tableRow([
          channel,
          `Показывать цену проблемы "${answer(answers, "problem")}" и результат продукта "${answer(
            answers,
            "solution"
          )}".`,
          "2-3 публикации или демо в неделю",
          "Приглашение на бесплатную диагностику или пилот.",
        ])
      ),
    ].join("\n");
  }

  return [
    tableRow(["Channel", "Topic", "Cadence", "CTA"]),
    tableRow(["---", "---", "---", "---"]),
    ...selectedChannels.map((channel) =>
      tableRow([
        channel,
        `Show the cost of "${answer(answers, "problem")}" and the result of "${answer(
          answers,
          "solution"
        )}".`,
        "2-3 posts or demos per week",
        "Invite to a free diagnostic interview or pilot.",
      ])
    ),
  ].join("\n");
}

export function buildLocalBusinessConsultation(input: BusinessAgentRequest): string {
  const answers = input.answers;
  const completeness = scoreCompleteness(answers);

  if (input.language === "en") {
    return [
      "# Free Business Agent Consultation",
      "",
      "## Executive Summary",
      `${answer(answers, "idea")} The first strategic question is whether ${answer(
        answers,
        "targetCustomer"
      )} feel the problem often enough and painfully enough to pay now.`,
      "",
      "## Market Opportunity",
      marketSizingBlock(answers),
      "",
      "## Filled Project Vault Brief",
      briefBlock(answers, "en"),
      "",
      "## Mission and Product Description",
      missionBlock(answers, "en"),
      "",
      `Positioning: ${answer(answers, "idea")}`,
      `Primary offer: ${answer(answers, "solution")}`,
      `Not the offer: unproven market certainty, paid-model dependency, or generic advice without a next action.`,
      "",
      "## Target Audience and Positioning",
      [
        tableRow(["Dimension", "Value"]),
        tableRow(["---", "---"]),
        tableRow(["Primary ICP", answer(answers, "targetCustomer")]),
        tableRow(["Pain", answer(answers, "problem")]),
        tableRow(["Current alternative", answer(answers, "currentAlternatives")]),
        tableRow(["Buying context", answer(answers, "priceSegment", answer(answers, "price"))]),
        tableRow([
          "Proof needed",
          answer(answers, "traction", "Interviews, pilots, testimonials, or public demos."),
        ]),
      ].join("\n"),
      "",
      "## CJM",
      cjmBlock(answers, "en"),
      "",
      "## Roadmap",
      roadmapBlock(answers, "en"),
      "",
      "## Content Plan",
      contentPlanBlock(answers, "en"),
      "",
      "## Recommendation",
      `Start with a narrow wedge: ${answer(answers, "targetCustomer")}. Sell the smallest useful version of "${answer(
        answers,
        "solution"
      )}" before broadening the product.`,
      "",
      "## 90-Day Action Plan",
      `1. Interview 15-25 target customers about the problem and current alternatives: ${answer(
        answers,
        "currentAlternatives"
      )}.`,
      "2. Build one landing page with a clear promise, proof, price, and booking link.",
      `3. Run founder-led outreach through: ${answer(answers, "goToMarket")}.`,
      "4. Close 3-5 paid pilots or collect strong rejection reasons before expanding scope.",
      "5. Measure weekly: interviews, qualified leads, pilots, paid conversion, retention signal.",
      "",
      "## Risks To Pressure-Test",
      buildRisks(answers),
      "",
      "## Data Quality",
      `Answered ${completeness.totalAnswered}/${completeness.totalQuestions} fields; required answers ${completeness.requiredAnswered}/${completeness.requiredTotal}.`,
      "",
      "_Generated locally with the free fallback engine. Connect Kiro for an AI second opinion while staying on free resources._",
    ].join("\n");
  }

  return [
    "# Бесплатная консультация Business Agent",
    "",
    "## Краткий вывод",
    `${answer(answers, "idea", "Идея не описана.")} Главный стратегический вопрос: действительно ли сегмент "${answer(
      answers,
      "targetCustomer"
    )}" испытывает проблему часто, болезненно и готов платить сейчас.`,
    "",
    "## Возможность рынка",
    marketSizingBlock(answers)
      .replace("Bottom-up TAM draft", "Черновой расчет общего рынка снизу вверх")
      .replace("SAM draft", "Черновой расчет доступного рынка")
      .replace("SOM draft", "Черновой расчет достижимой доли рынка")
      .replace(
        "Validate this with public datasets, industry reports, competitor revenue, and founder interviews before using it for fundraising.",
        "Проверьте это через открытые данные, отраслевые отчеты, выручку конкурентов и интервью с клиентами перед использованием в презентации для инвесторов."
      )
      .replace("TAM:", "Общий рынок:")
      .replace("SAM:", "Доступный рынок:")
      .replace("SOM:", "Достижимая доля рынка:")
      .replace(
        "Missing data: add a numerical customer-count assumption and price assumption to unlock automatic bottom-up math.",
        "Не хватает данных: добавьте числовую оценку количества клиентов и цены, чтобы получить автоматический расчет снизу вверх."
      ),
    "",
    "## Заполненный Project Vault бриф",
    briefBlock(answers, "ru"),
    "",
    "## Миссия и описание продукта",
    missionBlock(answers, "ru"),
    "",
    `Позиционирование: ${answer(answers, "idea", "Идея не описана.")}`,
    `Основной оффер: ${answer(answers, "solution")}`,
    "Не является оффером: недоказанная уверенность в рынке, зависимость от платных моделей или общие советы без следующего действия.",
    "",
    "## Целевая аудитория и позиционирование",
    [
      tableRow(["Измерение", "Значение"]),
      tableRow(["---", "---"]),
      tableRow(["Первичный ICP", answer(answers, "targetCustomer")]),
      tableRow(["Боль", answer(answers, "problem")]),
      tableRow(["Текущая альтернатива", answer(answers, "currentAlternatives")]),
      tableRow(["Контекст покупки", answer(answers, "priceSegment", answer(answers, "price"))]),
      tableRow([
        "Нужное доказательство",
        answer(answers, "traction", "Интервью, пилоты, отзывы или публичные демо."),
      ]),
    ].join("\n"),
    "",
    "## CJM",
    cjmBlock(answers, "ru"),
    "",
    "## Roadmap",
    roadmapBlock(answers, "ru"),
    "",
    "## Контент-план",
    contentPlanBlock(answers, "ru"),
    "",
    "## Рекомендация",
    `Начинайте с узкого клина: ${answer(
      answers,
      "targetCustomer"
    )}. Продайте минимально полезную версию "${answer(
      answers,
      "solution"
    )}" до расширения продукта.`,
    "",
    "## План на 90 дней",
    `1. Провести 15-25 интервью с целевыми клиентами о проблеме и текущих альтернативах: ${answer(
      answers,
      "currentAlternatives"
    )}.`,
    "2. Собрать одну страницу предложения: обещание результата, доказательства, цена, кнопка записи.",
    `3. Запустить продажи руками основателя через канал: ${answer(answers, "goToMarket")}.`,
    "4. Получить 3-5 оплаченных пилотов или честные причины отказа до расширения функциональности.",
    "5. Еженедельно мерить: интервью, квалифицированные лиды, пилоты, оплату, повторное использование.",
    "",
    "## Риски для проверки",
    buildRisks(answers)
      .replace("Problem risk", "Риск проблемы")
      .replace("Distribution risk", "Риск дистрибуции")
      .replace("Differentiation risk", "Риск отличия")
      .replace("Execution constraint", "Ограничение исполнения")
      .replace("needs proof", "нужно доказать")
      .replace(
        "Create a side-by-side demo against the current alternative",
        "Сделайте сравнение с текущей альтернативой"
      )
      .replace(
        "Track replies, booked calls, and close rate weekly",
        "Еженедельно отслеживайте ответы, созвоны и конверсию в оплату"
      )
      .replace("Test with 10 direct conversations with", "Проверьте через 10 прямых разговоров с"),
    "",
    "## Качество входных данных",
    `Заполнено ${completeness.totalAnswered}/${completeness.totalQuestions} полей; обязательные ответы ${completeness.requiredAnswered}/${completeness.requiredTotal}.`,
    "",
    "_Сформировано локальным бесплатным механизмом. Подключите Kiro для второго AI-мнения без платных провайдеров._",
  ].join("\n");
}
