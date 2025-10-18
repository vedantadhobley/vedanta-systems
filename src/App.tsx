import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import './App.css'

function App() {
  return (
    <div className="w-full bg-black flex items-start justify-center overflow-hidden" style={{ height: '100dvh' }}>
      <GitHubContributionGraph username="vedantadhobley" />
    </div>
  )
}

export default App
