export type FaqItem = { question: string; answer: string };

export function parseFaqs(prompt: string): FaqItem[] {
  const text = prompt.replace(/\r\n/g, "\n").trim();
  const chunks = text.split(/(?=^\s*vraag\s*:)/im).map((chunk) => chunk.trim()).filter(Boolean);
  const items: FaqItem[] = [];
  for (const chunk of chunks) {
    const question = chunk.match(/^\s*vraag\s*:\s*(.+)$/im)?.[1]?.trim();
    const answer = chunk.match(/^\s*antwoord\s*:\s*([\s\S]+)$/im)?.[1]?.trim();
    if (!question || !answer) continue;
    items.push({
      question: question.replace(/\s+/g, " ").trim(),
      answer: answer.replace(/^\s*kop\s*:.*$/gim, "").trim(),
    });
  }
  return items.filter((item) => item.question && item.answer);
}
