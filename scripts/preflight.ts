import net from "net";
import { loadEnv } from "../src/lib/env";

(async () => {
  const env = loadEnv();
  // ensure port available
  const port = Number(env.PORT);
  await new Promise<void>((resolve, reject) => {
    const srv = net.createServer().once("error", reject).once("listening", () => {
      srv.close(); resolve();
    }).listen(port);
  });

  console.log("ENV OK; PORT OK");
})();
