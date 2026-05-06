const BACKEND_URL = process.env.BACKEND_URL?.trim();
if (!BACKEND_URL) {
  console.error("Missing BACKEND_URL. Define it in .env.local — manually or via pewee.");
  process.exit(1);
}

async function fetchShareData(shortId) {
  const res = await fetch(`${BACKEND_URL}/api/v1/share/${encodeURIComponent(shortId)}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`Error: ${res.status} ${res.statusText}`);
    return null;
  }

  return res.json();
}

async function test() {
  const data = await fetchShareData("Lrgzm");
  if (data) {
    console.log("✅ Fetched share data:");
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log("❌ No data returned");
  }
}

test();
