import dotenv from "dotenv";
dotenv.config();

export const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || "";
export const PORT = parseInt(process.env.PORT || "8081", 10);
export const POLL_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES || "15", 10);
export const TRACKED_KEYWORDS = ["Elon Musk", "Sam Altman"];
export const MAX_HISTORY_POINTS = 96; // ~24 hours at 15min interval
