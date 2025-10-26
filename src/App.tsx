import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import { Header } from '@/components/header'
import './App.css'

function App() {
  return (
    <div className="w-full min-h-screen bg-black flex flex-col">
      <Header />
      <div className="flex-1 flex items-start justify-center pt-8">
        <GitHubContributionGraph username="vedantadhobley" />
      </div>
    </div>
  )
}

export default App
