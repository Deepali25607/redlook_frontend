// Lazy-loaded admin portal entry point.
//
// Pulling AdminAuthProvider + AdminApp behind this default-export wrapper lets
// App.jsx load the admin portal with React.lazy(), so the entire ~8.7k-line
// admin bundle (and its admin-only dependency graph) is split into a separate
// chunk that the storefront never downloads. Customers — the overwhelming
// majority of traffic — only pay for the admin code if they actually open an
// /admin route. Shared providers (ToastProvider / ThemeProvider) stay in App
// and wrap this component, so admin auth/theme context is unchanged.
import { AdminAuthProvider, AdminApp } from './admin';

export default function AdminPortal({ route, navigate }) {
  return (
    <AdminAuthProvider>
      <AdminApp route={route} navigate={navigate} />
    </AdminAuthProvider>
  );
}
