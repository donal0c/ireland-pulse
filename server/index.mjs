import express from "express";
import { XMLParser } from "fast-xml-parser";

const PORT = Number(process.env.PORT ?? 8787);
const REDDIT_URL =
  "https://www.reddit.com/r/ireland+galway+cork+limerick+waterford/hot.json?limit=18";
const WEATHER_STATIONS = ["dublin", "cork", "shannon", "athenry", "valentia", "knock"];
const RAIL_URL = "https://api.irishrail.ie/realtime/realtime.asmx/getCurrentTrainsXML";
const CACHE_MS = 45_000;

let cachedPulse = null;

const app = express();

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "ireland-pulse-api" });
});

app.get("/api/pulse", async (_request, response) => {
  if (cachedPulse && Date.now() - cachedPulse.time < CACHE_MS) {
    response.json(cachedPulse.payload);
    return;
  }

  const payload = await buildPulsePayload();
  cachedPulse = { time: Date.now(), payload };
  response.json(payload);
});

app.listen(PORT, () => {
  console.log(`Ireland Pulse API listening on http://127.0.0.1:${PORT}`);
});

async function buildPulsePayload() {
  const generatedAt = new Date().toISOString();
  const [conversation, weather, rail] = await Promise.all([
    fetchConversation(generatedAt),
    fetchWeather(generatedAt),
    fetchRail(generatedAt)
  ]);

  const sources = [
    conversation.status,
    weather.status,
    rail.status,
    {
      name: "EirGrid",
      state: "unavailable",
      detail: "Excluded from primary display: researched endpoint is flaky and currently unavailable.",
      checkedAt: generatedAt
    }
  ];

  return {
    generatedAt,
    summary: makeSummary(conversation.posts, weather.lead, rail.total),
    conversation: {
      posts: conversation.posts,
      topics: conversation.topics,
      lead: conversation.lead
    },
    weather: {
      lead: weather.lead,
      stations: weather.stations
    },
    rail: {
      total: rail.total,
      mapped: rail.mapped,
      trains: rail.trains,
      routes: rail.routes
    },
    sources
  };
}

async function fetchConversation(checkedAt) {
  try {
    const json = await fetchJson(REDDIT_URL, {
      headers: {
        "User-Agent": "ireland-pulse/0.1 live-information-website"
      }
    });

    const posts = (json?.data?.children ?? [])
      .map((child) => normalizePost(child?.data))
      .filter(Boolean)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 10);

    const topics = extractTopics(posts);
    return {
      posts,
      topics,
      lead: makeConversationLead(posts),
      status: {
        name: "Reddit",
        state: posts.length ? "live" : "degraded",
        detail: `${posts.length} public posts from r/ireland and regional subreddits.`,
        checkedAt
      }
    };
  } catch (error) {
    return {
      posts: [],
      topics: [],
      lead: "Conversation feed unavailable",
      status: {
        name: "Reddit",
        state: "unavailable",
        detail: error.message,
        checkedAt
      }
    };
  }
}

async function fetchWeather(checkedAt) {
  const results = await Promise.allSettled(
    WEATHER_STATIONS.map(async (station) => {
      const json = await fetchJson(`https://prodapi.metweb.ie/observations/${station}/today`);
      const latest = Array.isArray(json) ? json.at(-1) : null;
      if (!latest) throw new Error(`No observation for ${station}`);
      return normalizeWeather(latest);
    })
  );

  const stations = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failed = results.length - stations.length;

  return {
    lead: stations.find((station) => station.station === "Dublin Airport") ?? stations[0] ?? null,
    stations,
    status: {
      name: "Met Eireann",
      state: stations.length >= 3 ? "live" : stations.length ? "degraded" : "unavailable",
      detail: `${stations.length} station observations loaded${failed ? `, ${failed} failed` : ""}.`,
      checkedAt
    }
  };
}

async function fetchRail(checkedAt) {
  try {
    const xml = await fetchText(RAIL_URL);
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    const parsed = parser.parse(xml);
    const raw = parsed?.ArrayOfObjTrainPositions?.objTrainPositions ?? [];
    const trains = arrayOf(raw).map(normalizeTrain).filter(Boolean);
    const mapped = trains.filter((train) => train.latitude && train.longitude).length;
    const routes = trains
      .filter((train) => train.route !== "Route unavailable")
      .sort((a, b) => Number(b.status === "R") - Number(a.status === "R"))
      .slice(0, 8);

    return {
      total: trains.length,
      mapped,
      trains,
      routes,
      status: {
        name: "Irish Rail",
        state: trains.length ? "live" : "degraded",
        detail: `${trains.length} trains loaded, ${mapped} with map coordinates.`,
        checkedAt
      }
    };
  } catch (error) {
    return {
      total: 0,
      mapped: 0,
      trains: [],
      routes: [],
      status: {
        name: "Irish Rail",
        state: "unavailable",
        detail: error.message,
        checkedAt
      }
    };
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function normalizePost(post) {
  if (!post?.title) return null;
  const score = numberOrZero(post.score);
  const comments = numberOrZero(post.num_comments);
  const category = categorizePost(post.title, post.link_flair_text);

  return {
    id: String(post.id),
    title: cleanTitle(post.title),
    subreddit: String(post.subreddit ?? "ireland"),
    flair: String(post.link_flair_text ?? "no flair"),
    score,
    comments,
    category,
    intensity: score + comments * 2,
    ageHours: Math.max(0, (Date.now() / 1000 - numberOrZero(post.created_utc)) / 3600)
  };
}

function normalizeWeather(raw) {
  return {
    station: String(raw.name ?? "Unknown station"),
    temperature: nullableNumber(raw.temperature),
    description: String(raw.weatherDescription ?? raw.text ?? "Unknown"),
    windSpeed: nullableNumber(raw.windSpeed),
    windDirection: nullableNumber(raw.windDirection),
    cardinalWindDirection: String(raw.cardinalWindDirection ?? "-"),
    rainfall: nullableNumber(raw.rainfall),
    pressure: nullableNumber(raw.pressure),
    reportTime: String(raw.reportTime ?? "")
  };
}

function normalizeTrain(raw) {
  const message = String(raw.PublicMessage ?? "")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const route = extractRoute(message);
  const delayMinutes = extractDelay(message);

  return {
    code: String(raw.TrainCode ?? "Unknown"),
    status: String(raw.TrainStatus ?? "N"),
    latitude: nullableCoordinate(raw.TrainLatitude),
    longitude: nullableCoordinate(raw.TrainLongitude),
    direction: String(raw.Direction ?? ""),
    message,
    route,
    delayMinutes
  };
}

function categorizePost(title, flair = "") {
  const text = `${title} ${flair}`.toLowerCase();
  if (text.includes("energy") || text.includes("nuclear") || text.includes("wind")) return "Energy";
  if (text.includes("politic") || text.includes("taoiseach")) return "Politics";
  if (text.includes("flotilla") || text.includes("israel") || text.includes("gaza")) return "World";
  if (text.includes("accommodation") || text.includes("digs") || text.includes("housing")) return "Housing";
  if (text.includes("photo") || text.includes("photography") || text.includes("city")) return "Local life";
  if (text.includes("galway") || text.includes("cork") || text.includes("waterford") || text.includes("limerick")) {
    return "Regional";
  }
  return flair && flair !== "no flair" ? String(flair).replace(/[^\w\s/-]/g, "").trim() : "Local life";
}

function extractTopics(posts) {
  const topicCounts = new Map();
  for (const post of posts) {
    for (const topic of topicWords(post.title)) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + post.intensity);
    }
  }
  return [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([topic]) => topic);
}

function topicWords(title) {
  const text = title.toLowerCase();
  const topics = [];
  if (text.includes("nuclear")) topics.push("nuclear power");
  if (text.includes("wind")) topics.push("wind energy");
  if (text.includes("flotilla") || text.includes("israeli")) topics.push("flotilla");
  if (text.includes("cork")) topics.push("Cork");
  if (text.includes("galway")) topics.push("Galway");
  if (text.includes("accommodation") || text.includes("digs")) topics.push("housing");
  if (text.includes("energy")) topics.push("energy");
  return topics;
}

function makeConversationLead(posts) {
  const [top] = posts;
  if (!top) return "Conversation feed unavailable";
  if (top.category === "Energy" || top.title.toLowerCase().includes("nuclear")) {
    return "Energy is setting the tone of the national conversation.";
  }
  return `${top.category} is the loudest signal in the public conversation.`;
}

function makeSummary(posts, weather, trainCount) {
  const top = posts[0];
  const topic = top ? `${top.category.toLowerCase()} is leading the public conversation` : "the public conversation is loading";
  const station = weather
    ? `${weather.station} reports ${weather.description.toLowerCase()} at ${weather.temperature ?? "-"}C`
    : "weather observations";
  return `Tonight, ${topic}; ${station}; ${trainCount} live trains are moving across the rail network.`;
}

function extractRoute(message) {
  const cleaned = message.replace(/^[A-Z]\d+\s+/, "");
  const routeMatch = cleaned.match(
    /(?:\d{1,2}:\d{2}\s*-\s*)?([A-Za-z .'-]+?\s+to\s+[A-Za-z .'-]+?)(?:\s+\(|\s+Expected|\s+Departed|$)/i
  );
  if (!routeMatch) return "Route unavailable";
  return routeMatch[1].replace(/\s+/g, " ").trim();
}

function extractDelay(message) {
  const match = message.match(/\((-?\d+)\s*mins?\s*late\)/i);
  return match ? Number(match[1]) : null;
}

function cleanTitle(title) {
  return String(title).replace(/\s+/g, " ").trim();
}

function nullableNumber(value) {
  const numeric = Number(String(value ?? "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableCoordinate(value) {
  const numeric = nullableNumber(value);
  if (!numeric) return null;
  return numeric;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}
