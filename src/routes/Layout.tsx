import { Navigate, Outlet, useLocation } from "react-router";

const whiteList = ["/protected"];

export const Layout = () => {
  const location = useLocation();
  const { account } =
    JSON.parse(localStorage.getItem("faceAuth") ?? "{}") || {};

  if (!account && whiteList.includes(location.pathname)) {
    return <Navigate to="/" />;
  }

  if (account && !whiteList.includes(location.pathname)) {
    return <Navigate to="/protected" />;
  }

  return (
    <div className="h-screen flex flex-col justify-between">
      <Outlet />
    </div>
  );
};
