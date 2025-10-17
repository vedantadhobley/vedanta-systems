import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import './App.css'

function App() {
  return (
    <div className="w-full min-h-screen bg-black flex items-center justify-center p-4">
      <GitHubContributionGraph username="vedantadhobley" />
    </div>
  )
}

export default App
