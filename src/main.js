const experience = new URLSearchParams(location.search).get("experience");
if (/^\/page\/?$/.test(location.pathname)) import("./landing/app.js");
else if (/^\/demo\/?$/.test(location.pathname)) import("./demo/app.js");
else if (experience === "classic") import("./classic.js");
else if (experience === "operations") import("./operations/app.js");
else if (experience === "luma") import("./luma/app.js");
else import("./city/app.js");
