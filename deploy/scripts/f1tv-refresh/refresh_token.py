import asyncio, base64, datetime, json, os
from playwright.async_api import async_playwright
from kubernetes import client, config


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
            locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9", "DNT": "1"},
        )
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        """)

        page = await ctx.new_page()

        # route.continue_() lets the browser make the real request (preserving Akamai cookies
        # and TLS fingerprint) while still allowing expect_response to capture the result
        await page.route("**/authenticate/by-password",
                         lambda route, request: asyncio.ensure_future(route.continue_()))

        print("Navigating to login page...")
        await page.goto("https://account.formula1.com/")
        await page.wait_for_load_state("load")
        await page.wait_for_timeout(4000)

        email_sel = "input[name='Login'], input[type='email'], input[id='email']"
        pass_sel  = "input[name='Password'], input[type='password'], input[id='password']"

        await page.wait_for_selector(email_sel, timeout=15000)

        for btn_title in ["Accept All", "Accept all", "Agree", "OK"]:
            try:
                await page.frame_locator("iframe[title='SP Consent Message']") \
                    .locator("button[title='" + btn_title + "']").click(timeout=3000)
                print("Consent dismissed")
                await page.wait_for_timeout(1500)
                break
            except Exception:
                pass

        print("Filling credentials and submitting...")
        await page.fill(email_sel, os.environ["F1TV_EMAIL"])
        await page.fill(pass_sel, os.environ["F1TV_PASSWORD"])

        async with page.expect_response(
            lambda r: "/authenticate/by-password" in r.url, timeout=30000
        ) as resp_info:
            await page.click("button[type='submit']")

        resp = await resp_info.value
        text = await resp.text()
        await browser.close()

        if resp.status != 200:
            raise RuntimeError("Auth failed " + str(resp.status) + ": " + text[:300])
        return json.loads(text)["data"]["subscriptionToken"]


token = asyncio.run(main())
print("Token fetched (" + str(len(token)) + " chars)")

config.load_incluster_config()
ns = "gridwatch"

v1 = client.CoreV1Api()
v1.patch_namespaced_secret(
    "openf1-f1tv", ns,
    {"data": {"token": base64.b64encode(token.encode()).decode()}},
)
print("Secret patched")

apps = client.AppsV1Api()
apps.patch_namespaced_deployment(
    "openf1-ingest-realtime", ns,
    {"spec": {"template": {"metadata": {"annotations": {
        "kubectl.kubernetes.io/restartedAt": datetime.datetime.utcnow().isoformat() + "Z",
    }}}}},
)
print("Deployment restarted")
