import { createBrowserRouter, Outlet } from "react-router-dom";
import { HomePage } from "@/pages/Home";
import { CourseDetailsPage } from "@/pages/CourseDetails";
import { AppShell } from "./shell";

const Root = () => (
  <AppShell>
    <Outlet />
  </AppShell>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "/course/:code",
        element: <CourseDetailsPage />,
      },
    ],
  },
]);

