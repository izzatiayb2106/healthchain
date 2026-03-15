import { BrowserRouter as Router, useRoutes } from 'react-router-dom'
import './App.css'
import routes from './routes'

function AppRoutes() {
  const element = useRoutes(routes)
  return element
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}

export default App
