export default {
  input: ".tmp/openapi/openapi.json",
  output: ".tmp/sdk-candidates/typescript/generated",
  plugins: [
    "@hey-api/client-fetch",
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      operations: {
        strategy: "byTags",
      },
    },
  ],
};
