import { Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Gallery from './pages/Gallery'
import Studio from './pages/Studio'

export default function App() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/studio/:styleId" element={<Studio />} />
        </Routes>
      </div>
    </AuthGate>
  )
}
