export const CONFIG = {
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  OBSERVER_TIMEOUT: 30000,
  MAX_CHECK_ATTEMPTS: 20,
  CHECK_INTERVAL: 150,
  QUEUE_RETRY_DELAY: 200,
  REQUEST_TIMEOUT: 10000,
  CURSOR_UPDATE_DELAY: 100,
} as const;

// Always excluded — cannot be toggled off
export const HARDCODED_BLACKLIST = [
  'https://firebasestorage.googleapis.com/v0/b/firescript-577a2.appspot.com',
  'https://roamresearch.com',
  'https://www.bilibili.com',
  'https://bilibili.com',
];

// YouTube domains — can be toggled on/off via settings
export const YOUTUBE_DOMAINS = [
  'https://www.youtube.com',
  'https://youtube.com',
  'https://youtu.be',
  'https://m.youtube.com',
  'https://music.youtube.com',
];