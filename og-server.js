/**
 * OG Meta Tag Server
 * 
 * Lightweight server that generates dynamic HTML with Open Graph meta tags
 * for social media crawlers. Runs alongside nginx in the frontend container.
 * 
 * Usage:
 * - Nginx detects crawler User-Agent and proxies to this server
 * - Server fetches data from API and returns HTML with dynamic OG tags
 * - Regular users get served by nginx directly (SPA)
 */

const http = require('http');
const https = require('https');

const PORT = 3002;
const API_BASE = process.env.API_URL || 'http://vedanta-systems-prod-api:3001';

// Fetch JSON from URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Find event by ID across all fixture collections
async function findEvent(eventId) {
  try {
    // Fetch all fixtures from the API
    const data = await fetchJson(`${API_BASE}/api/found-footy/fixtures`);
    const allFixtures = [
      ...(data.staging || []),
      ...(data.active || []),
      ...(data.completed || [])
    ];
    
    for (const fixture of allFixtures) {
      const event = fixture.events?.find(e => e._event_id === eventId);
      if (event) {
        return { fixture, event };
      }
    }
    return null;
  } catch (e) {
    console.error('Error finding event:', e);
    return null;
  }
}

// Strip highlight markers from display text
function stripMarkers(text) {
  if (!text) return '';
  return text.replace(/<<|>>/g, '');
}

/**
 * Generate event display title: "Home X-(Y) Away" 
 * Parentheses around scoring team's score (no highlight markers for OG)
 * Uses _score_after (score at moment of goal) and _scoring_team from the event
 */
function generateEventTitle(fixture, event) {
  const { teams, goals } = fixture;
  
  // Use _score_after for the score at this moment, fallback to fixture goals
  const homeScore = event._score_after?.home ?? goals?.home ?? 0;
  const awayScore = event._score_after?.away ?? goals?.away ?? 0;
  
  // Use _scoring_team to determine which team scored
  const scoringTeamIsHome = event._scoring_team === 'home';
  
  if (scoringTeamIsHome) {
    return `${teams.home.name} (${homeScore}) - ${awayScore} ${teams.away.name}`;
  } else {
    return `${teams.home.name} ${homeScore} - (${awayScore}) ${teams.away.name}`;
  }
}

/**
 * Generate event display subtitle: "45' Goal - Scorer Name (Assister Name)"
 */
function generateEventSubtitle(event) {
  const timeStr = event.time?.extra 
    ? `${event.time.elapsed}+${event.time.extra}'` 
    : `${event.time?.elapsed || '?'}'`;
  
  const eventType = event.detail || event.type || 'Goal';
  const scorerName = event.player?.name || 'Unknown';
  const assistName = event.assist?.name;
  
  if (assistName) {
    return `${timeStr} ${eventType} - ${scorerName} (${assistName})`;
  }
  return `${timeStr} ${eventType} - ${scorerName}`;
}

// Generate OG HTML for a shared video
function generateVideoOgHtml(fixture, event, videoHash) {
  const { league } = fixture;
  
  // Generate title and description from raw data
  const title = generateEventTitle(fixture, event);
  let description = generateEventSubtitle(event);
  if (league?.name) {
    description += ` | ${league.name}`;
  }
  
  // Find the specific video if hash provided
  let videoUrl = null;
  if (videoHash && event._s3_videos?.length) {
    const video = event._s3_videos.find(v => v.url?.includes(videoHash));
    if (video?.url) {
      // Make sure it's an absolute URL
      videoUrl = video.url.startsWith('http')
        ? video.url 
        : `https://vedanta.systems${video.url}`;
    }
  }
  
  // Use site OG image as fallback (we could generate thumbnails later)
  const imageUrl = 'https://vedanta.systems/og-image.png?v=3';
  const pageUrl = videoHash 
    ? `https://vedanta.systems/projects/found-footy?v=${event._event_id}&h=${videoHash}`
    : `https://vedanta.systems/projects/found-footy?v=${event._event_id}`;

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
  <meta property="og:video:type" content="video/mp4">` : ''}
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="${videoUrl ? 'player' : 'summary_large_image'}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${imageUrl}">
  ${videoUrl ? `<meta name="twitter:player" content="${pageUrl}">
  <meta name="twitter:player:stream" content="${videoUrl}">
  <meta name="twitter:player:stream:content_type" content="video/mp4">` : ''}
  
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
  
  if (path.includes('/projects/found-footy')) {
    title = 'Found Footy | Vedanta Systems';
  } else if (path.includes('/projects')) {
    title = 'Projects | Vedanta Systems';
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

// HTTP Server
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const eventId = url.searchParams.get('v');
    const videoHash = url.searchParams.get('h');
    
    console.log(`[OG Server] ${req.method} ${path}?v=${eventId}&h=${videoHash}`);
    
    let html;
    
    if (eventId) {
      // Try to find the event and generate dynamic OG tags
      const result = await findEvent(eventId);
      if (result) {
        html = generateVideoOgHtml(result.fixture, result.event, videoHash);
      } else {
        // Event not found, use default
        html = generateDefaultOgHtml(path);
      }
    } else {
      // No event ID, use default OG tags
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
