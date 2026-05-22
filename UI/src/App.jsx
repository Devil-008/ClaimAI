import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import { useAuthStore } from './store/authStore'

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1F2937',
            color: '#F9FAFB',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
          },
        }}
      />
      <Routes>
        <Route path="/"        element={<LandingPage />} />
        <Route path="/login"   element={<LoginPage />} />
        <Route path="/dashboard/*" element={
          <PrivateRoute><Dashboard /></PrivateRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
