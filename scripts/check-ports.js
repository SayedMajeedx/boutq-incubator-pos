import http from "http";

const ports = [];
for (let p = 3000; p <= 3005; p++) ports.push(p);
for (let p = 5173; p <= 5180; p++) ports.push(p);
for (let p = 4173; p <= 4178; p++) ports.push(p);
ports.push(8080);

console.log("Scanning broad port list:", ports);

for (const port of ports) {
  const req = http.request(
    {
      host: "localhost",
      port: port,
      path: "/",
      method: "GET",
      timeout: 500,
    },
    (res) => {
      console.log(`Port ${port} is active! Status: ${res.statusCode}, Headers:`, res.headers);
    },
  );

  req.on("error", (err) => {
    // console.log(`Port ${port} is closed.`);
  });

  req.on("timeout", () => {
    req.destroy();
  });

  req.end();
}
