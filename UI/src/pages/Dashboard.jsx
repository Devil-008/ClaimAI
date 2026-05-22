import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Sidebar from '../components/Sidebar'
import TopBar  from '../components/TopBar'

// ── Policyholder pages
import PolicyholderHome  from './dashboard/PolicyholderHome'
import ClaimsList        from './dashboard/ClaimsList'
import ClaimDetail       from './dashboard/ClaimDetail'
import FNOLWizard        from './dashboard/FNOLWizard'
import MyPolicies        from './dashboard/MyPolicies'
import AddPolicyWizard   from './dashboard/AddPolicyWizard'
import PolicyDetail      from './dashboard/PolicyDetail'
import KnowledgeGraph    from './dashboard/KnowledgeGraph'
import RagChat           from './dashboard/RagChat'
import Notifications     from './dashboard/Notifications'

// ── Other persona pages
import AdjusterHome   from './dashboard/AdjusterHome'
import SIUHome        from './dashboard/SIUHome'
import SupervisorHome from './dashboard/SupervisorHome'
import ITOpsHome      from './dashboard/ITOpsHome'

import './Dashboard.css'

/* Default home per role */
const HOME_MAP = {
  policyholder:     <PolicyholderHome />,
  adjuster:         <AdjusterHome />,
  siu_investigator: <SIUHome />,
  supervisor:       <SupervisorHome />,
  it_ops:           <ITOpsHome />,
}

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="dashboard-layout">
      <Sidebar role={user.role}/>
      <div className="dashboard-main">
        <TopBar user={user}/>
        <div className="dashboard-content">
          <Routes>
            {/* ── Default home (role-specific) */}
            <Route index element={HOME_MAP[user.role] || <Navigate to="/login" replace/>}/>

            {/* ── General sub-pages */}
            <Route path="notifications"   element={<Notifications/>}/>

            {/* ── Policyholder sub-pages */}
            <Route path="claims"          element={<ClaimsList/>}/>
            <Route path="claims/new"      element={<FNOLWizard/>}/>
            <Route path="claims/:id"      element={<ClaimDetail/>}/>
            <Route path="policies"        element={<MyPolicies/>}/>
            <Route path="policies/add"    element={<AddPolicyWizard/>}/>
            <Route path="policies/:id"    element={<PolicyDetail/>}/>
            <Route path="knowledge-graph" element={<KnowledgeGraph/>}/>
            <Route path="rag-chat"        element={<RagChat/>}/>

            {/* ── Adjuster sub-pages (placeholders — expand later) */}
            <Route path="adjuster/queue"   element={<AdjusterHome/>}/>

            {/* ── SIU sub-pages */}
            <Route path="siu/cases"        element={<SIUHome/>}/>

            {/* ── Supervisor sub-pages */}
            <Route path="supervisor/kpis"  element={<SupervisorHome/>}/>

            {/* ── IT/Ops sub-pages */}
            <Route path="ops/health"       element={<ITOpsHome/>}/>

            {/* ── Catch-all → home */}
            <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
          </Routes>
        </div>
      </div>
    </div>
  )
}
