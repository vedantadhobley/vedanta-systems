import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import './App.css'

function App() {
  return (
    <div className="w-full h-screen bg-black flex items-start justify-center overflow-hidden">
      <GitHubContributionGraph username="vedantadhobley" />
    </div>
  )
}

export default App
