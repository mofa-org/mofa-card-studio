import { Routes, Route } from 'react-router-dom'
import Gallery from './pages/Gallery'
import Studio from './pages/Studio'

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/studio/:styleId" element={<Studio />} />
      </Routes>
    </div>
  )
}
