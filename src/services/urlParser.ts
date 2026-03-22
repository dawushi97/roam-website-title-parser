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

const MARKDOWN_LINK_REGEX = /\[(?:\\.|[^\]\\])*\]\((?:\\.|[^\\)])*\)/g;

const BILIBILI_BVID_PATTERN = /BV[0-9A-Za-z]{10}/i;

function isBilibiliUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'bilibili.com'
      || hostname.endsWith('.bilibili.com')
      || hostname === 'b23.tv';
  } catch {
    return false;
  }
}

function extractBilibiliBvid(url: string): string | null {
  try {
    const parsed = new URL(url);
    const queryBvid = parsed.searchParams.get('bvid') || parsed.searchParams.get('BVID');
    if (queryBvid) {
      const queryMatch = queryBvid.match(BILIBILI_BVID_PATTERN);
      if (queryMatch) return queryMatch[0];
    }

    const pathMatch = parsed.pathname.match(BILIBILI_BVID_PATTERN);
    if (pathMatch) return pathMatch[0];

    const urlMatch = url.match(BILIBILI_BVID_PATTERN);
    if (urlMatch) return urlMatch[0];
  } catch {
    const urlMatch = url.match(BILIBILI_BVID_PATTERN);
    if (urlMatch) return urlMatch[0];
  }
  return null;
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
const TITLE_CACHE_MAX_ENTRIES = 500;
const RESOLVED_TITLE_CACHE = new Map<string, string>();
const IN_FLIGHT_TITLE_REQUESTS = new Map<string, Promise<string | null>>();

function cacheResolvedTitle(url: string, title: string): void {
  if (RESOLVED_TITLE_CACHE.has(url)) {
    RESOLVED_TITLE_CACHE.delete(url);
  }

  RESOLVED_TITLE_CACHE.set(url, title);

  if (RESOLVED_TITLE_CACHE.size > TITLE_CACHE_MAX_ENTRIES) {
    const oldestKey = RESOLVED_TITLE_CACHE.keys().next().value;
    if (oldestKey) RESOLVED_TITLE_CACHE.delete(oldestKey);
  }
}

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

function getBilibiliTitleFromApiPayload(payload: any): string | null {
  if (payload?.code !== 0) return null;
  if (typeof payload?.data?.title !== 'string') return null;
  return payload.data.title;
}

async function fetchBilibiliApiTitle(apiUrl: string): Promise<string | null> {
  const response = await fetchWithTimeout(apiUrl);
  if (!response.ok) return null;

  const payload = await response.json();
  return getBilibiliTitleFromApiPayload(payload);
}

async function getBilibiliTitleViaJsonp(bvid: string): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const callbackName = `__roamBilibiliCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const jsonpUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}&jsonp=jsonp&callback=${callbackName}`;

  return await new Promise((resolve) => {
    const script = document.createElement('script');
    let settled = false;
    let timeoutId = 0;

    const cleanup = () => {
      delete (window as any)[callbackName];
      script.remove();
    };

    const finish = (title: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(title);
    };

    (window as any)[callbackName] = (payload: any) => {
      finish(getBilibiliTitleFromApiPayload(payload));
    };

    script.src = jsonpUrl;
    script.async = true;
    script.onerror = () => finish(null);

    timeoutId = window.setTimeout(() => finish(null), CONFIG.REQUEST_TIMEOUT);
    const mountNode = document.head || document.body || document.documentElement;
    mountNode.appendChild(script);
  });
}

// Bilibili video API supports lookup by BV id.
async function getBilibiliTitle(url: string): Promise<string | null> {
  const bvid = extractBilibiliBvid(url);
  if (!bvid) return null;

  try {
    const jsonpTitle = await getBilibiliTitleViaJsonp(bvid);
    if (jsonpTitle) return cleanTitle(jsonpTitle, url);
  } catch {
    // Ignore JSONP failures and continue with fetch-based fallbacks.
  }

  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  try {
    const directTitle = await fetchBilibiliApiTitle(apiUrl);
    if (directTitle) return cleanTitle(directTitle, url);
  } catch {
    // Ignore direct-fetch failures (e.g. browser CORS), then try proxy.
  }

  try {
    const proxiedTitle = await fetchBilibiliApiTitle(`${CORS_PROXY}/${apiUrl}`);
    if (proxiedTitle) return cleanTitle(proxiedTitle, url);
  } catch (error) {
    console.error('Error fetching Bilibili title via BV API:', error);
  }

  return null;
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

function stripMarkdownLinks(text: string): string {
  return text.replace(MARKDOWN_LINK_REGEX, '');
}

function normalizeLeadingBracketLabels(text: string): string {
  let remaining = text.trim();
  const labels: string[] = [];

  while (remaining.startsWith('[')) {
    const match = remaining.match(/^\[([^[\]]+)\]\s*/);
    if (!match) break;

    const label = match[1].trim();
    const looksLikeLabel = /[A-Za-z]/.test(label) && label.length <= 40;
    if (!looksLikeLabel) break;

    labels.push(label);
    remaining = remaining.slice(match[0].length).trimStart();
  }

  if (labels.length === 0) return text;
  if (!remaining) return labels.join(' / ');

  return `${labels.join(' / ')}: ${remaining}`;
}

function sanitizeRoamMarkdownLinkText(text: string): string {
  const normalized = normalizeLeadingBracketLabels(text);

  return normalized
    // Roam's Markdown parser does not reliably honor escaped square brackets
    // inside link text, so use a visible fallback only where brackets remain.
    .replace(/\[/g, '［')
    .replace(/\]/g, '］');
}

export const __test__ = {
  normalizeLeadingBracketLabels,
  sanitizeRoamMarkdownLinkText,
  stripMarkdownLinks,
};

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
// Bilibili: BV API lookup via JSONP (then direct fetch, then proxy) → fallback generic HTML parsing
// Others: generic HTML parsing via proxy
async function resolveWebsiteTitle(url: string): Promise<string | null> {
  if (isYouTubeUrl(url)) {
    const title = await getYouTubeTitle(url);
    if (title) return title;
  }

  if (isBilibiliUrl(url)) {
    const title = await getBilibiliTitle(url);
    if (title) return title;
  }

  return await getGenericWebsiteTitle(url);
}

async function getWebsiteTitle(url: string): Promise<string | null> {
  if (RESOLVED_TITLE_CACHE.has(url)) {
    return RESOLVED_TITLE_CACHE.get(url) || null;
  }

  const inFlightRequest = IN_FLIGHT_TITLE_REQUESTS.get(url);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = resolveWebsiteTitle(url)
    .then((title) => {
      if (title) {
        cacheResolvedTitle(url, title);
      }
      return title;
    })
    .finally(() => {
      IN_FLIGHT_TITLE_REQUESTS.delete(url);
    });

  IN_FLIGHT_TITLE_REQUESTS.set(url, request);
  return request;
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

  const contentWithoutMarkdown = stripMarkdownLinks(currentContent);

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

  const urlWithMarkdownFormat = `[${sanitizeRoamMarkdownLinkText(title)}](${url})`;

  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlRegex = new RegExp(`(?<!\\()${escapedUrl}(?!\\))`, 'g');
  const newContent = originalContent.replace(urlRegex, urlWithMarkdownFormat);

  if (newContent !== originalContent) {
    await updateBlock(blockUid, newContent);
    updateCursorPosition();
  }
}
