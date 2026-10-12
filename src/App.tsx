import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AdminRoute } from './components/layout/AdminRoute';
import { LandingPage } from './features/auth/LandingPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { LoginPage } from './features/auth/LoginPage';
import { VerifyPage } from './features/auth/VerifyPage';
import { FeedPage } from './features/feed/FeedPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { CommunityListPage } from './features/community/CommunityListPage';
import { CommunityDetailPage } from './features/community/CommunityDetailPage';
import { CanvasStudioPage } from './features/canvas/CanvasStudioPage';
import { BannerMuralPage } from './features/canvas/BannerMuralPage';
import { PartyLobbyPage } from './features/party/PartyLobbyPage';
import { PartyRoomPage } from './features/party/PartyRoomPage';
import { PersonalChatPage } from './features/chat/PersonalChatPage';
import { AdminDashboardPage } from './features/admin/AdminDashboardPage';

/**
 * Transición entre páginas: la clave de framer-motion es location.pathname,
 * no las rutas en sí — así cualquier navegación (incluida la de los guards)
 * dispara el mismo fundido/deslizamiento sin tener que envolver cada página
 * una por una.
 */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verificar" element={<VerifyPage />} />
          <Route path="/perfil/:nombreArtista" element={<ProfilePage />} />

          <Route path="/feed" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />

          <Route path="/comunidades" element={<ProtectedRoute><CommunityListPage /></ProtectedRoute>} />
          <Route path="/comunidades/:id" element={<ProtectedRoute><CommunityDetailPage /></ProtectedRoute>} />
          <Route path="/comunidades/:id/lienzo" element={<ProtectedRoute><CanvasStudioPage /></ProtectedRoute>} />
          <Route path="/comunidades/:id/banner" element={<ProtectedRoute><BannerMuralPage /></ProtectedRoute>} />

          <Route path="/fiesta" element={<ProtectedRoute><PartyLobbyPage /></ProtectedRoute>} />
          <Route path="/fiesta/:id" element={<ProtectedRoute><PartyRoomPage /></ProtectedRoute>} />

          <Route path="/mensajes" element={<ProtectedRoute><PersonalChatPage /></ProtectedRoute>} />

          <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <AnimatedRoutes />
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
