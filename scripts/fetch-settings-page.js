import http from "http";

const url = "http://localhost:8080/";

console.log("Fetching root:", url, "...");

const req = http.get(url, (res) => {
  console.log("Status Code:", res.statusCode);
  console.log("Headers:", res.headers);

  let body = "";
  res.on("data", (chunk) => {
    body += chunk;
  });

  res.on("end", () => {
    console.log("\nResponse length:", body.length);
    console.log("\n--- Content Snippet (first 1000 chars) ---");
    console.log(body.substring(0, 1000));
  });
});

req.on("error", (err) => {
  console.error("Fetch failed:", err.message);
});

req.end();
