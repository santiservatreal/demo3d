const experience = new URLSearchParams(location.search).get("experience");
if (experience === "classic") import("./classic.js");
else if (experience === "operations") import("./operations/app.js");
else import("./luma/app.js");
