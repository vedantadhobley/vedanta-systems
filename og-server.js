/**
 * OG Meta Tag Server.
 *
 * Generates dynamic Open Graph + Twitter Card HTML for social-media
 * crawlers. nginx routes crawler requests here via
 * `error_page 418 = @og_server` (see `nginx.conf`); requests arrive
 * with the `X-Is-Crawler: 1` header set by nginx. Looks up event
 * details by the `v=<event_id>` query param against the retained target
 * projection. Historical shares therefore keep their fixture metadata after
 * the event leaves the bounded public snapshot.
 *
 * Runs alongside nginx in the `vedanta-systems-prod` container
 * (started by `start.sh`).
 */

const http = require('http');
const https = require('https');

const PORT = 3002;
const API_BASE = process.env.API_URL || 'http://vedanta-systems-prod-api:3001';

// Fetch JSON from URL with timeout
const FETCH_TIMEOUT_MS = 5000; // 5 second timeout

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    // Add timeout
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Fetch timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`));
    });
  });
}

// Resolve the retained event and optional media state through the BFF.
async function findEvent(eventId, shareId) {
  try {
    const query = shareId ? `?share_id=${encodeURIComponent(shareId)}` : '';
    const data = await fetchJson(
      `${API_BASE}/api/found-footy/event/${encodeURIComponent(eventId)}${query}`,
    );
    if (!data?.found || !data.fixture) return null;
    const event = data.fixture.events?.find(candidate => candidate._event_id === eventId);
    return event ? { fixture: data.fixture, event, mediaState: data.media?.state || null } : null;
  } catch (e) {
    console.error('Error finding event:', e);
    return null;
  }
}

// Event display label. Mirror of formatEventDetail() in
// src/components/found-footy-browser.tsx — keep the two in sync by hand (og-server is
// CommonJS + prod-only, so it can't import the TS version).
function eventLabel(detail, kind) {
  if (kind === 'card') return 'Red Card';
  if (kind === 'penalty-miss') return 'Penalty Miss';
  switch ((detail || '').toLowerCase()) {
    case 'normal goal': return 'Goal';
    case 'penalty': return 'Penalty Goal';
    case 'own goal': return 'Own Goal';
    case 'red card': return 'Red Card';
    case 'missed penalty': return 'Penalty Miss';
    default: return detail || 'Goal';
  }
}

/**
 * Generate the share title.
 *
 * Scoring (goal / penalty goal / own goal):
 *   "<scorer>[ (assister | pen. | o.g.)] — Home (X) - Y Away"
 *   Parens sit on the team whose score went up (event._scoring_team). An own goal's scorer is
 *   on the OTHER team, so we never attach a team to the name — the parens disambiguate which
 *   side scored. Only a normal goal carries an assister; penalty/own get a (pen.)/(o.g.) tag.
 *
 * Non-scoring (red card / missed penalty):
 *   "<player> (<team>) — <label>", no score line. Here event._scoring_team is the player's own
 *   team, so naming it is unambiguous.
 */
function generateEventTitle(fixture, event) {
  const { teams, goals } = fixture;
  const player = event.player?.name || 'Unknown';
  const teamName = event._scoring_team === 'home' ? teams.home.name : teams.away.name;

  if (event._kind === 'card' || event._kind === 'penalty-miss') {
    return `${player} (${teamName}) — ${eventLabel(event.detail, event._kind)}`;
  }

  const homeScore = event._score_after?.home ?? goals?.home ?? 0;
  const awayScore = event._score_after?.away ?? goals?.away ?? 0;
  const scoreLine = event._scoring_team === 'home'
    ? `${teams.home.name} (${homeScore}) - ${awayScore} ${teams.away.name}`
    : `${teams.home.name} ${homeScore} - (${awayScore}) ${teams.away.name}`;

  const detail = (event.detail || '').toLowerCase();
  let tag = '';
  if (detail === 'penalty') tag = ' (pen.)';
  else if (detail === 'own goal') tag = ' (o.g.)';
  else if (event.assist?.name) tag = ` (${event.assist.name})`; // normal goal only

  return `${player}${tag} — ${scoreLine}`;
}

/**
 * Generate event display subtitle: "45' Goal - Scorer Name (Assister Name)".
 */
function generateEventSubtitle(event) {
  const timeStr = event.time?.extra
    ? `${event.time.elapsed}+${event.time.extra}'`
    : `${event.time?.elapsed || '?'}'`;

  const eventType = eventLabel(event.detail, event._kind);
  const scorerName = event.player?.name || 'Unknown';
  const assistName = event.assist?.name;

  if (assistName) {
    return `${timeStr} ${eventType} - ${scorerName} (${assistName})`;
  }
  return `${timeStr} ${eventType} - ${scorerName}`;
}

// Generate OG HTML for a shared clip, keyed on the stable share_id.
//
// The share_id resolves to the current best retained clip when a better clip
// supersedes an older one. Removed or retention-reclaimed media returns 410;
// never-minted shares return 404. We point og:video at
// the shim's byte-streaming endpoint (`/api/found-footy/video/:shareId`) — a same-origin
// HTTPS video/mp4 with Range support, which is exactly what iMessage/Twitter need for an
// inline player. Because the OG URL is the *stable* share_id, we never re-mint per clip
// version: unfurlers cache a snapshot at share time, and opening the link always resolves
// to the current best.
function generateVideoOgHtml(fixture, event, shareId, mediaState) {
  const { league } = fixture;

  const title = generateEventTitle(fixture, event);
  let description = generateEventSubtitle(event);
  if (league?.name) {
    description += ` | ${league.name}`;
  }

  // Build the video URL straight from the share_id. It may have been SUPERSEDED (no longer among
  // the event's current videos), but /video/:shareId still self-resolves to the current best
  // clip — so we don't require a match against the current list (that would drop the video on a
  // superseded share). Use the matched clip's real dimensions when it's still present.
  let videoUrl = null;
  let vw = 1280, vh = 720; // 16:9 fallback; players read the real dimensions from the video itself
  if (shareId && mediaState === 'available') {
    videoUrl = `https://vedanta.systems/api/found-footy/video/${encodeURIComponent(shareId)}`;
    const video = event._s3_videos?.find(v => v.url?.includes(shareId));
    if (video && video.width && video.height) { vw = video.width; vh = video.height; }
  }

  // Use site OG image as fallback (a real per-clip poster frame is a future enhancement).
  const imageUrl = 'https://vedanta.systems/og-image.png?v=3';
  const encodedEventId = encodeURIComponent(event._event_id);
  const pageUrl = shareId
    ? `https://vedanta.systems/workspace/found-footy?v=${encodedEventId}&s=${encodeURIComponent(shareId)}`
    : `https://vedanta.systems/workspace/found-footy?v=${encodedEventId}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Found Footy</title>

  <!-- Open Graph -->
  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="Vedanta Systems">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  ${videoUrl ? `<meta property="og:video" content="${videoUrl}">
  <meta property="og:video:secure_url" content="${videoUrl}">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="${vw}">
  <meta property="og:video:height" content="${vh}">` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${videoUrl ? 'player' : 'summary_large_image'}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${imageUrl}">
  ${videoUrl ? `<meta name="twitter:player" content="${pageUrl}">
  <meta name="twitter:player:stream" content="${videoUrl}">
  <meta name="twitter:player:stream:content_type" content="video/mp4">
  <meta name="twitter:player:width" content="${vw}">
  <meta name="twitter:player:height" content="${vh}">` : ''}

  <!-- Redirect to actual page -->
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
</head>
<body>
  <p>Redirecting to <a href="${pageUrl}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;
}

// Generate default OG HTML for site pages
function generateDefaultOgHtml(path) {
  let title = 'Vedanta Systems';

  if (path.includes('/workspace/found-footy')) {
    title = 'Found Footy | Vedanta Systems';
  } else if (path.includes('/workspace')) {
    title = 'Workspace | Vedanta Systems';
  }

  const pageUrl = `https://vedanta.systems${path}`;
  const imageUrl = 'https://vedanta.systems/og-image.png?v=3';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Vedanta Systems">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- Redirect to actual page -->
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
</head>
<body>
  <p>Redirecting to <a href="${pageUrl}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const eventId = url.searchParams.get('v');
    const shareId = url.searchParams.get('s');

    console.log(`[OG Server] ${req.method} ${path}`);

    let html;
    if (eventId) {
      const result = await findEvent(eventId, shareId);
      if (result) {
        html = generateVideoOgHtml(result.fixture, result.event, shareId, result.mediaState);
      } else {
        html = generateDefaultOgHtml(path);
      }
    } else {
      html = generateDefaultOgHtml(path);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    console.error('[OG Server] Error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`[OG Server] Running on port ${PORT}`);
});
