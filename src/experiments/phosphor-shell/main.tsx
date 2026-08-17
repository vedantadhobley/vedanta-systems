import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '../../index.css'
import PhosphorShellLab from './phosphor-shell-lab'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <PhosphorShellLab />
  </BrowserRouter>,
)
