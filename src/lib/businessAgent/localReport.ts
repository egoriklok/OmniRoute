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
