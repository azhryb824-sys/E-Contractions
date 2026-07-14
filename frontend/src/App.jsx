import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import NewRequest from './pages/NewRequest'
import ProjectDetail from './pages/ProjectDetail'
import ReviewItems from './pages/ReviewItems'
import ReviewSuggestions from './pages/ReviewSuggestions'
import PriceManagement from './pages/PriceManagement'
import Suppliers from './pages/Suppliers'
import GenerateFiles from './pages/GenerateFiles'
import Settings from './pages/Settings'
import PastProjects from './pages/PastProjects'
import ActivityLog from './pages/ActivityLog'
import Approval from './pages/Approval'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new-request" element={<NewRequest />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/review" element={<ReviewItems />} />
        <Route path="/projects/:id/suggestions" element={<ReviewSuggestions />} />
        <Route path="/projects/:id/files" element={<GenerateFiles />} />
        <Route path="/projects/:id/approval" element={<Approval />} />
        <Route path="/prices" element={<PriceManagement />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/projects" element={<PastProjects />} />
        <Route path="/logs" element={<ActivityLog />} />
      </Routes>
    </Layout>
  )
}
