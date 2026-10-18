// The default presentation uses no Tavus SDK, connection, media or minutes.
if (new URLSearchParams(location.search).get("mode") === "live")
  import("./live-app.js");
else import("./simulation-app.js");
