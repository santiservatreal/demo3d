if (new URLSearchParams(location.search).get("experience") === "classic")
  import("./classic.js");
else import("./operations/app.js");
