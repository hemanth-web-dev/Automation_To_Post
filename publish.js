// publish.js
// Generates 3 daily articles (AI + Tech News & AI Career Advice)
// and publishes them to dev.to using their REST API.

const DEVTO_API_KEY = process.env.DEVTO_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DEVTO_API_KEY) {
  console.error("Missing DEVTO_API_KEY");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

// Helper: simple sleep
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Create a short, unique stamp so titles differ daily
const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
const dd = String(now.getUTCDate()).padStart(2, "0");
const stamp = `${yyyy}-${mm}-${dd}`;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" +
  encodeURIComponent(GEMINI_API_KEY);


/**
 * Ask Gemini to write a markdown article.
 * We avoid making up fake “breaking news”. The prompt steers it to
 * write trend explainers, learning resources and career guidance that
 * age well, with references where possible (but not required).
 */
async function generateArticle({ role, focus, length = "1200-1500 words" }) {
  const prompt = `
Write an original markdown article in English on the niche:
"AI + Tech News and Career Advice using AI".

Article role/theme today: ${role}
Specific focus: ${focus}

Constraints:
- DO NOT invent breaking news or fake stats. Prefer durable trend explainers.
- If you reference public tools, explain real use-cases and how to try them (no affiliate links).
- Include an outline with H2/H3 headings.
- Add a concise intro, then 4–6 scannable sections, and a short actionable checklist.
- Add a "Try this today" boxed callout with 3 concrete steps.
- Add a brief FAQ (3 questions).
- Add a short conclusion.
- Use clean Markdown only (no HTML).
- Target length: ${length}.
- Add 5–8 relevant tags (as a markdown list) at the end.
- Title: put the title as the first markdown line starting with "# ".
- DO NOT include YAML frontmatter.

`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${t}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n")?.trim() ||
    "";

  // Extract title (first line starting with "# ")
  let title = `AI & Tech • ${role} • ${stamp}`;
  const firstLine = text.split("\n")[0] || "";
  const m = /^\s*#\s+(.+?)\s*$/.exec(firstLine);
  if (m) title = `${m[1]} (${stamp})`;

  // Tags for dev.to (we'll also keep tags in body for readers)
  const tags = ["ai", "machinelearning", "career", "productivity", "programming"];

  return { title, markdown: text, tags };
}

/**
 * Publish a markdown article to dev.to
 * API docs: https://developers.forem.com/api
 * Endpoint: POST https://dev.to/api/articles
 */
async function publishToDevTo({ title, markdown, tags, canonical_url }) {
  const payload = {
    article: {
      title,
      published: true,
      body_markdown: markdown,
      tags, // up to 4 tags fully indexed, others still okay in body
      canonical_url
    }
  };

  const res = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": DEVTO_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`dev.to publish error ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data;
}

async function main() {
  console.log(`Starting daily run ${stamp}…`);

  // 3 distinct article roles to keep daily content varied
  const briefs = [
    {
      role: "Weekly-style AI & Tech roundup (evergreen explainer edition)",
      focus:
        "Explain key AI trends shaping the past quarter, what they mean for developers and job seekers, and how to stay credible without chasing hype."
    },
    {
      role: "Career playbook using AI",
      focus:
        "A practical guide to using AI to upskill (projects, portfolios, interview prep), with reproducible workflows and prompts."
    },
    {
      role: "Tooling deep-dive",
      focus:
        "Compare 2–3 free AI tools for developers (e.g., code assistants, data wrangling, docs agents). Show hands-on examples and gotchas."
    }
  ];

  for (let i = 0; i < briefs.length; i++) {
    const b = briefs[i];
    console.log(`Generating article ${i + 1}…`);
    const { title, markdown, tags } = await generateArticle(b);

    // Defensive: append date to title if missing, and add a small footer
    const finalTitle = title.includes(stamp) ? title : `${title} (${stamp})`;
    const footer =
      `\n\n---\n*Auto-published via GitHub Actions • Topic: AI + Tech News & AI Career Advice • ${stamp}*`;
    const body = markdown.endsWith(footer) ? markdown : markdown + footer;

    console.log(`Publishing to dev.to: "${finalTitle}"…`);
    const post = await publishToDevTo({
      title: finalTitle,
      markdown: body,
      tags
    });

    console.log(`✔ Published: ${post?.url || post?.canonical_url || post?.id}`);
    // Small pause to be nice to APIs
    await sleep(2500);
  }

  console.log("All done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
