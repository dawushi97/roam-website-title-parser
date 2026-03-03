import { CONFIG } from '../config/constants';
import { getBlockContent, updateBlock, updateCursorPosition } from '../utils/roam';
import { isMarkdownUrl } from '../utils/url';
import { getExcludedUrls, isPluginEnabled } from '../config/settings';

// Unified YouTube URL config: each entry pairs a URL matcher with a title suffix pattern
const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?/,
  /^https?:\/\/m\.youtube\.com\/watch\?/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\//,
  /^https?:\/\/(www\.)?youtube\.com\/embed\//,
  /^https?:\/\/youtu\.be\//,
  /^https?:\/\/(www\.)?youtube\.com\/live\//,
  /^https?:\/\/music\.youtube\.com\/watch\?/,
];

const YOUTUBE_TITLE_SUFFIXES = [
  / - YouTube$/i,
  / \| YouTube$/i,
  / — YouTube$/i,
];

function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(url));
}

const YOUTUBE_VIDEO_ID_PATTERNS = [
  /[?&]v=([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
];

function extractYouTubeVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const CORS_PROXY = 'https://us-central1-firescript-577a2.cloudfunctions.net/proxy-corsAnywhere';

// Fetch with AbortController timeout to prevent hanging requests
async function fetchWithTimeout(
  url: string,
  timeoutMs = CONFIG.REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// YouTube oEmbed API via CORS proxy — returns clean title without suffix, ~200 bytes response
async function getYouTubeTitle(url: string): Promise<string | null> {
  try {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) return null;

    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetchWithTimeout(`${CORS_PROXY}/${oembedUrl}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.title || null;
  } catch (error) {
    console.error('Error fetching YouTube title via oEmbed:', error);
    return null;
  }
}

function cleanTitle(title: string, url: string): string {
  if (!title) return title;

  let cleaned = title.trim();

  if (isYouTubeUrl(url)) {
    for (const pattern of YOUTUBE_TITLE_SUFFIXES) {
      cleaned = cleaned.replace(pattern, '');
    }
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

// Fetch title from HTML via CORS proxy, trying og:title, twitter:title, <title>, <h1>
async function getGenericWebsiteTitle(url: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${CORS_PROXY}/${url}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle) return cleanTitle(ogTitle, url);

    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    if (twitterTitle) return cleanTitle(twitterTitle, url);

    const titleElement = doc.querySelector('title');
    if (titleElement?.textContent) {
      return cleanTitle(titleElement.textContent, url);
    }

    const h1 = doc.querySelector('h1');
    if (h1?.textContent) {
      return cleanTitle(h1.textContent.trim(), url);
    }

    return null;
  } catch (error) {
    console.error("Error fetching the website title:", error);
    return null;
  }
}

// YouTube: oEmbed via proxy (fast, clean title) → fallback generic HTML parsing
// Others: generic HTML parsing via proxy
async function getWebsiteTitle(url: string): Promise<string | null> {
  if (isYouTubeUrl(url)) {
    const title = await getYouTubeTitle(url);
    if (title) return title;
  }
  return await getGenericWebsiteTitle(url);
}

export async function parseWebsiteUrlTitle(
  url: string,
  blockUid: string,
  processedUrls: Set<string>
): Promise<void> {
  const taskKey = `${url}-${blockUid}`;
  if (processedUrls.has(taskKey)) return;

  if (!isPluginEnabled()) {
    return;
  }

  const excludedUrls = getExcludedUrls();
  if (isMarkdownUrl(url) || excludedUrls.some(excluded => url.startsWith(excluded))) {
    processedUrls.add(taskKey);
    return;
  }

  const currentContent = getBlockContent(blockUid);

  const markdownLinkRegex = /\[([^\]]+)\]\([^)]+\)/g;
  const contentWithoutMarkdown = currentContent.replace(markdownLinkRegex, '');

  if (!contentWithoutMarkdown.includes(url)) {
    processedUrls.add(taskKey);
    return;
  }

  for (let attempt = 0; attempt < CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      let websiteTitle;
      try {
        websiteTitle = await getWebsiteTitle(url);
      } catch (e) {
        continue;
      }

      if (!websiteTitle) {
        processedUrls.add(taskKey);
        return;
      }

      await updateBlockUrlFormat(url, websiteTitle, blockUid);
      processedUrls.add(taskKey);
      return;

    } catch (error) {
      if (attempt === CONFIG.RETRY_ATTEMPTS - 1) {
        processedUrls.add(taskKey);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
    }
  }
}

async function updateBlockUrlFormat(url: string, title: string, blockUid: string): Promise<void> {
  const originalContent = getBlockContent(blockUid);
  if (!originalContent) return;

  const urlWithMarkdownFormat = `[${title}](${url})`;

  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlRegex = new RegExp(`(?<!\\()${escapedUrl}(?!\\))`, 'g');
  const newContent = originalContent.replace(urlRegex, urlWithMarkdownFormat);

  if (newContent !== originalContent) {
    await updateBlock(blockUid, newContent);
    updateCursorPosition();
  }
}
