// Compatibility entry point: the React source is now served by Vite.
// pnpm start runs the same development server.
import("vite")
  .then(async ({ createServer }) => {
    const server = await createServer();
    await server.listen();
    server.printUrls();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
