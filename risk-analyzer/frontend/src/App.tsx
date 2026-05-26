import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { KnowledgeBasePage } from "@/pages/KnowledgeBasePage"
import { AnalysisPage } from "@/pages/AnalysisPage"
import { DraftingPage } from "@/pages/DraftingPage"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<KnowledgeBasePage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/draft" element={<DraftingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

