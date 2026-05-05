import { useEffect, useState } from "react";
import {
  Cloud,
  CloudSun,
  Gauge,
  MessageSquareText,
  RefreshCw,
  TrainFront,
  Wind
} from "lucide-react";
import { fetchPulse } from "./api";
import type { PulsePayload, RedditPost, SourceStatus, TrainPosition, WeatherObservation } from "./types";

const irelandBounds = {
  minLat: 51.3,
  maxLat: 55.4,
  minLng: -10.7,
  maxLng: -5.4
};

const mapLabels = [
  { name: "Derry", x: 72, y: 16 },
  { name: "Belfast", x: 88, y: 27 },
  { name: "Sligo", x: 48, y: 34 },
  { name: "Drogheda", x: 82, y: 42 },
  { name: "Dublin", x: 88, y: 52 },
  { name: "Galway", x: 38, y: 56 },
  { name: "Limerick", x: 47, y: 72 },
  { name: "Killarney", x: 34, y: 82 },
  { name: "Waterford", x: 77, y: 82 },
  { name: "Cork", x: 50, y: 90 }
];

const IRELAND_OUTLINES = [
  "M61.8 22.5 L56.8 27.9 L50.4 28.7 L54.1 30.2 L46.3 32.6 L51.6 36.8 L60.4 38.4 L65.6 33.4 L72.0 39.6 L80.7 40.1 L76.2 41.4 L81.2 47.7 L79.3 49.3 L81.5 50.8 L78.9 51.1 L82.6 57.6 L76.4 67.8 L74.3 67.5 L76.8 70.3 L69.8 69.2 L67.0 71.5 L65.9 68.8 L65.6 71.3 L55.9 71.9 L56.1 73.7 L48.9 76.5 L42.4 75.4 L44.3 77.5 L39.9 78.5 L40.4 80.0 L28.9 82.1 L18.9 82.8 L23.5 80.0 L18.5 81.1 L25.0 78.8 L23.3 77.5 L13.4 80.5 L22.9 75.6 L10.3 77.1 L11.5 73.8 L20.0 71.0 L8.3 70.6 L15.0 68.4 L20.3 69.4 L16.8 66.7 L22.0 65.7 L21.8 64.1 L36.7 62.4 L33.6 60.7 L27.8 63.7 L22.9 62.5 L17.0 64.3 L24.3 61.0 L28.1 54.5 L34.4 53.2 L22.4 53.0 L23.4 50.5 L19.2 51.9 L17.6 51.5 L19.3 49.9 L13.0 50.1 L15.8 48.9 L13.0 47.7 L21.0 47.0 L17.5 46.2 L17.5 44.2 L23.3 42.5 L16.9 42.3 L19.5 41.7 L18.7 38.4 L16.4 39.0 L15.8 36.6 L14.0 38.7 L14.0 36.4 L17.5 36.9 L19.5 34.7 L28.1 35.2 L30.2 37.9 L31.7 35.5 L40.7 36.8 L38.2 34.3 L47.2 29.5 L41.6 30.9 L36.0 28.8 L43.8 26.4 L41.6 23.6 L44.6 21.0 L51.6 21.3 L52.6 19.4 L54.2 22.0 L52.8 20.0 L55.2 19.1 L57.1 21.7 L54.5 24.4 L58.3 22.7 L57.2 18.8 L61.6 18.9 L59.5 17.2 L66.9 19.7 L61.8 22.5 Z",
  "M61.8 22.5 L65.0 22.8 L66.5 20.4 L80.8 20.1 L82.8 23.9 L87.7 27.1 L84.1 30.2 L89.6 29.0 L91.9 32.6 L90.6 34.7 L89.9 31.8 L87.5 30.7 L88.8 32.9 L87.4 34.4 L90.0 35.3 L84.8 36.4 L84.3 38.5 L81.2 39.7 L76.6 38.4 L72.0 39.6 L71.9 37.5 L65.6 33.4 L62.7 34.7 L63.3 36.5 L61.2 38.2 L55.7 38.0 L46.3 32.6 L54.1 30.2 L50.4 28.7 L56.8 27.9 L59.1 23.6 L61.8 22.5 Z"
];

function App() {
  const [pulse, setPulse] = useState<PulsePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setRefreshing(true);
        const nextPulse = await fetchPulse();
        if (!cancelled) {
          setPulse(nextPulse);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Unable to load pulse data");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!pulse) {
    return <LoadingState error={error} />;
  }

  const leadWeather = pulse.weather.lead;
  return (
    <div className="app">
      <div className="weather-field" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" />
              <path d="M7 21h7l3-9 5 18 4-12 3 3h4" />
            </svg>
          </span>
          <h1>Ireland Pulse</h1>
        </div>
        <div className="topbar-meta">
          <span>{formatUpdated(pulse.generatedAt)}</span>
          <span>All times local</span>
          <RefreshCw size={16} className={refreshing ? "spin" : ""} aria-hidden="true" />
        </div>
      </header>

      <main className="pulse-layout">
        <section className="story-panel" aria-label="Current Ireland briefing">
          <h2>
            Fair skies,
            <br />
            busy rails,
            <br />
            loud conversations
          </h2>
          <p className="summary">Live signals from Irish Reddit, Met Eireann observations, and Irish Rail positions.</p>
          <WeatherHero weather={leadWeather} />
          <StationStrip stations={pulse.weather.stations} />
        </section>

        <section className="briefing-panel" aria-label="Live discussion and movement">
          <ConversationList posts={pulse.conversation.posts.slice(0, 3)} />
          <Movement routes={pulse.rail.routes.slice(0, 4)} total={pulse.rail.total} mapped={pulse.rail.mapped} />
        </section>

        <section className="map-panel" aria-label="Live Ireland signal map">
          <PulseMap pulse={pulse} />
        </section>
      </main>

      <section className="signal-band" aria-label="Live source status">
        <SourceStatusPanel sources={pulse.sources} />
        <TopicBar topics={pulse.conversation.topics} />
        <div className="freshness">
          <p>All times local</p>
          <span>Data updates every 30s</span>
          <i aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}

function LoadingState({ error }: { error: string | null }) {
  return (
    <div className="app loading-state">
      <div className="weather-field" aria-hidden="true" />
      <p className="kicker">Ireland Pulse</p>
      <h1>Loading live public signals</h1>
      <p>{error ?? "Fetching Reddit, Met Eireann, and Irish Rail."}</p>
    </div>
  );
}

function WeatherHero({ weather }: { weather: WeatherObservation | null }) {
  if (!weather) {
    return (
      <article className="weather-hero">
        <CloudSun size={22} aria-hidden="true" />
        <div>
          <p className="module-title">Weather now</p>
          <p>Weather feed unavailable.</p>
        </div>
      </article>
    );
  }

  return (
    <article className="weather-hero">
      <div className="weather-icon">
        <Cloud size={68} aria-hidden="true" />
      </div>
      <div>
        <p className="module-title">{weather.station}</p>
        <p className="weather-condition">{displayWeather(weather.description)}</p>
        <p className="weather-reading">{formatNumber(weather.temperature)}C</p>
        <p className="fine-print">
          <span>
            <Wind size={14} aria-hidden="true" /> Wind {weather.cardinalWindDirection}{" "}
            {formatNumber(weather.windSpeed)} kt
          </span>
          <span>
            <Gauge size={14} aria-hidden="true" /> Pressure {formatNumber(weather.pressure)} hPa
          </span>
          <span>Rain {formatNumber(weather.rainfall)} mm</span>
          <span>Observed {weather.reportTime}</span>
        </p>
      </div>
    </article>
  );
}

function StationStrip({ stations }: { stations: WeatherObservation[] }) {
  return (
    <div className="station-strip" aria-label="Weather by station">
      {stations.slice(1, 5).map((station) => (
        <div key={station.station} className="station">
          <span>{station.station.replace(" Airport", "")}</span>
          <CloudSun size={26} aria-hidden="true" />
          <strong>{formatNumber(station.temperature)}C</strong>
          <small>
            {displayWeather(station.description)} / {station.cardinalWindDirection} {formatNumber(station.windSpeed)} kt
          </small>
        </div>
      ))}
    </div>
  );
}

function ConversationList({ posts }: { posts: RedditPost[] }) {
  return (
    <section className="conversation">
      <div className="module-heading">
        <MessageSquareText size={18} aria-hidden="true" />
        <div>
          <p className="module-title">Most discussed</p>
          <p className="fine-print">Ranked by upvotes plus comment intensity.</p>
        </div>
      </div>
      <ol>
        {posts.map((post, index) => (
          <li key={post.id} style={{ "--heat": `${Math.min(100, Math.max(18, post.intensity / 8))}%` } as React.CSSProperties}>
            <span className="rank">{index + 1}</span>
            <div>
              <p>{post.title}</p>
              <small>
                ↑ {post.score} &nbsp;&nbsp; ◱ {post.comments}
              </small>
            </div>
            <i className="mini-bars" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Movement({ routes, total }: { routes: TrainPosition[]; total: number; mapped: number }) {
  return (
    <article className="movement">
      <div className="module-heading movement-heading">
        <TrainFront size={18} aria-hidden="true" />
        <div>
          <p className="module-title">Movement | Irish Rail</p>
          <p className="train-total"><strong>{total}</strong> live trains</p>
          <p className="fine-print">Across the network</p>
        </div>
      </div>
      <div className="route-list">
        {routes.map((route, index) => (
          <span key={`${route.code}-${route.route}`}>
            <b>{index + 1}</b>
            <em>
              {route.route}
              <small>{route.delayMinutes !== null ? formatDelay(route.delayMinutes) : "Status live"}</small>
            </em>
            <strong>{route.delayMinutes && route.delayMinutes > 4 ? "Delayed" : "On time"}</strong>
          </span>
        ))}
      </div>
    </article>
  );
}

function TopicBar({ topics }: { topics: string[] }) {
  return (
    <article className="topic-bar">
      <p className="module-title">Live signals</p>
      <div>
        {(topics.length ? topics : ["energy", "local life", "weather", "movement"]).map((topic) => (
          <span key={topic}>{topic}</span>
        ))}
      </div>
    </article>
  );
}

function SourceStatusPanel({ sources }: { sources: SourceStatus[] }) {
  return (
    <article className="sources">
      <p className="module-title">Live signals</p>
      <div>
        {sources.map((source) => (
          <span key={source.name} className={`source ${source.state}`}>
            <b>{source.name}</b>
            <small>{sourceLabel(source.name)}</small>
            <em>{source.state}</em>
          </span>
        ))}
      </div>
    </article>
  );
}

function PulseMap({ pulse }: { pulse: PulsePayload }) {
  const mappedTrains = pulse.rail.trains.filter((train) => train.latitude && train.longitude).slice(0, 42);
  const posts = pulse.conversation.posts;

  return (
    <div className="pulse-map">
      <svg viewBox="0 0 100 100" role="img" aria-label="Ireland map with weather, rail, and conversation signals">
        <defs>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="land" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#cdd7c1" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#4d7c72" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#172f33" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        <g className="wind-lines">
          {Array.from({ length: 36 }).map((_, index) => (
            <path
              key={index}
              d={`M ${-8 + index * 3.4} 100 C ${18 + index * 2.4} 77, ${5 + index * 3.6} 55, ${
                24 + index * 2.8
              } 33 C ${38 + index * 2.3} 17, ${34 + index * 2.9} 5, ${56 + index * 2.2} -8`}
            />
          ))}
        </g>

        {IRELAND_OUTLINES.map((outline, index) => (
          <path key={`land-${index}`} className="ireland-shape" d={outline} fill="url(#land)" />
        ))}
        {IRELAND_OUTLINES.map((outline, index) => (
          <path key={`coast-${index}`} className="coastline" d={outline} fill="none" />
        ))}

        <g className="rail-lines">
          <path d="M88 52 C78 49, 70 45, 62 38 C56 34, 49 36, 39 56 C47 57, 61 59, 76 52" />
          <path d="M88 52 C80 60, 72 73, 50 90" />
          <path d="M88 52 C82 41, 75 29, 72 16" />
          <path d="M50 90 C48 80, 47 74, 47 72" />
          <path d="M88 52 C82 64, 80 73, 77 82" />
        </g>

        {mapLabels.map((city) => (
          <g key={city.name} className="city">
            <circle cx={city.x} cy={city.y} r={cityPulse(city.name, posts)} />
            <text x={city.x + 2.3} y={city.y - 1.8}>
              {city.name}
            </text>
          </g>
        ))}

        <g className="train-points" filter="url(#softGlow)">
          {mappedTrains.map((train, index) => {
            const point = projectTrain(train);
            return (
              <circle
                key={`${train.code}-${index}`}
                cx={point.x}
                cy={point.y}
                r={train.status === "R" ? 0.95 : 0.7}
                style={{ animationDelay: `${index * 130}ms` }}
              />
            );
          })}
        </g>
      </svg>

      <div className="map-copy">
        <p className="section-label">Wind (10m)</p>
        <h3>South {formatNumber(pulse.weather.lead?.windSpeed ?? null)} kt</h3>
        <div className="wind-scale">
          <span />
          <small>0</small>
          <small>10</small>
          <small>20</small>
          <small>30 kt</small>
        </div>
        <p><i className="train-dot" /> Live train position</p>
        <p><i className="rail-line" /> Rail route</p>
      </div>
    </div>
  );
}

function projectTrain(train: TrainPosition) {
  const latitude = train.latitude ?? irelandBounds.minLat;
  const longitude = train.longitude ?? irelandBounds.minLng;
  const x = ((longitude - irelandBounds.minLng) / (irelandBounds.maxLng - irelandBounds.minLng)) * 100;
  const y = (1 - (latitude - irelandBounds.minLat) / (irelandBounds.maxLat - irelandBounds.minLat)) * 100;
  return { x: Math.max(8, Math.min(92, x)), y: Math.max(6, Math.min(94, y)) };
}

function cityPulse(city: string, posts: RedditPost[]) {
  const heat = posts
    .filter((post) => `${post.title} ${post.subreddit}`.toLowerCase().includes(city.toLowerCase()))
    .reduce((total, post) => total + post.intensity, 0);
  return Math.max(1.4, Math.min(5.8, 1.4 + heat / 80));
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatNumber(value: number | null) {
  return value === null ? "-" : String(value);
}

function formatDelay(value: number) {
  if (value === 0) return "on time";
  if (value < 0) return `${Math.abs(value)} min early`;
  return `${value} min late`;
}

function displayWeather(description: string) {
  const lower = description.toLowerCase();
  if (lower.includes("clear") || lower.includes("sun")) return "Clear";
  if (lower.includes("fair")) return "Fair";
  if (lower.includes("cloud")) return "Cloudy";
  if (lower.includes("rain")) return "Rain";
  return description;
}

function sourceLabel(name: string) {
  if (name === "Reddit") return "r/Ireland & regions";
  if (name === "Met Eireann") return "Observations";
  if (name === "Irish Rail") return "Train positions";
  if (name === "EirGrid") return "Grid frequency";
  return "Signal";
}

export default App;
