import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from '@lowes-tech/bds-react';
import { AppHeader } from './components/AppHeader.jsx';
import { Page } from './components/Layout.jsx';
import { useFeatures } from './useMeta.js';
import AssistantIntake from './pages/AssistantIntake.jsx';
import IntakePage from './pages/IntakePage.jsx';
import BoardPage from './pages/BoardPage.jsx';

/** "/" is the conversational intake when the assistant is on; otherwise the structured form. */
function IntakeHome() {
  const features = useFeatures();
  if (!features) return <Page><Spinner show inline /></Page>;
  return features.assistant ? <AssistantIntake /> : <IntakePage />;
}

export default function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<IntakeHome />} />
        <Route path="/form" element={<IntakePage />} />
        <Route path="/requests" element={<BoardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
