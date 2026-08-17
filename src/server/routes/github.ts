import { Router } from 'express'

const CACHE_TTL_MS = 15 * 60 * 1000

type ContributionLevel =
  | 'NONE'
  | 'FIRST_QUARTILE'
  | 'SECOND_QUARTILE'
  | 'THIRD_QUARTILE'
  | 'FOURTH_QUARTILE'

interface GitHubConfig {
  token: string
  username: string
}

interface ContributionDay {
  date: string
  count: number
  level: ContributionLevel
}

interface ContributionPayload {
  username: string
  contributions: ContributionDay[]
  fetchedAt: string
}

interface GitHubGraphQLResponse {
  data?: {
    viewer?: { login: string }
    user?: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: Array<{
            contributionDays: Array<{
              contributionCount: number
              contributionLevel: ContributionLevel
              date: string
            }>
          }>
        }
      }
    } | null
  }
  errors?: Array<{ message: string }>
}

interface CachedPayload {
  payload: ContributionPayload
  expiresAt: number
}

export function createGitHubRouter(config: GitHubConfig): Router {
  const router = Router()
  let cache: CachedPayload | null = null
  let inFlight: Promise<ContributionPayload> | null = null

  const fetchContributions = async (): Promise<ContributionPayload> => {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'vedanta-systems',
      },
      body: JSON.stringify({
        query: `
          query ContributionCalendar($username: String!) {
            viewer {
              login
            }
            user(login: $username) {
              contributionsCollection {
                contributionCalendar {
                  weeks {
                    contributionDays {
                      contributionCount
                      contributionLevel
                      date
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { username: config.username },
      }),
    })

    if (!response.ok) {
      throw new Error(`GitHub GraphQL returned HTTP ${response.status}`)
    }

    const result = await response.json() as GitHubGraphQLResponse
    if (result.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${result.errors[0].message}`)
    }

    const viewer = result.data?.viewer?.login
    if (!viewer || viewer.toLowerCase() !== config.username.toLowerCase()) {
      throw new Error('GitHub token owner does not match the configured contribution user')
    }

    const weeks = result.data?.user?.contributionsCollection.contributionCalendar.weeks
    if (!weeks) {
      throw new Error('GitHub contribution calendar was missing from the response')
    }

    return {
      username: config.username,
      contributions: weeks.flatMap((week) =>
        week.contributionDays.map((day) => ({
          date: day.date,
          count: day.contributionCount,
          level: day.contributionLevel,
        })),
      ),
      fetchedAt: new Date().toISOString(),
    }
  }

  const refreshCache = (): Promise<ContributionPayload> => {
    if (!inFlight) {
      inFlight = fetchContributions()
        .then((payload) => {
          cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS }
          return payload
        })
        .finally(() => {
          inFlight = null
        })
    }
    return inFlight
  }

  router.get('/contributions', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900')

    if (!config.token) {
      return res.status(503).json({ error: 'GitHub contributions are not configured' })
    }

    if (cache && cache.expiresAt > Date.now()) {
      res.set('X-Contributions-Cache', 'hit')
      return res.json(cache.payload)
    }

    try {
      const payload = await refreshCache()
      res.set('X-Contributions-Cache', 'refresh')
      return res.json(payload)
    } catch (error) {
      console.error('[github] Failed to refresh contribution calendar:', error)
      if (cache) {
        res.set('X-Contributions-Cache', 'stale')
        res.set('Warning', '110 - "Response is stale"')
        return res.json(cache.payload)
      }
      return res.status(502).json({ error: 'GitHub contribution calendar is unavailable' })
    }
  })

  return router
}
