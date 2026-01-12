// ====================
// Home Page
// ====================
function Home() {
  return h("div", { style: { padding: "2rem", textAlign: "center" } },
    h("h1", null, "Welcome to My App"),
    h("p", null, "Đây là trang chủ"),
    h(Link, { to: "/auth", children: "Đi đến Đăng nhập / Đăng ký"}),
    h("br"), h("br"),
    h(Link, { to: "/dashboard", children: "Dashboard (yêu cầu đăng nhập)"})
  );
}

// ====================
// Routes
// ====================
window.App.Router.addRoute("/", Home);
window.App.Router.addRoute("/auth", AuthPage);
window.App.Router.addRoute("/dashboard", Dashboard);
window.App.Router.addRoute("/reset-password", ResetPasswordPage);
window.App.Router.addRoute("/profile", ProfileEdit);
window.App.Router.addRoute("/tasks", MyTasks);
window.App.Router.addRoute("/tasks/publictasks", PublicTasks);

// Navbar đơn giản
window.App.Router.navbarDynamic({
  navbar: () => h("nav", {
    style: {
      background: "#333",
      color: "white",
      padding: "1rem",
      textAlign: "center"
    }
  },
    h(Link, { to: "/", style: { color: "white", margin: "0 1rem" }, children: "Home"}),
    h(Link, { to: "/auth", style: { color: "white", margin: "0 1rem" }, children: "Auth"}),
    h(Link, { to: "/dashboard", style: { color: "white", margin: "0 1rem" }, children: "Dashboard" }),
    h(Link, { to: "/tasks", style: { color: "white", margin: "0 1rem" }, children: "Tasks" }),
    h(Link, { to: "/tasks/publictasks", style: { color: "white", margin: "0 1rem" }, children: "Public tasks" })
  )
});

// ====================
// Khởi động App
// ====================
const mountEl = document.getElementById("app");
window.App.Router.init(mountEl, { hash: false }); // Dùng history mode

// Fallback 404
window.App.Router.setNotFound(() => h("div", { style: { padding: "2rem", textAlign: "center" } },
  h("h1", null, "404 - Không tìm thấy trang")
));