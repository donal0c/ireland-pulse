export type SourceStatus = {
  name: string;
  state: "live" | "degraded" | "unavailable";
  detail: string;
  checkedAt: string;
};

export type RedditPost = {
  id: string;
  title: string;
  subreddit: string;
  flair: string;
  score: number;
  comments: number;
  category: string;
  intensity: number;
  ageHours: number;
};

export type WeatherObservation = {
  station: string;
  temperature: number | null;
  description: string;
  windSpeed: number | null;
  windDirection: number | null;
  cardinalWindDirection: string;
  rainfall: number | null;
  pressure: number | null;
  reportTime: string;
};

export type TrainPosition = {
  code: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  direction: string;
  message: string;
  route: string;
  delayMinutes: number | null;
};

export type PulsePayload = {
  generatedAt: string;
  summary: string;
  conversation: {
    posts: RedditPost[];
    topics: string[];
    lead: string;
  };
  weather: {
    lead: WeatherObservation | null;
    stations: WeatherObservation[];
  };
  rail: {
    total: number;
    mapped: number;
    trains: TrainPosition[];
    routes: TrainPosition[];
  };
  sources: SourceStatus[];
};
