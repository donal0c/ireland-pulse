import { XMLParser } from "fast-xml-parser";

const REDDIT_URL = "https://www.reddit.com/r/ireland+galway+cork+limerick+waterford/hot.json?limit=18";
const WEATHER_STATIONS = ["dublin", "cork", "shannon", "athenry", "valentia", "knock"];
const RAIL_URL = "https://api.irishrail.ie/realtime/realtime.asmx/getCurrentTrainsXML";

let cachedPulse = null;
const CACHE_MS = 45_000;

function categorisePost(post) {
  const t = (post.flair || post.title || "").toLowerCase();
  if (t.includes("politic") || t.includes("government") || t.includes("taoiseach")) return "politics";
  if (t.includes("environment") || t.includes("energy") || t.includes("climate") || t.includes("flood")) return "environment";
  if (t.includes("gaeilge") || t.includes("irish language") || t.includes("culture") || t.includes("history")) return "culture";
  if (t.includes("sport") || t.includes("gaa") || t.includes("soccer") || t.includes("rugby")) return "sport";
  if (t.includes("cost") || t.includes("housing") || t.includes("rent") || t.includes("finance")) return "economy";
  if (t.includes("outside") || t.includes("lovely") || t.includes("walk") || t.includes("photo")) return "outdoors";
  return "general";
}

async function fetchAll() {
  const now = new Date().toISOString();
  const sources = [];

  // Reddit
  let posts = [];
  let topics = [];
  let conversationLead = "Ireland is talking…";
  try {
    const redditRes = await fetch(REDDIT_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });
    if (redditRes.ok) {
      const redditData = await redditRes.json();
      const children = redditData?.data?.children ?? [];
      posts = children.map((c, i) => {
        const d = c.data;
        const ageHours = (Date.now() / 1000 - d.created_utc) / 3600;
        return {
          id: d.id,
          title: d.title,
          subreddit: d.subreddit,
          flair: d.link_flair_text ?? "",
          score: d.score,
          comments: d.num_comments,
          category: categorisePost({ flair: d.link_flair_text, title: d.title }),
          intensity: Math.min(1, d.score / 500),
          ageHours: Math.round(ageHours * 10) / 10,
        };
      });
      if (posts.length > 0) {
        conversationLead = posts[0].title;
        topics = [...new Set(posts.map(p => p.category))].slice(0, 4);
      }
      sources.push({ name: "Reddit r/ireland", state: "live", detail: `${posts.length} posts`, checkedAt: now });
    } else {
      sources.push({ name: "Reddit r/ireland", state: "degraded", detail: `HTTP ${redditRes.status}`, checkedAt: now });
    }
  } catch (e) {
    sources.push({ name: "Reddit r/ireland", state: "unavailable", detail: e.message, checkedAt: now });
  }

  // Weather
  let weatherStations = [];
  let leadWeather = null;
  try {
    const results = await Promise.all(WEATHER_STATIONS.map(s =>
      fetch(`https://prodapi.metweb.ie/observations/${s}/today`)
        .then(r => r.json())
        .then(d => {
          const obs = Array.isArray(d) ? d[d.length - 1] : d;
          if (!obs) return null;
          return {
            station: obs.name ?? s,
            temperature: parseFloat(obs.temperature) || null,
            description: obs.weatherDescription ?? obs.text ?? "Unknown",
            windSpeed: parseFloat(obs.windSpeed) || null,
            windDirection: obs.windDirection ?? null,
            cardinalWindDirection: obs.cardinalWindDirection ?? "N",
            rainfall: parseFloat(obs.rainfall) || null,
            pressure: parseFloat(obs.pressure) || null,
            reportTime: obs.reportTime ?? "",
          };
        })
        .catch(() => null)
    ));
    weatherStations = results.filter(Boolean);
    leadWeather = weatherStations.find(s => s.station.toLowerCase().includes("dublin")) ?? weatherStations[0] ?? null;
    sources.push({ name: "Met Éireann", state: "live", detail: `${weatherStations.length} stations`, checkedAt: now });
  } catch (e) {
    sources.push({ name: "Met Éireann", state: "unavailable", detail: e.message, checkedAt: now });
  }

  // Irish Rail
  let trains = [];
  try {
    const railRes = await fetch(RAIL_URL);
    const xml = await railRes.text();
    const parser = new XMLParser();
    const result = parser.parse(xml);
    const raw = result?.ArrayOfObjTrainPositions?.objTrainPositions ?? [];
    const rawArr = Array.isArray(raw) ? raw : [raw];
    trains = rawArr.map(t => ({
      code: String(t.TrainCode ?? ""),
      status: String(t.TrainStatus ?? "N"),
      latitude: parseFloat(t.TrainLatitude) || null,
      longitude: parseFloat(t.TrainLongitude) || null,
      direction: String(t.Direction ?? ""),
      message: String(t.PublicMessage ?? ""),
      route: String(t.PublicMessage ?? "").split("\\n")[1] ?? "",
      delayMinutes: null,
    })).filter(t => t.latitude !== null);
    sources.push({ name: "Irish Rail", state: "live", detail: `${trains.length} trains`, checkedAt: now });
  } catch (e) {
    sources.push({ name: "Irish Rail", state: "unavailable", detail: e.message, checkedAt: now });
  }

  const weatherDesc = leadWeather?.description ?? "Unknown";
  const trainCount = trains.length;
  const summary = `${trainCount} trains moving · ${weatherDesc} · ${posts.length > 0 ? `Ireland discussing: ${topics.slice(0, 2).join(", ")}` : "live signals loading"}`;

  return {
    generatedAt: now,
    summary,
    conversation: { posts: posts.slice(0, 12), topics, lead: conversationLead },
    weather: { lead: leadWeather, stations: weatherStations },
    rail: { total: trains.length, mapped: trains.length, trains, routes: trains.slice(0, 5) },
    sources,
  };
}

export default async function handler(request, context) {
  if (cachedPulse && Date.now() - cachedPulse.time < CACHE_MS) {
    return Response.json(cachedPulse.data, {
      headers: { "Cache-Control": "public, max-age=30", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const data = await fetchAll();
    cachedPulse = { data, time: Date.now() };
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=30", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return Response.json({ error: err.message }, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
}

export const config = { path: "/api/pulse" };
