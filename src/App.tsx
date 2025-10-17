import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import './App.css'
import { useState } from 'react'

interface Project {
  name: string
  description: string
}

const projects: Project[] = [
  {
    name: 'Legal Tender',
    description: 'Digital asset management and trading platform.',
  },
  {
    name: 'Found Footy',
    description: 'Football analytics and player discovery engine.',
  },
  {
    name: 'Nimslo-D',
    description: 'Data processing and visualization toolkit.',
  },
]

function App() {
  const [showProjects, setShowProjects] = useState(false)

  return (
    <div className="w-full min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="border-b border-corpo-border bg-corpo-black sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6">
          <h1 className="text-base font-mono text-foreground tracking-wider">
            vedanta.systems
          </h1>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
        <div className="space-y-12">
          <GitHubContributionGraph username="vedantadhobley" />

          <div className="space-y-4">
            <Button 
              variant="default" 
              className="w-full text-base py-6"
              onClick={() => {
                setShowProjects(!showProjects)
              }}
            >
              {showProjects ? 'Hide Projects' : 'View Projects'}
            </Button>
            
            {showProjects && (
              <div className="space-y-4 animate-in fade-in duration-300">
                {projects.map((project, idx) => (
                  <Card 
                    key={project.name}
                    style={{
                      animation: `fadeInSlide 0.3s ease-out ${idx * 0.1}s both`
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <CardDescription className="mt-2">{project.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-mono text-foreground uppercase tracking-wider">Find Me</h2>
            <a
              href="https://linkedin.com/in/VedantaDhobley"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start text-base py-6">
                LinkedIn
              </Button>
            </a>
            <a
              href="https://github.com/vedantadhobley"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start text-base py-6">
                GitHub
              </Button>
            </a>
            <a
              href="/resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full justify-start text-base py-6">
                Resume
              </Button>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-corpo-border text-xs text-corpo-border">
          <p>This site is your digital business card.</p>
          <p className="mt-2">Built with React, Vite, Tailwind CSS. Deployed on AWS.</p>
        </div>
      </div>
    </div>
  )
}

export default App
