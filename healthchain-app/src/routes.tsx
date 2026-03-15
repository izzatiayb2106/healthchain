import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import DoctorDashboard from "./pages/doctor/doctor";
import VerifierDashboard from "./pages/verifier/verifier";
import PatientDashboard from "./pages/patient/patient";
import AdminDashboard from "./pages/admin/admin";
import Login from "./pages/login/login";

function AdminOnlyRoute() {
  const role = (localStorage.getItem("hc_role") || "").toLowerCase();
  if (role !== "admin") {
    return <Navigate to="/login" replace />;
  }
  return <AdminDashboard />;
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Login/>
  },
  {
    path: '/login',
    element: <Login/>
  },
  {
    path: '/doctor',
    element: <DoctorDashboard />
  },
  {
    path: '/patient',
    element: <PatientDashboard />
  },
  {
    path: '/verifier',
    element: <VerifierDashboard />
  },
  {
    path: '/admin',
    element: <AdminOnlyRoute />
  }
]

export default routes